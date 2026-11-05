import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
import numpy as np
import soundfile as sf
from render_settings import validate_settings
from render_worker import trim_audio

class AudioEditTests(unittest.TestCase):
    def test_invalid_ranges_are_rejected(self):
        for ranges in ([], [[2,1]], [[0,1],[.5,2]], [[0,float('nan')]], [[True,2]], [[0,.01]]):
            with self.subTest(ranges=ranges):
                with self.assertRaises(ValueError): validate_settings({'segments': ranges})
        self.assertEqual(validate_settings({'segments': [[1,2],[4,6]]})['segments'], [[1,2],[4,6]])

    @unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg required')
    def test_local_export_applies_trim_and_middle_cut_to_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            source, target = Path(folder)/'source.wav', Path(folder)/'edited.wav'
            sr=48000
            samples=np.stack([np.arange(sr)/sr, -np.arange(sr)/sr],axis=1)
            sf.write(source,samples,sr,subtype='FLOAT')
            trim_audio(source,target,[[.1,.3],[.7,.9]],shutil.which('ffmpeg'))
            edited,rate=sf.read(target)
            self.assertEqual(rate,sr);self.assertEqual(edited.shape,(19200,2))
            np.testing.assert_allclose(edited[0],samples[4800],atol=1e-6)
            np.testing.assert_allclose(edited[9600],samples[33600],atol=1e-6)
