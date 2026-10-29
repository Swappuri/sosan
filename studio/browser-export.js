/** Static-site export: decode locally, render in a worker, then offer an MP4 Blob. */
export function createBrowserExporter(callbacks) {
  let worker, generation = 0, active = false;
  function cleanup() { worker?.terminate(); worker = null; active = false; }
  return {
    get active() { return active; },
    cancel() {
      if (!active) return;
      generation++; cleanup(); callbacks.cancelled();
    },
    async start(selection) {
      if (active) return;
      const id = ++generation;
      active = true; callbacks.started();
      let decoder, logo;
      try {
        if (!window.Worker || !window.OffscreenCanvas || !window.VideoEncoder) throw new Error('MP4 export requires WebCodecs. Use an updated Chrome, Edge, or Safari browser.');
        if (selection.file.size > 100 * 1024 ** 2) throw new Error('Browser export supports audio files up to 100 MB. Use the local Python version for larger files.');
        callbacks.progress({ progress: 1, phase: 'Decoding audio' });
        decoder = new AudioContext({ sampleRate: 48000 });
        const decoded = await decoder.decodeAudioData(await selection.file.arrayBuffer());
        await decoder.close(); decoder = null;
        if (id !== generation) return;
        if (decoded.numberOfChannels > 2) throw new Error('Browser export supports mono or stereo audio. Convert this multichannel WAV to stereo first.');
        const bitrate = selection.settings.height >= 1080 ? 7_000_000 : selection.settings.height >= 720 ? 3_800_000 : 1_800_000;
        if (decoded.duration > 600 || (bitrate + 192_000) * decoded.duration / 8 > 300 * 1024 ** 2) throw new Error('This export exceeds the browser memory budget. Try 480p, a track under 10 minutes, or the local Python version.');
        const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i).slice());
        const response = await fetch(new URL('./fonts/Tektur.ttf', import.meta.url));
        if (!response.ok) throw new Error('Could not load the export font. Reload the page and retry.');
        const font = await response.arrayBuffer();
        if (selection.logoFile) logo = await createImageBitmap(selection.logoFile);
        if (id !== generation) { logo?.close(); return; }
        worker = new Worker(new URL('./export-worker.bundle.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          if (id !== generation) return;
          if (data.type === 'progress') callbacks.progress(data);
          else if (data.type === 'complete') { cleanup(); callbacks.complete(new Blob([data.buffer], { type: 'video/mp4' }), data); }
          else if (data.type === 'error') { cleanup(); callbacks.failed(new Error(data.message)); }
        };
        worker.onerror = event => { if (id === generation) { cleanup(); callbacks.failed(new Error(event.message || 'Export worker stopped. Try a lower resolution.')); } };
        const transfer = [...channels.map(channel => channel.buffer), font];
        if (logo) transfer.push(logo);
        worker.postMessage({ settings: selection.settings, channels, sampleRate: decoded.sampleRate, font, logo }, transfer);
      } catch (error) {
        if (id === generation) { cleanup(); logo?.close(); callbacks.failed(error); }
      } finally { if (decoder) await decoder.close().catch(() => {}); }
    },
  };
}
