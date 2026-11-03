import { exportBitrate } from '../studio/export-quality.js';
import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioSampleSource, AudioSample, Quality, canEncodeVideo, canEncodeAudio } from 'mediabunny';
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { renderScene } from '../studio/render-scene.js';
import { SpectrumAnalysis, advanceMotion, frameCount } from '../studio/audio-analysis.js';

self.onmessage = async ({ data }) => {
  if (data.type === 'capabilities') {
    const supported = [];
    // Probe in the same worker environment and with the same encoder settings as export.
    for (const request of data.requests) {
      try {
        const quality = new Quality({ bitrate: exportBitrate(request.height, request.fps) });
        if (await canEncodeVideo('avc', { width: request.width, height: request.height, frameRate: request.fps, quality })) supported.push(request.key);
      } catch { /* An unavailable configuration remains disabled. */ }
    }
    self.postMessage({ type: 'capabilities', supported });
    return;
  }
  let output;
  try {
    const { settings, channels, sampleRate, font, fontSpec, logo, backgroundImage } = data;
    const { width, height, fps } = settings;
    const bitrate = exportBitrate(height, fps);
    const quality = new Quality({ bitrate });
    if (!(await canEncodeVideo('avc', { width, height, frameRate: fps, quality }))) {
      throw new Error('H.264 encoding is unavailable for this resolution and frame rate on your device. Try a lower resolution or frame rate.');
    }
    if (!(await canEncodeAudio('aac', { sampleRate, numberOfChannels: channels.length }))) registerAacEncoder();
    if (font && typeof FontFace !== 'undefined' && self.fonts) {
      const face = new FontFace(fontSpec.family, font, { weight: fontSpec.weight });
      await face.load(); self.fonts.add(face);
    }
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false });
    const target = new BufferTarget();
    output = new Output({ format: new Mp4OutputFormat(), target });
    const video = new CanvasSource(canvas, { codec: 'avc', quality, keyFrameInterval: 2 });
    const audio = new AudioSampleSource({ codec: 'aac', quality: new Quality({ bitrate: 192_000 }) });
    output.addVideoTrack(video, { frameRate: fps });
    output.addAudioTrack(audio);
    await output.start();
    const analysis = new SpectrumAnalysis(channels, sampleRate, settings.bars / 2, settings.sensitivity);
    const motion = { levels: new Float32Array(settings.bars / 2), bass: 0, flash: 0 };
    const total = frameCount(channels[0].length, sampleRate, fps);
    let audioCursor = 0;
    for (let frame = 0; frame < total; frame++) {
      const timestamp = frame / fps;
      advanceMotion(motion, analysis.frame(timestamp), 1 / fps);
      renderScene(ctx, width, height, settings, motion, timestamp, logo, settings.title, backgroundImage);
      await video.add(timestamp, 1 / fps);
      const end = Math.min(channels[0].length, Math.round((frame + 1) / fps * sampleRate));
      const count = end - audioCursor;
      if (count > 0) {
        const pcm = new Float32Array(count * channels.length);
        channels.forEach((channel, index) => pcm.set(channel.subarray(audioCursor, end), index * count));
        const sample = new AudioSample({ data: pcm, format: 'f32-planar', numberOfChannels: channels.length, sampleRate, timestamp: audioCursor / sampleRate });
        try { await audio.add(sample); } finally { sample.close(); }
        audioCursor = end;
      }
      if (frame % fps === 0 || frame === total - 1) self.postMessage({ type: 'progress', progress: 5 + 93 * (frame + 1) / total, frame: frame + 1, total });
    }
    video.close(); audio.close();
    self.postMessage({ type: 'progress', progress: 99, phase: 'Finalizing MP4' });
    await output.finalize();
    if (logo) logo.close();
    self.postMessage({ type: 'complete', buffer: target.buffer, frames: total, fps }, [target.buffer]);
  } catch (error) {
    try { await output?.cancel(); } catch { /* Preserve the original encode error. */ }
    self.postMessage({ type: 'error', message: error.message || String(error) });
  }
};
