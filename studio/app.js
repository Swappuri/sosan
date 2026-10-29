const $ = id => document.getElementById(id);
const canvas = $('visualizer');
const ctx = canvas.getContext('2d', { alpha: false });
const audio = $('audio');
const defaults = { primary: '#a7f36b', secondary: '#5de5ec', background: '#0b1114', radius: 115, sensitivity: 1.2, bars: 128, glow: true, particles: true, pulse: true, flashes: false };
let settings = { ...defaults };
let context, analyser, source, monitor, spectrum;
let currentUrl, logo, loaded = false, loading = false, exporting = false;
let smooth = new Float32Array(96), bass = 0, previousBass = 0, flash = 0;
let lastTime = 0;
let selectedFile, logoFile, exportJobId, pollTimer, uploadController;
let activeLoad = 0, exportPreparing = false;
const particles = Array.from({ length: 100 }, (_, i) => ({ x: fract(Math.sin(i * 127.1 + 3) * 43758.5453), y: fract(Math.sin(i * 311.7 + 9) * 43758.5453), size: 0.6 + fract(Math.sin(i * 41.9) * 43758.5453) * 1.4, phase: i * 2.7 }));
function fract(n) { return n - Math.floor(n); }
let statusTimer;
function status(message, error = false) {
  clearTimeout(statusTimer);
  $('status').textContent = message;
  $('status').hidden = !message;
  $('status').classList.toggle('error', error);
  if (message && !error) statusTimer = setTimeout(() => { $('status').hidden = true; }, 5000);
}
function timeLabel(seconds) { if (!Number.isFinite(seconds)) return '0:00'; const n = Math.max(0, Math.floor(seconds)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
function rgba(hex, alpha) { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16},${v >> 8 & 255},${v & 255},${alpha})`; }
function blend(a, b, ratio) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return `rgb(${[16, 8, 0].map(s => Math.round((x >> s & 255) * (1 - ratio) + (y >> s & 255) * ratio)).join(',')})`; }

// Speaker volume affects preview playback only; exports are rendered independently.
async function prepareAudio() {
  if (!context) {
    context = new AudioContext();
    source = context.createMediaElementSource(audio);
    analyser = context.createAnalyser();
    analyser.fftSize = 8192;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -15;
    analyser.smoothingTimeConstant = 0.55;
    spectrum = new Uint8Array(analyser.frequencyBinCount);
    monitor = context.createGain();
    source.connect(analyser);
    analyser.connect(monitor);
    monitor.connect(context.destination);
  }
  await context.resume();
}
function setExportState(value) {
  exporting = value;
  $('export').disabled = value || !loaded;
  $('export-panel').hidden = false;
  $('cancel-export').hidden = !value;
  $('cancel-export').disabled = false;
}
function resetMotion() { smooth.fill(0); bass = previousBass = flash = 0; }
async function loadSong(file) {
  if (loading) return;
  if (!/\.(mp3|wav)$/i.test(file.name)) { status('Choose an MP3 or WAV audio file.', true); return; }
  if (!file.size) { status('This file is empty. Choose another song.', true); return; }
  const loadId = ++activeLoad;
  loading = true;
  loaded = false;
  audio.pause();
  $('play').disabled = $('export').disabled = $('seek').disabled = true;
  status(`Loading ${file.name}…`);
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(file);
  audio.src = currentUrl;
  resetMotion();
  try {
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); audio.removeEventListener('loadedmetadata', success); audio.removeEventListener('error', failure); };
      const success = () => { cleanup(); resolve(); };
      const failure = () => { cleanup(); reject(new Error('The browser could not read this audio file. Try another MP3 or WAV.')); };
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Audio loading timed out. Try another file.')); }, 30000);
      audio.addEventListener('loadedmetadata', success, { once: true });
      audio.addEventListener('error', failure, { once: true });
      audio.load();
    });
    if (loadId !== activeLoad) return;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) throw new Error('This file has no playable audio.');
    loaded = true;
    selectedFile = file;
    $('empty-state').hidden = true;
    $('track-name').textContent = file.name;
    $('track-detail').textContent = `${file.name.split('.').pop().toUpperCase()} · ${timeLabel(audio.duration)} · full track`;
    $('duration').textContent = timeLabel(audio.duration);
    $('seek').max = audio.duration;
    $('seek').value = 0;
    $('elapsed').textContent = '0:00';
    $('play').disabled = $('seek').disabled = false;
    $('export').disabled = exporting || exportPreparing;
    status('');
  } catch (error) {
    if (loadId === activeLoad) { loaded = false; $('empty-state').hidden = false; $('track-name').textContent = 'No audio loaded'; $('track-detail').textContent = 'Choose another MP3 or WAV'; status(error.message, true); }
  } finally { if (loadId === activeLoad) loading = false; }
}
async function togglePlay() {
  if (!loaded || loading) return;
  try {
    await prepareAudio();
    if (audio.paused) { if (audio.ended) { audio.currentTime = 0; resetMotion(); } await audio.play(); }
    else audio.pause();
  } catch (error) { status(`Playback failed: ${error.message}`, true); }
}
$('play').onclick = togglePlay;
audio.addEventListener('play', () => { $('play').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', 'Pause'); });
audio.addEventListener('pause', () => { $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Play'); });
$('seek').oninput = () => { if (loaded) { audio.currentTime = Number($('seek').value); resetMotion(); } };
$('mute').onclick = () => { if (monitor) { monitor.gain.value = monitor.gain.value ? 0 : 1; $('mute').textContent = monitor.gain.value ? '♪' : '×'; $('mute').setAttribute('aria-label', monitor.gain.value ? 'Mute audio' : 'Unmute audio'); } };
document.addEventListener('keydown', event => { if (event.code === 'Space' && !['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); togglePlay(); } });
$('stage-browse').onclick = $('dropzone').onclick = () => $('audio-file').click();
$('audio-file').onchange = event => { if (event.target.files[0]) loadSong(event.target.files[0]); event.target.value = ''; };
for (const target of [$('dropzone'), $('stage')]) {
  target.addEventListener('dragover', event => { event.preventDefault(); $('dropzone').classList.add('dragging'); });
  target.addEventListener('dragleave', () => $('dropzone').classList.remove('dragging'));
  target.addEventListener('drop', event => { event.preventDefault(); $('dropzone').classList.remove('dragging'); if (event.dataTransfer.files[0]) loadSong(event.dataTransfer.files[0]); });
}
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
// Preview controls are snapshotted when an offline export is submitted.
function relativeLuminance(hex) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
function applyTheme() {
  const color = settings.primary;
  const luminance = relativeLuminance(color);
  const darkLuminance = relativeLuminance('#101114');
  const darkContrast = (luminance + .05) / (darkLuminance + .05);
  const whiteContrast = 1.05 / (luminance + .05);
  const root = document.documentElement.style;
  root.setProperty('--accent', color);
  root.setProperty('--secondary', settings.secondary);
  root.setProperty('--preview-bg', settings.background);
  root.setProperty('--accent-ink', darkContrast >= whiteContrast ? '#101114' : '#ffffff');
  root.setProperty('--accent-soft', rgba(color, .09));
  root.setProperty('--accent-border', rgba(color, .48));
  // Preserve the chosen color, lightening only the focus outline when needed.
  const surfaceLuminance = relativeLuminance('#2d2d2d');
  const focusContrast = (Math.max(luminance, surfaceLuminance) + .05) / (Math.min(luminance, surfaceLuminance) + .05);
  root.setProperty('--accent-focus', focusContrast >= 3 ? color : blend(color, '#ffffff', .6));
}
function syncSettings() {
  for (const key of ['primary', 'secondary', 'background']) {
    $(key + '-color').value = settings[key];
    $(key + '-color-value').value = settings[key].toUpperCase();
  }
  applyTheme();
  for (const key of ['radius', 'sensitivity', 'bars']) $(key).value = settings[key];
  for (const key of ['glow', 'particles', 'pulse', 'flashes']) $(key).checked = settings[key];
  $('radius-value').value = `${settings.radius} px`;
  $('sensitivity-value').value = `${settings.sensitivity.toFixed(1)}×`;
  $('bars-value').value = settings.bars;
}
for (const key of ['primary', 'secondary', 'background']) $(key + '-color').oninput = () => { settings[key] = $(key + '-color').value; $(key + '-color-value').value = settings[key].toUpperCase(); applyTheme(); };
for (const key of ['radius', 'sensitivity', 'bars']) $(key).oninput = () => { settings[key] = Number($(key).value); syncSettings(); };
for (const key of ['glow', 'particles', 'pulse', 'flashes']) $(key).onchange = () => { settings[key] = $(key).checked; };
$('reset').onclick = () => {
  settings = { ...defaults }; syncSettings(); resetMotion();
  $('title').value = ''; logo = null; logoFile = null; $('logo-remove').hidden = true; $('logo-name').textContent = 'PNG, JPG, WebP';
  $('resolution').value = '1280x720'; $('fps').value = '30'; setResolution();
  status('Settings reset.');
};
function setResolution() { const [width, height] = $('resolution').value.split('x').map(Number); canvas.width = width; canvas.height = height; $('resolution-label').textContent = `${width} × ${height}`; }
$('resolution').onchange = setResolution;
$('logo-upload').onclick = () => $('logo-file').click();
$('logo-file').onchange = async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { status('Choose a PNG, JPG, or WebP logo.', true); return; }
  if (file.size > 20 * 1024 * 1024) { status('Choose a logo smaller than 20 MB.', true); return; }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    logo = image; logoFile = file; $('logo-name').textContent = file.name; $('logo-remove').hidden = false;
    status('Logo added.');
  } catch { status('Could not read this image. Try another logo.', true); }
  finally { URL.revokeObjectURL(url); }
};
$('logo-remove').onclick = () => { logo = null; logoFile = null; $('logo-remove').hidden = true; $('logo-name').textContent = 'PNG, JPG, WebP'; };

// Logarithmic frequency bands with time-based attack/release smoothing.
function sampleAudio(dt) {
  const count = settings.bars / 2;
  if (smooth.length !== count) smooth = new Float32Array(count);
  if (analyser && !audio.paused) {
    analyser.getByteFrequencyData(spectrum);
    const hzPerBin = context.sampleRate / analyser.fftSize;
    let lowEnergy = 0, lowBins = 0;
    for (let j = Math.ceil(35 / hzPerBin); j < Math.ceil(160 / hzPerBin); j++) { lowEnergy += spectrum[j] / 255; lowBins++; }
    const targetBass = Math.max(0, lowEnergy / Math.max(1, lowBins) - .15) * settings.sensitivity;
    const delta = Math.max(0, targetBass - previousBass);
    previousBass = targetBass;
    bass += (targetBass - bass) * (1 - Math.exp(-dt * (targetBass > bass ? 22 : 6)));
    flash = Math.max(flash * Math.exp(-dt * 9), Math.min(1, delta * 6));
    for (let i = 0; i < count; i++) {
      const low = 35 * Math.pow(14000 / 35, i / count);
      const high = 35 * Math.pow(14000 / 35, (i + 1) / count);
      const first = Math.max(1, Math.floor(low / hzPerBin));
      const last = Math.min(spectrum.length, Math.max(first + 1, Math.ceil(high / hzPerBin)));
      let sum = 0;
      for (let j = first; j < last; j++) sum += Math.pow(spectrum[j] / 255, 2);
      const level = Math.min(1, Math.sqrt(sum / Math.max(1, last - first)) * settings.sensitivity);
      smooth[i] += (level - smooth[i]) * (1 - Math.exp(-dt * (level > smooth[i] ? 24 : 8)));
    }
  } else {
    bass *= Math.exp(-dt * 6); flash *= Math.exp(-dt * 9);
    for (let i = 0; i < smooth.length; i++) smooth[i] *= Math.exp(-dt * 7);
  }
}
function draw(now) {
  const interval = 1000 / (audio.paused ? 12 : Math.min(60, Number($('fps').value)));
  if (now - lastTime < interval) { requestAnimationFrame(draw); return; }
  const dt = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000 || 1 / 60)); lastTime = now;
  sampleAudio(dt);
  const width = canvas.width, height = canvas.height, scale = Math.min(width / 854, height / 480);
  const x = width / 2, y = height / 2;
  const songTime = loaded ? audio.currentTime : now / 1000 * .25;
  ctx.fillStyle = settings.background; ctx.fillRect(0, 0, width, height);
  const aura = ctx.createRadialGradient(x, y, 0, x, y, 360 * scale);
  aura.addColorStop(0, rgba(settings.primary, .09 + (settings.flashes ? flash * .1 : 0)));
  aura.addColorStop(.55, rgba(settings.secondary, .025)); aura.addColorStop(1, rgba(settings.background, 0));
  ctx.fillStyle = aura; ctx.fillRect(0, 0, width, height);
  // A restrained star field drifts outwards with the song clock.
  if (settings.particles) {
    for (const p of particles) {
      const px = fract(p.x + Math.cos(p.phase) * songTime * .003) * width;
      const py = fract(p.y - songTime * .004 * (p.size / 2)) * height;
      ctx.globalAlpha = .15 + .3 * (0.5 + 0.5 * Math.sin(songTime * .8 + p.phase));
      ctx.fillStyle = settings.primary; ctx.beginPath(); ctx.arc(px, py, p.size * scale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const pulse = settings.pulse ? Math.min(1, bass) * 12 : 0;
  const radius = (settings.radius + pulse) * scale;
  const count = settings.bars;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const index = i < count / 2 ? i : count - i - 1;
    const level = smooth[index] || 0;
    const angle = i / count * Math.PI * 2 - Math.PI / 2;
    const length = (3 + Math.pow(level, 1.9) * 67) * scale;
    const color = blend(settings.primary, settings.secondary, index / (count / 2));
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, 2.2 * scale);
    ctx.shadowColor = color; ctx.shadowBlur = settings.glow ? (9 + level * 9) * scale : 0;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * (radius + 8 * scale), y + Math.sin(angle) * (radius + 8 * scale));
    ctx.lineTo(x + Math.cos(angle) * (radius + 8 * scale + length), y + Math.sin(angle) * (radius + 8 * scale + length)); ctx.stroke();
  }
  ctx.shadowColor = settings.primary; ctx.shadowBlur = settings.glow ? 16 * scale : 0;
  ctx.lineWidth = 1.5 * scale; ctx.strokeStyle = settings.primary;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(settings.secondary, .4); ctx.lineWidth = scale;
  ctx.beginPath(); ctx.arc(x, y, radius - 5 * scale, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = settings.background; ctx.beginPath(); ctx.arc(x, y, radius - 9 * scale, 0, Math.PI * 2); ctx.fill();
  if (logo) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius - 16 * scale, 0, Math.PI * 2); ctx.clip();
    const size = (radius - 20 * scale) * 2;
    const factor = Math.min(size / logo.width, size / logo.height);
    ctx.drawImage(logo, x - logo.width * factor / 2, y - logo.height * factor / 2, logo.width * factor, logo.height * factor);
    ctx.restore();
  } else if ($('title').value.trim()) {
    const title = $('title').value.trim();
    let fontSize = Math.min(21 * scale, radius * .21);
    ctx.font = `600 ${fontSize}px Tektur, sans-serif`;
    const maxWidth = radius * 1.55;
    if (ctx.measureText(title).width > maxWidth) fontSize *= maxWidth / ctx.measureText(title).width;
    ctx.font = `600 ${fontSize}px Tektur, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#eeeff2'; ctx.fillText(title, x, y);
  }
  if (loaded) { $('elapsed').textContent = timeLabel(audio.currentTime); $('seek').value = audio.currentTime; }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// Narrow screens use two views while the desktop keeps both aligned panels visible.
