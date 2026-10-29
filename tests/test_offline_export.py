"""Offline export regression checks, including cancellation and encoded timestamps."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf

from offline_renderer import analyze_track, StudioRenderer
from render_settings import validate_settings
from render_worker import run_job


class OfflineExportTests(unittest.TestCase):
    def test_settings_validation(self):
        for invalid in ({'radius': float('nan')}, {'bars': 33}, {'fps': 500}, {'primary': 'red'}, {'glow': 'yes'}, {'width': 9999}, {'width': 854.0, 'height': 480}):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_settings(invalid)

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
