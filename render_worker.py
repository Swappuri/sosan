"""Render one persistent studio export job in a detached process."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import traceback


def save_status(folder, **changes):
    """Atomic updates let HTTP readers observe progress without partial JSON."""
    path = folder / 'job.json'
    state = json.loads(path.read_text())
    state.update(changes, updated=time.time())
    temporary = folder / 'job.pending.json'
    temporary.write_text(json.dumps(state))
    temporary.replace(path)
    return state


class Cancelled(Exception):
    pass


def run_job(folder):
    state = json.loads((folder / 'job.json').read_text())
    process = None
    partial = folder / 'render.partial.mp4'
    try:
        save_status(folder, state='analyzing', progress=0, pid=os.getpid(), message='Analyzing the full song…')
        from offline_renderer import analyze_track, StudioRenderer, validate_settings, cv2
        cv2.setNumThreads(2)
        settings = validate_settings(state['settings'])
        ffmpeg = shutil.which('ffmpeg')
        if not ffmpeg:
            raise RuntimeError('FFmpeg is missing. Install it with brew install ffmpeg.')

        def checkpoint(progress=0):
            if (folder / 'cancel').exists():
                raise Cancelled()
            save_status(folder, progress=round(progress * 8, 2))

        checkpoint()
        source = folder / 'audio'
        levels, bass, onsets, duration = analyze_track(source, settings, checkpoint)
        checkpoint()
        renderer = StudioRenderer(settings, folder / 'logo' if (folder / 'logo').is_file() else None)
        width, height, fps = settings['width'], settings['height'], settings['fps']
        command = [ffmpeg, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
                   '-s', f'{width}x{height}', '-r', str(fps), '-i', 'pipe:0', '-i', str(source),
                   '-map', '0:v:0', '-map', '1:a:0',
                   '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
                   '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', str(partial)]
        started = time.monotonic()
        save_status(folder, state='rendering', progress=8, duration=duration, frames=len(levels), message='Rendering frames offline…')
        with (folder / 'ffmpeg.log').open('wb') as errors:
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=errors)
            for index in range(len(levels)):
                if (folder / 'cancel').exists():
                    raise Cancelled()
                process.stdin.write(renderer.frame(index, levels[index], bass[index], onsets[index]).tobytes())
                if index % fps == 0 or index == len(levels) - 1:
                    elapsed = max(.001, time.monotonic() - started)
                    save_status(folder, progress=round(8 + 90 * (index + 1) / len(levels), 2),
                                rendered_frames=index + 1, render_fps=round((index + 1) / elapsed, 1))
            process.stdin.close()
            save_status(folder, state='finalizing', progress=99, message='Finalizing your MP4…')
            while process.poll() is None:
                if (folder / 'cancel').exists():
                    raise Cancelled()
                time.sleep(.1)
            if process.returncode:
                raise RuntimeError('FFmpeg encoding failed. See ffmpeg.log in this export folder.')
        if (folder / 'cancel').exists():
            raise Cancelled()
        partial.replace(folder / state['filename'])
        save_status(folder, state='complete', progress=100, message='Your full-song MP4 is ready.', completed=time.time())
    except Cancelled:
        save_status(folder, state='cancelled', message='Export cancelled.')
    except Exception as error:
        traceback.print_exc()
        save_status(folder, state='failed', message=str(error), error=str(error))
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if process is not None and process.stdin and not process.stdin.closed:
            try:
                process.stdin.close()
            except BrokenPipeError:
                pass
        partial.unlink(missing_ok=True)
        # The finished MP4 and job metadata remain; uploaded source copies are temporary.
        for name in ('audio', 'logo'):
            (folder / name).unlink(missing_ok=True)


if __name__ == '__main__':
    run_job(Path(sys.argv[1]).resolve())