function setWorkspaceView(view) {
  document.body.dataset.view = view;
  document.querySelectorAll('.view-switch button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
}
document.querySelectorAll('.view-switch button').forEach(button => {
  button.onclick = () => setWorkspaceView(button.dataset.view);
});

// Rendering belongs to a persistent server job; polling is only a progress display.
function rememberJob(id) {
  exportJobId = id;
  try { localStorage.setItem('sosan-export-id', id); } catch { /* Private browsing may disable storage. */ }
}
async function api(path, options = {}) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || 'The local server could not complete this request.'); error.status = response.status; throw error; }
  return result;
}
function showJob(job) {
  const active = ['queued', 'analyzing', 'rendering', 'finalizing'].includes(job.state);
  setExportState(active);
  $('export-progress').value = job.progress || 0;
  $('export-download').hidden = job.state !== 'complete';
  if (job.state === 'complete') {
    $('export-title').textContent = `Ready · ${job.filename}`;
    $('export-detail').textContent = 'Saved locally.';
    $('export-download').href = job.download_url;
    $('export-download').download = job.filename;
    status('');
  } else if (active) {
    const labels = { queued: 'Starting offline renderer…', analyzing: 'Analyzing your song…', rendering: 'Rendering offline', finalizing: 'Finalizing your MP4…' };
    $('export-title').textContent = `${labels[job.state]} · ${Math.floor(job.progress || 0)}%`;
    const speed = job.render_fps ? ` · ${job.render_fps} frames/sec` : '';
    $('export-detail').textContent = `You can close this tab. Keep your computer awake.${speed}`;
    status('');
  } else {
    $('export-title').textContent = job.state === 'cancelled' ? 'Export cancelled.' : 'Export could not finish.';
    $('export-detail').textContent = job.message || 'Please try again.';
    status(job.message || 'Export stopped.', job.state === 'failed');
  }
  return active;
}
async function pollExport() {
  clearTimeout(pollTimer);
  if (!exportJobId) return;
  try {
    const job = await api(`/api/exports/${exportJobId}`);
    // A closed tab can interrupt the initial upload, but never an accepted render.
    if (job.state === 'uploading') {
      await api(`/api/exports/${exportJobId}/cancel`, { method: 'POST' });
      showJob({ state: 'cancelled', message: 'The upload was interrupted. Choose your song and export again.' });
      return;
    }
    if (showJob(job)) pollTimer = setTimeout(pollExport, 1000);
  } catch (error) {
    if (error.status === 404) {
      showJob({ state: 'failed', message: 'This saved export was removed. Choose your song to create a new one.' });
      exportJobId = null;
      try { localStorage.removeItem('sosan-export-id'); } catch {}
      return;
    }
    $('export-title').textContent = 'Waiting for the local server…';
    $('export-detail').textContent = 'A started render continues independently. Reopen the server to check progress.';
    status(`Cannot check export progress: ${error.message}`, true);
    pollTimer = setTimeout(pollExport, 3000);
  }
}
$('export').onclick = async () => {
  if (!loaded || !selectedFile || exporting || exportPreparing) return;
  setWorkspaceView('preview');
  exportPreparing = true;
  clearTimeout(pollTimer);
  exportJobId = null;
  setExportState(true);
  $('export-download').hidden = true;
  $('export-title').textContent = 'Uploading song to the local renderer…';
  $('export-detail').textContent = 'Keep this tab open until the render starts. Nothing leaves your computer.';
  $('export-progress').value = 0;
  uploadController = new AbortController();
  const signal = uploadController.signal;
  const exportAudio = selectedFile, exportLogo = logoFile;
  const [width, height] = $('resolution').value.split('x').map(Number);
  const snapshot = { ...settings, width, height, fps: Number($('fps').value), title: $('title').value.trim() };
  const filename = $('title').value.trim() || exportAudio.name.replace(/\.[^.]+$/, '');
  try {
    const capability = await api('/api/health', { signal });
    if (!capability.ffmpeg) throw new Error('Install FFmpeg with “brew install ffmpeg”, then try again.');
    if (!capability.offline) throw new Error('Install the renderer dependencies with “python3 -m pip install -r requirements.txt”, then restart the server.');
    const job = await api('/api/exports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: snapshot, name: exportAudio.name, filename }), signal });
    rememberJob(job.id);
    await api(`/api/exports/${job.id}/audio`, { method: 'PUT', body: exportAudio, signal });
    if (exportLogo) await api(`/api/exports/${job.id}/logo`, { method: 'PUT', body: exportLogo, signal });
    await api(`/api/exports/${job.id}/start`, { method: 'POST', signal });
    exportPreparing = false;
    uploadController = null;
    await pollExport();
  } catch (error) {
    setExportState(false);
    if (error.name !== 'AbortError') {
      $('export-title').textContent = 'Export could not start.';
      $('export-detail').textContent = error.message;
      status(error.message, true);
    }
    if (exportJobId) {
      try { await api(`/api/exports/${exportJobId}/cancel`, { method: 'POST' }); } catch { /* Job may already be terminal. */ }
    }
  } finally {
    exportPreparing = false;
    uploadController = null;
  }
};
$('cancel-export').onclick = async () => {
  uploadController?.abort();
  $('cancel-export').disabled = true;
  try {
    if (exportJobId) await api(`/api/exports/${exportJobId}/cancel`, { method: 'POST' });
    exportPreparing = false;
    if (exportJobId) await pollExport();
    else { setExportState(false); status('Export cancelled.'); }
  } catch (error) { $('cancel-export').disabled = false; status(error.message, true); await pollExport(); }
};
// Only an upload depends on the tab. Rendering never needs a page or an audio device.
window.addEventListener('beforeunload', event => { if (exportPreparing) { event.preventDefault(); event.returnValue = ''; } });
syncSettings();
try {
  exportJobId = localStorage.getItem('sosan-export-id') || localStorage.getItem('orbit-export-id');
  if (exportJobId) {
    localStorage.setItem('sosan-export-id', exportJobId);
    localStorage.removeItem('orbit-export-id');
  }
} catch { /* Optional recovery. */ }
if (exportJobId && /^[a-f0-9]{32}$/.test(exportJobId)) pollExport();
