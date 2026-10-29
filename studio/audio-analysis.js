/** Frame-clock spectrum analysis; independent of playback and browser timers. */
export function frameCount(samples, sampleRate, fps) {
  return Math.ceil(samples / sampleRate * fps);
}

export class SpectrumAnalysis {
  constructor(channels, sampleRate, bands, sensitivity, size = 4096) {
    if (size < 2 || (size & (size - 1))) throw new Error('FFT size must be a power of two.');
    this.channels = channels;
    this.sampleRate = sampleRate;
    this.sensitivity = sensitivity;
    this.size = size;
    this.real = new Float64Array(size);
    this.imaginary = new Float64Array(size);
    this.smoothed = new Float64Array(size / 2);
    this.spectrum = new Float64Array(size / 2);
    this.window = Float64Array.from({ length: size }, (_, i) => .42 - .5 * Math.cos(2 * Math.PI * i / size) + .08 * Math.cos(4 * Math.PI * i / size));
    this.ranges = Array.from({ length: bands }, (_, i) => {
      const low = Math.max(1, Math.floor(35 * (14000 / 35) ** (i / bands) * size / sampleRate));
      const high = Math.min(size / 2, Math.max(low + 1, Math.ceil(35 * (14000 / 35) ** ((i + 1) / bands) * size / sampleRate)));
      return [low, high];
    });
    this.levels = new Float32Array(bands);
    this.previousBass = 0;
    this.reverse = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let n = i, r = 0;
      for (let j = 0; j < bits; j++) { r = (r << 1) | (n & 1); n >>= 1; }
      this.reverse[i] = r;
    }
  }

  frame(seconds) {
    const { size, channels, real, imaginary, reverse, window } = this;
    const center = Math.round(seconds * this.sampleRate);
    for (let i = 0; i < size; i++) {
      const sampleIndex = center + i - size / 2;
      let sample = 0;
      if (sampleIndex >= 0 && sampleIndex < channels[0].length) {
        for (const channel of channels) sample += channel[sampleIndex] / channels.length;
      }
      real[reverse[i]] = sample * window[i];
      imaginary[i] = 0;
    }
    for (let length = 2; length <= size; length *= 2) {
      const angle = -2 * Math.PI / length;
      const stepReal = Math.cos(angle), stepImaginary = Math.sin(angle);
      for (let first = 0; first < size; first += length) {
        let wr = 1, wi = 0;
        for (let j = 0; j < length / 2; j++) {
          const a = first + j, b = a + length / 2;
          const tr = wr * real[b] - wi * imaginary[b];
          const ti = wr * imaginary[b] + wi * real[b];
          real[b] = real[a] - tr; imaginary[b] = imaginary[a] - ti;
          real[a] += tr; imaginary[a] += ti;
          const next = wr * stepReal - wi * stepImaginary;
          wi = wr * stepImaginary + wi * stepReal; wr = next;
        }
      }
    }
    for (let i = 0; i < size / 2; i++) {
      const magnitude = Math.hypot(real[i], imaginary[i]) / size;
      this.smoothed[i] = .55 * this.smoothed[i] + .45 * magnitude;
      this.spectrum[i] = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(1e-12, this.smoothed[i])) + 90) / 75));
    }
    for (let i = 0; i < this.ranges.length; i++) {
      const [low, high] = this.ranges[i];
      let power = 0;
      for (let j = low; j < high; j++) power += this.spectrum[j] ** 2;
      this.levels[i] = Math.min(1, Math.sqrt(power / Math.max(1, high - low)) * this.sensitivity);
    }
    const first = Math.ceil(35 * size / this.sampleRate), last = Math.ceil(160 * size / this.sampleRate);
    let low = 0;
    for (let j = first; j < last; j++) low += this.spectrum[j];
    const bass = Math.max(0, low / Math.max(1, last - first) - .15) * this.sensitivity;
    const onset = Math.min(1, Math.max(0, bass - this.previousBass) * 6);
    this.previousBass = bass;
    return { levels: this.levels, bass, onset };
  }
}

export function advanceMotion(motion, target, dt) {
  for (let i = 0; i < motion.levels.length; i++) {
    const rate = target.levels[i] > motion.levels[i] ? 24 : 8;
    motion.levels[i] += (target.levels[i] - motion.levels[i]) * (1 - Math.exp(-dt * rate));
  }
  motion.bass += (target.bass - motion.bass) * (1 - Math.exp(-dt * (target.bass > motion.bass ? 22 : 6)));
  motion.flash = Math.max(motion.flash * Math.exp(-dt * 9), target.onset);
}
