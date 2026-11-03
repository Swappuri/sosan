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

from offline_renderer import analyze_track, StudioRenderer, smooth_spectrum, shape_radius, logo_placement
from render_settings import validate_settings
from render_worker import run_job


class OfflineExportTests(unittest.TestCase):
    def test_echoes_require_audio_beats_and_begin_behind_the_shape(self):
        base = {'width': 854, 'height': 480, 'particles': False, 'aura': False, 'glow': False, 'flashes': False, 'pulse': False}
        levels = np.zeros(64)
        plain = StudioRenderer(validate_settings(base)).frame(0, levels, 0, 0)
        renderer = StudioRenderer(validate_settings({**base, 'echoRings': True}))
        np.testing.assert_array_equal(renderer.frame(0, levels, 0, 0), plain)
        np.testing.assert_array_equal(renderer.frame(1, levels, 0, 1), plain)
        np.testing.assert_array_equal(renderer.frame(10, levels, 0, 0), plain)
        renderer = StudioRenderer(validate_settings({**base, 'echoRings': True}))
        for index in range(76):
            frame = renderer.frame(index, levels, 0, 1 if index % 15 == 0 else 0)
        self.assertFalse(np.array_equal(frame, plain))
        self.assertAlmostEqual(renderer.echo_period, .5)

    def test_zero_strength_disables_each_effect(self):
        effects = ('glow', 'aura', 'particles', 'pulse', 'flashes', 'orbitLights', 'echoRings', 'vignette')
        base = {**{key: False for key in effects}, 'width': 854, 'height': 480}
        levels = np.full(64, .5)
        def render(values):
            renderer = StudioRenderer(validate_settings(values))
            renderer.frame(0, levels, .6, 1)
            return renderer.frame(20, levels, .6, 1)
        plain = render(base)
        for effect in effects:
            with self.subTest(effect=effect):
                np.testing.assert_array_equal(render({**base, effect: True, effect + 'Strength': 0}), plain)

    def test_new_effects_are_visible_and_deterministic_for_each_shape(self):
        levels = np.full(64, .5)
        def render(settings, index):
            renderer = StudioRenderer(settings)
            for beat in (0, 15, 30, 45, 60): renderer.frame(beat, levels, .6, 1)
            return renderer.frame(60 + index, levels, .6, 0)
        for shape in ('circle', 'square', 'triangle'):
            base = {'shape': shape, 'width': 854, 'height': 480, 'background': '#666666', 'particles': False, 'glow': False, 'aura': False, 'flashes': False, 'pulse': False}
            plain = render(validate_settings(base), 20)
            for effect in ('orbitLights', 'echoRings', 'vignette'):
                with self.subTest(shape=shape, effect=effect):
                    settings = validate_settings({**base, effect: True})
                    first = render(settings, 20)
                    repeat = render(settings, 20)
                    self.assertFalse(np.array_equal(first, plain))
                    np.testing.assert_array_equal(first, repeat)
                    if effect == 'orbitLights':
                        later = render(settings, 50)
                        self.assertFalse(np.array_equal(first, later))

    def test_aura_can_be_disabled_without_disabling_glow(self):
        off = StudioRenderer(validate_settings({'aura': False, 'glow': True}))
        on = StudioRenderer(validate_settings({'aura': True, 'glow': True}))
        self.assertTrue(np.all(off.base == off.background))
        self.assertFalse(np.array_equal(on.base, off.base))
        self.assertTrue(np.any(off.flash_aura > 0))

    def test_logo_opacity_composites_over_the_surface(self):
        import cv2
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'logo.png'
            cv2.imwrite(str(path), np.full((100, 100, 3), (0, 0, 200), np.uint8))
            values = []
            for opacity in (0, 50, 100):
                settings = validate_settings({'logoOpacity': opacity, 'particles': False, 'glow': False, 'pulse': False})
                renderer = StudioRenderer(settings, path)
                values.append(renderer.frame(0, np.zeros(64), 0, 0)[renderer.center[1], renderer.center[0]].astype(float))
            np.testing.assert_allclose(values[1], (values[0] + values[2]) / 2, atol=1)
            np.testing.assert_array_equal(values[2], [0, 0, 200])

    def test_background_opacity_and_transparency(self):
        import cv2
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'background.png'
            asset = np.zeros((100, 100, 4), np.uint8)
            asset[:] = (0, 0, 255, 255)
            cv2.imwrite(str(path), asset)
            base = StudioRenderer(validate_settings({'backgroundOpacity': 0}), background_path=path).base
            full = StudioRenderer(validate_settings({'backgroundOpacity': 100}), background_path=path).base
            half = StudioRenderer(validate_settings({'backgroundOpacity': 50}), background_path=path).base
            np.testing.assert_array_equal(full[0, 0], [0, 0, 255])
            np.testing.assert_allclose(half[0, 0], (base[0, 0].astype(float) + full[0, 0]) / 2, atol=1)
            asset[:, :, 3] = 0
            cv2.imwrite(str(path), asset)
            transparent = StudioRenderer(validate_settings({}), background_path=path).base
            np.testing.assert_array_equal(transparent, base)

    def test_export_resolution_and_frame_rate_choices(self):
        for width, height in ((640, 360), (854, 480), (1280, 720), (1920, 1080), (2560, 1440), (3840, 2160)):
            for fps in (15, 24, 25, 30, 50, 60, 120):
                result = validate_settings({'width': width, 'height': height, 'fps': fps})
                self.assertEqual((result['width'], result['height'], result['fps']), (width, height, fps))
        for invalid in ({'width': 7680, 'height': 4320}, {'fps': 240}):
            with self.assertRaises(ValueError):
                validate_settings(invalid)

    def test_text_overlays_logo_with_custom_color_size_and_font(self):
        import cv2
        with tempfile.TemporaryDirectory() as directory:
            logo_path = Path(directory) / 'logo.png'
            cv2.imwrite(str(logo_path), np.zeros((100, 100, 3), np.uint8))
            frames = []
            for font in ('roboto', 'opensans', 'lora', 'nunito', 'raleway', 'oswald', 'playfair', 'merriweather', 'rubik', 'bebas', 'poppins', 'inter', 'montserrat', 'lato', 'tektur', 'sans', 'serif', 'mono'):
                for size in (50, 100, 200):
                    settings = validate_settings({'title': 'Overlay', 'textColor': '#ff0000', 'textSize': size, 'textFont': font, 'particles': False, 'glow': False, 'pulse': False})
                    renderer = StudioRenderer(settings, logo_path)
                    self.assertIsNotNone(renderer.logo)
                    self.assertIsNotNone(renderer.text)
                    frame = renderer.frame(0, np.zeros(64), 0, 0)
                    roi = frame[280:440, 440:840]
                    red = (roi[:, :, 2] > 80) & (roi[:, :, 1] < 30) & (roi[:, :, 0] < 30)
                    self.assertGreater(int(red.sum()), 0)
                    frames.append(frame)
            for first, second in zip(frames, frames[1:]):
                self.assertFalse(np.array_equal(first, second))

    def test_settings_validation(self):
        for invalid in ({'glowStrength': -1}, {'echoRingsStrength': 201}, {'vignetteStrength': float('nan')}, {'orbitLights': 1}, {'echoRings': 'yes'}, {'vignette': None}, {'aura': 'false'}, {'backgroundZoom': 49}, {'backgroundX': 101}, {'backgroundY': -101}, {'logoOpacity': 101}, {'backgroundFit': 'invalid'}, {'backgroundOpacity': -1}, {'backgroundOpacity': 101}, {'textColor': 'red'}, {'textSize': 49}, {'textSize': 201}, {'textSize': float('nan')}, {'textFont': 'invalid'}, {'innerFill': 'red'}, {'innerRing': 'yes'}, {'logoFit': 'invalid'}, {'logoZoom': 201}, {'logoX': -101}, {'logoY': float('nan')}, {'shape': 'invalid'}, {'style': 'invalid'}, {'smoothing': -1}, {'smoothing': 101}, {'smoothing': float('nan')}, {'rotation': -1}, {'rotation': 181}, {'rotation': float('nan')}, {'radius': float('nan')}, {'bars': 33}, {'fps': 500}, {'primary': 'red'}, {'glow': 'yes'}, {'width': 9999}, {'width': 854.0, 'height': 480}):
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
