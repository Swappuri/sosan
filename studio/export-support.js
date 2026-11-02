export function optionSupport(supported, resolution, fps, resolutions, frameRates) {
  return {
    resolutions: resolutions.map(value => supported.has(`${value}/${fps}`)),
    frameRates: frameRates.map(value => supported.has(`${resolution}/${value}`)),
  };
}

export async function probeExportSupport(resolutions, frameRates) {
  if (!globalThis.Worker || !globalThis.VideoEncoder || !globalThis.OffscreenCanvas) return new Set();
  const requests = resolutions.flatMap(resolution => frameRates.map(fps => {
    const [width, height] = resolution.split('x').map(Number);
    return { key: `${resolution}/${fps}`, width, height, fps: Number(fps) };
  }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./export-worker.bundle.js', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Capability check timed out')); }, 30000);
    worker.onmessage = ({ data }) => {
      if (data.type !== 'capabilities') return;
      clearTimeout(timer); worker.terminate(); resolve(new Set(data.supported));
    };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('Capability check failed')); };
    worker.postMessage({ type: 'capabilities', requests });
  });
}
