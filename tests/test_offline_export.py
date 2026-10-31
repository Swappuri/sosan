"""Offline export regression checks, including cancellation and encoded timestamps."""
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf

from offline_renderer import analyze_track, StudioRenderer, smooth_spectrum, shape_radius, logo_placement, perimeter_point, spectrum_point, spectrum_samples
from render_settings import validate_settings
from render_worker import run_job


class OfflineExportTests(unittest.TestCase):
    def test_rounded_polygon_corners_are_continuous_and_mirrored(self):
        for shape in ('square', 'triangle'):
            previous = spectrum_point(shape, 115, 0, 8)
            distances = []
            for i in range(1, 4097):
                point = spectrum_point(shape, 115, i / 4096, 8)
                mirror = spectrum_point(shape, 115, 1 - i / 4096, 8)
                distances.append(math.hypot(point[0] - previous[0], point[1] - previous[1]))
                self.assertLess(math.hypot(point[2] - previous[2], point[3] - previous[3]), .04)
                self.assertAlmostEqual(point[0], -mirror[0])
                self.assertAlmostEqual(point[1], mirror[1])
                previous = point
            self.assertLess(max(distances) / min(distances), 1.001)

    def test_polygon_corner_clearance_during_strong_reactions(self):
        for shape in ('square', 'triangle'):
            for energy in (0, .5, 1):
                points = spectrum_samples(shape, 115, 128, 128, np.ones(64) * energy, 90, 1)
                tips = [(p[0] + p[2] * p[6], p[1] + p[3] * p[6]) for p in points]
                def distance_to_bar(x, y, p):
                    dx, dy = p[2] * p[6], p[3] * p[6]
                    t = max(0, min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy)))
                    return math.hypot(x - p[0] - t * dx, y - p[1] - t * dy)
                gaps = []
                for i, point in enumerate(tips):
                    following, mirror = tips[(i + 1) % len(tips)], tips[-i - 1]
                    self.assertAlmostEqual(point[0], -mirror[0])
                    self.assertAlmostEqual(point[1], mirror[1])
                    self.assertGreater(points[i][6], 0)
                    p, n = points[i], points[(i + 1) % len(points)]
                    gaps.append(min(distance_to_bar(*p[:2], n), distance_to_bar(*point, n), distance_to_bar(*n[:2], p), distance_to_bar(*following, p)))
                self.assertLess(max(gaps) / min(gaps), 1.2)

    def test_settings_validation(self):
        for invalid in ({'innerFill': 'red'}, {'innerRing': 'yes'}, {'logoFit': 'invalid'}, {'logoZoom': 201}, {'logoX': -101}, {'logoY': float('nan')}, {'shape': 'invalid'}, {'style': 'invalid'}, {'smoothing': -1}, {'smoothing': 101}, {'smoothing': float('nan')}, {'rotation': -1}, {'rotation': 181}, {'rotation': float('nan')}, {'radius': float('nan')}, {'bars': 33}, {'fps': 500}, {'primary': 'red'}, {'glow': 'yes'}, {'width': 9999}, {'width': 854.0, 'height': 480}):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_settings(invalid)

    def test_rotation_changes_export_and_preserves_mirrored_geometry(self):
        settings = validate_settings({'width': 854, 'height': 480, 'particles': False, 'glow': False, 'pulse': False, 'smoothing': 50})
        levels = np.zeros(64)
        levels[0] = 1
        def frame(rotation):
            return StudioRenderer({**settings, 'rotation': rotation}).frame(0, levels, 0, 0)
        self.assertFalse(np.array_equal(frame(0), frame(90)))
        for rotation in [0, 23, 90, 137, 180]:
            with patch('offline_renderer.cv2.line') as line:
                frame(rotation)
            bars = line.call_args_list
            for i in range(64):
                left, right = bars[i].args, bars[127 - i].args
                self.assertEqual(left[1][1], right[1][1])
                self.assertEqual(left[2][1], right[2][1])
                self.assertLessEqual(abs(left[2][0] + right[2][0] - 854), 1)
            lengths = [np.linalg.norm(np.array(call.args[2]) - call.args[1]) for call in bars[:64]]
            self.assertLessEqual(abs(int(np.argmax(lengths)) - rotation / 180 * 63), 1)

    def test_smoothing_endpoints_and_default(self):
        levels = np.zeros(64)
        levels[32] = 1
        np.testing.assert_array_equal(smooth_spectrum(levels, 0), levels)
        self.assertEqual(smooth_spectrum(levels, 50)[32], 6 / 16)
        self.assertLess(smooth_spectrum(levels, 100)[32], smooth_spectrum(levels, 50)[32])
        self.assertEqual(validate_settings({})['smoothing'], 0)
        self.assertEqual(validate_settings({})['rotation'], 90)

    def test_wave_style_uses_connected_curves(self):
        settings = validate_settings({'style': 'wave', 'particles': False, 'glow': False})
        with patch('offline_renderer.cv2.line') as bars, patch('offline_renderer.cv2.polylines') as curves:
            StudioRenderer(settings).frame(0, np.ones(64), 0, 0)
        bars.assert_not_called()
        self.assertEqual(curves.call_count, 512)
        for i, segment in enumerate(curves.call_args_list):
            following = curves.call_args_list[(i + 1) % curves.call_count]
            np.testing.assert_array_equal(segment.args[1][0][-1], following.args[1][0][0])

    def test_shape_styles_render_distinct_geometry(self):
        frames = []
        for shape in ('circle', 'square', 'triangle'):
            for style in ('bars', 'wave'):
                settings = validate_settings({'shape': shape, 'style': style, 'width': 854, 'height': 480, 'particles': False, 'title': 'Shape'})
                image = StudioRenderer(settings).frame(0, np.ones(64) * .6, 0, 0)
                self.assertEqual(image.shape, (480, 854, 3))
                self.assertTrue(np.isfinite(image).all())
                frames.append(image)
        for first, second in zip(frames, frames[1:]):
            self.assertFalse(np.array_equal(first, second))
        self.assertAlmostEqual(float(shape_radius('triangle', 100, -np.pi / 2)), 100)
        self.assertAlmostEqual(float(shape_radius('triangle', 100, np.pi / 2)), 50)

    def test_logo_placement_and_clipping(self):
        for shape in ('circle', 'square', 'triangle'):
            x, y, w, h = logo_placement(shape, 100, 100, 200, 'contain')
            for px in (x, x + w):
                for py in (y, y + h):
                    self.assertLessEqual(math.hypot(px, py), float(shape_radius(shape, 100, math.atan2(py, px))) + 1e-8)
            for zoom, offset in ((50, -100), (100, 0), (200, 100)):
                settings = validate_settings({'shape': shape, 'width': 854, 'height': 480, 'logoZoom': zoom, 'logoX': offset, 'logoY': offset})
                renderer = StudioRenderer(settings)
                image = np.zeros((480, 854, 3), np.uint8)
                renderer._composite(image, np.full((100, 20, 4), 255, np.uint8), 115, True)
                yy, xx = np.ogrid[:480, :854]
                reach = shape_radius(shape, 115, np.arctan2(yy - 240, xx - 427))
                outside = ((xx - 427) ** 2 + (yy - 240) ** 2) > reach ** 2
                self.assertFalse(np.any(image[outside]))

    def test_logo_fill_reaches_main_outline_for_all_shapes(self):
        for shape in ('circle', 'square', 'triangle'):
            settings = validate_settings({'shape': shape, 'width': 854, 'height': 480, 'glow': False, 'pulse': False, 'particles': False, 'innerRing': False})
            renderer = StudioRenderer(settings)
            renderer.logo = np.full((100, 100, 4), 255, np.uint8)
            image = renderer.frame(0, np.zeros(64), 0, 0)
            for angle in (0, -math.pi / 2, math.pi / 2):
                reach = float(shape_radius(shape, settings['radius'], angle)) - 8
                x, y = round(427 + math.cos(angle) * reach), round(240 + math.sin(angle) * reach)
                self.assertTrue(np.all(image[y, x] > 230), (shape, angle, image[y, x]))

    def test_polygon_perimeter_spacing_and_normals(self):
        for shape, sides in (('square', 4), ('triangle', 3)):
            points = [perimeter_point(shape, 115, (i + .5) / 128) for i in range(128)]
            spacing = 2 * sides * 115 * math.sin(math.pi / sides) / 128
            for i, (x, y, nx, ny) in enumerate(points):
                mx, my, mnx, mny = points[127 - i]
                self.assertAlmostEqual(x, -mx)
                self.assertAlmostEqual(y, my)
                self.assertAlmostEqual(nx, -mnx)
                self.assertAlmostEqual(ny, mny)
                bx, by, bnx, bny = points[(i + 1) % 128]
                if math.hypot(nx - bnx, ny - bny) < 1e-8:
                    self.assertAlmostEqual(math.hypot(bx - x, by - y), spacing)
                    self.assertAlmostEqual((bx - x) * nx + (by - y) * ny, 0)

    def test_inner_fill_and_ring_with_small_logo(self):
        for shape in ('circle', 'square', 'triangle'):
            settings = validate_settings({'shape': shape, 'width': 854, 'height': 480, 'innerFill': '#123456', 'innerRing': False, 'logoZoom': 50, 'particles': False, 'pulse': False, 'glow': False})
            renderer = StudioRenderer(settings)
            renderer.logo = np.full((100, 100, 4), 255, np.uint8)
            image = renderer.frame(0, np.zeros(64), 0, 0)
            reach = float(shape_radius(shape, 115, math.pi / 2)) - 8
            np.testing.assert_array_equal(image[round(240 + reach), 427], [86, 52, 18])
            renderer.settings = {**settings, 'innerRing': True}
            with_ring = renderer.frame(0, np.zeros(64), 0, 0)
            self.assertFalse(np.array_equal(image, with_ring))

    def test_silence_and_settings_affect_output(self):
        settings = validate_settings({'width': 854, 'height': 480, 'glow': False, 'particles': False, 'title': 'TEST'})
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'silence.wav'
            sf.write(path, np.zeros(24000), 48000)
            levels, bass, onsets, duration = analyze_track(path, settings)
        self.assertEqual(levels.shape, (15, 64))
        self.assertEqual(duration, .5)
        self.assertFalse(np.any(levels))
        self.assertFalse(np.any(bass))
        renderer = StudioRenderer(settings)
        quiet = renderer.frame(0, levels[0], 0, 0)
        loud = renderer.frame(1, np.ones(64), 1, 1)
        self.assertFalse(np.array_equal(quiet, loud))
        other = StudioRenderer(validate_settings({**settings, 'primary': '#ff0000', 'radius': 80}))
        self.assertFalse(np.array_equal(quiet, other.frame(0, levels[0], 0, 0)))
        np.testing.assert_array_equal(quiet[0, 0], [20, 17, 11])

    def test_completed_job_wins_exit_status_race(self):
        from server import StudioHandler, PROCESSES
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            path = folder / 'job.json'
            path.write_text(json.dumps({'state': 'rendering'}))
            class ExitingWorker:
                def poll(self):
                    path.write_text(json.dumps({'state': 'complete', 'filename': 'output.mp4'}))
                    return 0
            PROCESSES[folder.name] = ExitingWorker()
            try:
                handler = object.__new__(StudioHandler)
                self.assertEqual(handler.job_status(folder)['state'], 'complete')
            finally:
                PROCESSES.pop(folder.name)

    def test_logo_alpha_is_preserved(self):
        from offline_renderer import cv2
        settings = validate_settings({'width': 854, 'height': 480, 'glow': False, 'particles': False})
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'logo.png'
            asset = np.zeros((40, 40, 4), np.uint8)
            asset[10:30, 10:30] = [20, 40, 240, 255]
            cv2.imwrite(str(path), asset)
            renderer = StudioRenderer(settings, path)
            image = renderer.frame(0, np.zeros(64), 0, 0)
            np.testing.assert_array_equal(image[240, 427], [20, 40, 240])
            np.testing.assert_array_equal(image[240, 350], [20, 17, 11])

    def make_job(self, folder, cancel=False):
        settings = validate_settings({'width': 854, 'height': 480, 'fps': 60, 'glow': False})
        state = {'id': 'test', 'state': 'queued', 'settings': settings, 'filename': 'output.mp4'}
        (folder / 'job.json').write_text(json.dumps(state))
        t = np.arange(24816) / 48000
        sf.write(folder / 'audio', .2 * np.sin(2 * np.pi * 120 * t), 48000, format='WAV')
        if cancel:
            (folder / 'cancel').touch()

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg tools required')
    def test_worker_full_duration_exact_fps_and_audio(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            self.make_job(folder)
            run_job(folder)
            state = json.loads((folder / 'job.json').read_text())
            self.assertEqual(state['state'], 'complete', state)
            info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(folder / 'output.mp4')]))
            video = next(stream for stream in info['streams'] if stream['codec_type'] == 'video')
            self.assertEqual(video['nb_frames'], '32')
            self.assertEqual(video['r_frame_rate'], '60/1')
            self.assertEqual(video['codec_name'], 'h264')
            self.assertTrue(any(stream['codec_type'] == 'audio' and stream['codec_name'] == 'aac' for stream in info['streams']))
            self.assertAlmostEqual(float(info['format']['duration']), 32 / 60, delta=.005)
            self.assertFalse((folder / 'audio').exists())

    @unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg required')
    def test_mid_render_cancellation_cleans_up(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            self.make_job(folder)
            def frame(*args):
                (folder / 'cancel').touch()
                return np.zeros((480, 854, 3), np.uint8)
            with patch('offline_renderer.StudioRenderer') as renderer:
                renderer.return_value.frame.side_effect = frame
                run_job(folder)
            self.assertEqual(json.loads((folder / 'job.json').read_text())['state'], 'cancelled')
            self.assertFalse((folder / 'render.partial.mp4').exists())
            self.assertFalse((folder / 'output.mp4').exists())

    def test_worker_cancellation_does_not_publish_output(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            self.make_job(folder, cancel=True)
            run_job(folder)
            self.assertEqual(json.loads((folder / 'job.json').read_text())['state'], 'cancelled')
            self.assertFalse((folder / 'output.mp4').exists())
            self.assertFalse((folder / 'render.partial.mp4').exists())


if __name__ == '__main__':
    unittest.main()
