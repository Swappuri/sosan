"""Serve sosan and manage persistent offline MP4 export jobs."""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
import webbrowser
from urllib.parse import urlparse

from render_settings import validate_settings

ROOT = Path(__file__).resolve().parent
JOBS = ROOT / 'exports'
ACTIVE_STATES = {'queued', 'analyzing', 'rendering', 'finalizing'}
JOB_LOCK = threading.RLock()
PROCESSES = {}


class StudioHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'studio'), **kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def json_response(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def allowed_host(self):
        host = self.headers.get('Host', '')
        return host in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}

    def local_request(self):
        if not self.allowed_host() or self.headers.get('Origin') != f'http://{self.headers.get("Host", "")}':
            self.json_response(403, {'error': 'Exports are available only from this local app.'})
            return False
        return True

    def job_folder(self, identifier):
        if not re.fullmatch(r'[a-f0-9]{32}', identifier):
            raise ValueError('Invalid export ID.')
        folder = JOBS / identifier
        if not (folder / 'job.json').is_file():
            raise FileNotFoundError('Export not found.')
        return folder

    def job_status(self, folder):
        state = json.loads((folder / 'job.json').read_text())
        process = PROCESSES.get(folder.name)
        returncode = process.poll() if process is not None else None
        stopped = process is not None and returncode is not None
        if state['state'] in ACTIVE_STATES and process is None and state.get('pid'):
            try:
                os.kill(state['pid'], 0)
            except ProcessLookupError:
                stopped = True
        if state['state'] == 'queued' and process is None and time.time() - state.get('updated', state['created']) > 30:
            stopped = True
        if state['state'] in ACTIVE_STATES and stopped:
            with JOB_LOCK:
                # The worker may have published completion between our read and poll.
                state = json.loads((folder / 'job.json').read_text())
                if state['state'] in ACTIVE_STATES:
                    state.update(state='failed', message='The render process stopped unexpectedly. Please retry.')
                    temporary = folder / 'job.server.json'
                    temporary.write_text(json.dumps(state))
                    temporary.replace(folder / 'job.json')
        if state['state'] == 'complete':
            state['download_url'] = f'/api/exports/{folder.name}/download'
        return state

    def send_file(self, path, content_type, filename=None):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(path.stat().st_size))
        if filename:
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.end_headers()
        with path.open('rb') as stream:
            shutil.copyfileobj(stream, self.wfile)

    def do_GET(self):
        if not self.allowed_host():
            self.send_error(403)
            return
        path = urlparse(self.path).path
        try:
            if path == '/api/health':
                dependencies = all(importlib.util.find_spec(name) is not None for name in ('numpy', 'cv2', 'librosa', 'PIL'))
                self.json_response(200, {'ffmpeg': bool(shutil.which('ffmpeg')), 'offline': dependencies})
            elif path.startswith('/api/exports/'):
                parts = path.strip('/').split('/')
                folder = self.job_folder(parts[2])
                state = self.job_status(folder)
                if len(parts) == 4 and parts[3] == 'download':
                    if state['state'] != 'complete':
                        self.json_response(409, {'error': 'This export is not ready yet.'})
                    else:
                        self.send_file(folder / state['filename'], 'video/mp4', state['filename'])
                elif len(parts) == 3:
                    self.json_response(200, state)
                else:
                    self.send_error(404)
            elif path in {'/fonts/Tektur.ttf', '/fonts/OFL.txt'}:
                content_type = 'font/ttf' if path.endswith('.ttf') else 'text/plain; charset=utf-8'
                self.send_file(ROOT / 'studio' / path.lstrip('/'), content_type)
            elif path in {'/', '/index.html', '/app.js', '/style.css', '/render-scene.js', '/browser-export.js', '/audio-analysis.js'}:
                super().do_GET()
            else:
                self.send_error(404)
        except FileNotFoundError:
            self.json_response(404, {'error': 'File or export not found.'})
        except (ValueError, IndexError) as error:
            self.json_response(400, {'error': str(error)})
        except (BrokenPipeError, ConnectionResetError):
            pass

    def read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        if not 0 < length <= 65536:
            raise ValueError('Invalid export settings size.')
        return json.loads(self.rfile.read(length))

    def do_POST(self):
        if not self.local_request():
            return
        try:
            if self.path == '/api/exports':
                request = self.read_json()
                settings = validate_settings(request.get('settings'))
                name = str(request.get('name', 'song.mp3'))
                if not name.lower().endswith(('.mp3', '.wav')):
                    raise ValueError('Choose an MP3 or WAV file.')
                identifier = uuid.uuid4().hex
                folder = JOBS / identifier
                folder.mkdir(parents=True)
                stem = re.sub(r'[^a-zA-Z0-9 _-]', '', str(request.get('filename', 'sosan-visualizer')))[:100].strip() or 'sosan-visualizer'
                state = {'id': identifier, 'state': 'uploading', 'progress': 0,
                         'settings': settings, 'name': name[:255], 'filename': stem + '.mp4', 'created': time.time()}
                (folder / 'job.json').write_text(json.dumps(state))
                self.json_response(201, state)
                return
            parts = self.path.strip('/').split('/')
            if len(parts) != 4 or parts[:2] != ['api', 'exports']:
                self.send_error(404)
                return
            folder = self.job_folder(parts[2])
            with JOB_LOCK:
                state = self.job_status(folder)
                if parts[3] == 'cancel':
                    if state['state'] not in ACTIVE_STATES | {'uploading'}:
                        self.json_response(409, {'error': 'Export has already finished.'})
                    else:
                        (folder / 'cancel').touch()
                        if state['state'] == 'uploading':
                            state.update(state='cancelled', message='Export cancelled.')
                            (folder / 'job.json').write_text(json.dumps(state))
                            for name in ('audio', 'logo'):
                                (folder / name).unlink(missing_ok=True)
                        self.json_response(202, {'state': 'cancelling'})
                elif parts[3] == 'start':
                    if state['state'] != 'uploading' or not (folder / 'audio').is_file():
                        raise ValueError('Upload the song before starting the export.')
                    for other in JOBS.iterdir():
                        if other != folder and (other / 'job.json').is_file() and self.job_status(other)['state'] in ACTIVE_STATES:
                            self.json_response(409, {'error': 'Another export is running. Wait for it to finish or cancel it first.'})
                            return
                    if not shutil.which('ffmpeg'):
                        raise ValueError('FFmpeg is missing. Install it with brew install ffmpeg.')
                    state.update(state='queued', message='Starting offline renderer…', updated=time.time())
                    (folder / 'job.json').write_text(json.dumps(state))
                    try:
                        with (folder / 'worker.log').open('ab') as log:
                            PROCESSES[folder.name] = subprocess.Popen(
                                [sys.executable, str(ROOT / 'render_worker.py'), str(folder)],
                                stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                start_new_session=True,
                            )
                    except OSError:
                        state.update(state='failed', message='Could not start the renderer.')
                        (folder / 'job.json').write_text(json.dumps(state))
                        raise
                    self.json_response(202, state)
                else:
                    self.send_error(404)
        except FileNotFoundError as error:
            self.json_response(404, {'error': str(error)})
        except (ValueError, TypeError, AttributeError) as error:
            self.json_response(400, {'error': str(error)})
        except OSError as error:
            self.json_response(500, {'error': str(error)})

    def do_PUT(self):
        if not self.local_request():
            return
        temporary = None
        try:
            parts = self.path.strip('/').split('/')
            if len(parts) != 4 or parts[:2] != ['api', 'exports'] or parts[3] not in {'audio', 'logo'}:
                self.send_error(404)
                return
            folder = self.job_folder(parts[2])
            if self.job_status(folder)['state'] != 'uploading':
                raise ValueError('This export has already started.')
            length = int(self.headers.get('Content-Length', '0'))
            limit = 512 * 1024**2 if parts[3] == 'audio' else 20 * 1024**2
            if not 0 < length <= limit:
                raise ValueError(f'{parts[3].capitalize()} file exceeds the upload limit ({limit // 1024**2} MB) or is empty.')
            self.connection.settimeout(120)
            temporary = folder / (parts[3] + '.upload')
            with temporary.open('wb') as stream:
                remaining = length
                while remaining:
                    data = self.rfile.read(min(1024**2, remaining))
                    if not data:
                        raise ValueError('Upload interrupted.')
                    stream.write(data)
                    remaining -= len(data)
            with JOB_LOCK:
                if self.job_status(folder)['state'] != 'uploading':
                    raise ValueError('Upload cancelled.')
                temporary.replace(folder / parts[3])
            self.json_response(200, {'uploaded': parts[3]})
        except FileNotFoundError as error:
            self.json_response(404, {'error': str(error)})
        except (ValueError, OSError) as error:
            self.json_response(400, {'error': str(error)})
        finally:
            if temporary:
                temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    JOBS.mkdir(exist_ok=True)
    with ThreadingHTTPServer(('127.0.0.1', args.port), StudioHandler) as server:
        url = f'http://127.0.0.1:{server.server_port}'
        print(f'sosan: {url}', flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('\nStudio stopped. Started render workers continue in the background.')


if __name__ == '__main__':
    main()
