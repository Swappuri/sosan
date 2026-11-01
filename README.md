# sosan

An audio-reactive music visualizer with a live browser preview and frame-by-frame
MP4 export. Built with Python, Web Audio, Canvas, OpenCV, and FFmpeg.

![sosan studio](docs/studio.png)

## Use the free website

**[Open sosan](https://swappuri.github.io/sosan/)** — no installation or account needed.

The GitHub Pages version runs entirely on your device. Audio and logos are never
uploaded. MP4 export uses WebCodecs in a browser worker and generates every frame
without recording playback. Use an updated Chrome, Edge, or Safari browser with
H.264 encoding support.

**Keep the tab open until export finishes**, then download the MP4 before closing
or refreshing it. GitHub Pages is static hosting: it cannot run a server-side job
after you close the page. Rendering speed depends on your device, not song playback.
A background tab can work, but browsers may suspend it; returning to the tab lets
it continue. No render servers or paid hosting are used.

Browser export supports mono/stereo tracks up to 100 MB and 10 minutes, subject
to a 300 MB estimated output budget. Lower the resolution for longer tracks or
use the optional local version for larger exports and closed-tab rendering.

## Features

- Drag and drop MP3 or WAV audio.
- Customize spectrum colors, radius, reactivity, bar count, glow, particles,
  bass pulses, and beat flashes.
- Add a logo and display text, with independent text color, size, and font controls.
- Export the full song at 480p, 720p, or 1080p, with 30 or 60 FPS.
- Export directly in the browser, or use the optional Python server for persistent background jobs.
- Cancel an active render or download the completed MP4.
- Keep audio, images, analysis, and rendering on your computer.

## Optional local version

The local Python version retains server-side exports that continue after the
browser closes. These requirements apply only to running that version.

### Requirements

- Python 3.10 or newer.
- FFmpeg and FFprobe available on your `PATH`.
- A modern browser with Web Audio support.

No Node.js installation or frontend build is needed to run the app.

### Local setup

Clone this repository and open its directory:

```sh
git clone https://github.com/Swappuri/sosan.git
cd sosan
```

Install FFmpeg using your platform's package manager. For example:

```sh
# macOS (Homebrew)
brew install ffmpeg

# Ubuntu / Debian
sudo apt-get update
sudo apt-get install ffmpeg

# Windows (WinGet)
winget install --id Gyan.FFmpeg -e
```

Create a virtual environment and install the Python dependencies:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python server.py
```

On Windows, use `py -m venv .venv` to create the environment and
`.venv\Scripts\Activate.ps1` to activate it in PowerShell.

The server opens **http://127.0.0.1:8765**. On macOS, you can also double-click
`Open sosan.command` after setup; it uses the local `.venv` when present.

```sh
python server.py --port 8766        # Use another port
python server.py --no-browser      # Start without opening a browser
```

### Local usage

1. Add your own MP3 or WAV file. No songs or sample recordings are bundled.
2. Play the preview and adjust the settings. On smaller windows, switch between
   the Preview and Settings views.
3. Optionally add a PNG, JPG, or WebP logo. Fit image and Fill shape restore centered placement at 100% zoom. Use the Text section to add text over the logo or on its own, and customize its color, size, and font. Text wraps inside the selected shape at your chosen size, shrinking only when the wrapped block cannot fit.
4. Select the export resolution and frame rate, then click **Export video**.
5. Keep the page open during the initial upload. Once analysis or rendering
   starts, you can close it and return later to download the finished MP4.

An export captures the settings and logo selected when you submit it. Later
preview changes do not affect the active job. Only one export renders at a time.

### Local export behavior

The renderer analyzes the full song and generates frames using a fixed video
clock. FFmpeg combines those frames with the original audio into an H.264/AAC
MP4. This does not record browser playback or capture your screen.

Rendering speed depends on your computer, resolution, and effects. Keep the
computer awake. Started workers survive closing the server terminal; restart
the server to check status or download. Shutting down the computer interrupts
an unfinished job. Font rasterization, glow, and audio response can differ
slightly between the browser preview and the offline renderer.

The local server accepts audio up to 512 MB and logos up to 20 MB. It binds only
to `127.0.0.1`; this is a local desktop tool, not an Internet-facing web service.

### Local files and privacy

Completed videos, job settings, status, and logs are stored in `exports/<job-id>/`.
Temporary uploaded source copies and partial videos are removed when a worker
finishes or is cancelled. Finished export folders can be removed when no longer
needed. The browser remembers the latest export ID in local storage.

Source audio, generated media, exports, credentials, and virtual environments are
excluded by `.gitignore`. Do not add personal songs or rendered videos to the
repository. All included fonts and UI assets are served locally.

## Development

### Website

Node.js 18+ is needed to build the website, but visitors install nothing:

```sh
npm ci
npm test
npm run build
```

The deployable static website is in `dist/`. Serve that directory with any static
web server for development. `studio/` contains the shared UI and drawing code;
`web/export-worker.js` contains the browser encoder. Dependencies and licenses
are bundled locally; no runtime CDN requests are needed.

`.github/workflows/pages.yml` builds and publishes `dist/` to GitHub Pages on
pushes to `main`. The repository's Pages source must be set to **GitHub Actions**.
The workflow does not deploy the Python backend.

### Python renderer

From the repository root, after installing `requirements.txt`:

```sh
python -m unittest discover -s tests -v
python -m compileall -q server.py render_worker.py render_settings.py offline_renderer.py
node --check studio/app.js
```

Tests generate their own audio fixtures. CI tests the Python renderer on 3.11
and 3.12 and separately tests/builds the browser application.

### Source layout

- `studio/`: UI, shared Canvas scene, browser export controller, FFT analysis, font.
- `web/export-worker.js`: frame-clock rendering and browser H.264/AAC encoding.
- `scripts/build-web.mjs`: reproducible static build and license packaging.
- `tests/web/`: browser-independent analysis and timing tests.
- `server.py`, `render_worker.py`, `render_settings.py`, `offline_renderer.py`: optional local backend.
- `tests/test_offline_export.py`: local backend regression tests.
- `docs/studio.png`: interface screenshot.

## License

Application code is licensed under the [MIT License](LICENSE).
Tektur is licensed separately under the SIL Open Font License; see
[third-party notices](THIRD_PARTY_NOTICES.md).
