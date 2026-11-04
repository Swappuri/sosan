/** Analyze the whole track, then follow nearby attacks instead of free-running. */
export function trackPulses(channels, sampleRate) {
  const rate = 100, hop = Math.max(1, Math.round(sampleRate / rate));
  const energy = new Float64Array(Math.ceil(channels[0].length / hop));
  let low = 0;
  const alpha = 1 - Math.exp(-2 * Math.PI * 180 / sampleRate);
  for (let i = 0; i < channels[0].length; i++) {
    let sample = 0;
    for (const channel of channels) sample += channel[i] / channels.length;
    low += alpha * (sample - low);
    energy[Math.floor(i / hop)] += low * low;
  }
  const envelope = Float64Array.from(energy, (value, i) => Math.max(0, Math.sqrt(value / hop) - Math.sqrt((energy[Math.max(0, i - 2)] || 0) / hop)));
  const peaks = [];
  const max = envelope.reduce((a, b) => Math.max(a, b), 0);
  if (max < 1e-7) return [];
  for (let i = 1; i < envelope.length - 1; i++) {
    if (envelope[i] > max * .06 && envelope[i] >= envelope[i - 1] && envelope[i] > envelope[i + 1]) peaks.push(i);
  }
  let period = 50, best = -1;
  for (let lag = 33; lag <= 100; lag++) {
    let score = 0;
    for (let i = lag; i < envelope.length; i++) score += envelope[i] * envelope[i - lag];
    score *= 1 - .15 * Math.abs(Math.log2(lag / 50));
    if (score > best) { best = score; period = lag; }
  }
  let phase = 0, phaseScore = -1;
  for (let offset = 0; offset < period; offset++) {
    let score = 0;
    for (let i = offset; i < envelope.length; i += period) for (let j = -3; j <= 3; j++) score += envelope[i + j] || 0;
    if (score > phaseScore) { phaseScore = score; phase = offset; }
  }
  const beats = [];
  let cursor = 0;
  for (let predicted = phase; predicted < envelope.length; predicted += period) {
    while (cursor < peaks.length && peaks[cursor] < predicted - period * .22) cursor++;
    let chosen = -1, score = -1;
    for (let j = cursor; j < peaks.length && peaks[j] <= predicted + period * .22; j++) {
      const candidate = envelope[peaks[j]] * (1 - Math.abs(peaks[j] - predicted) / period);
      if (candidate > score) { score = candidate; chosen = peaks[j]; }
    }
    if (chosen >= 0) {
      beats.push(chosen / rate);
      predicted += (chosen - predicted) * .35;
    } else beats.push(null);
  }
  return beats.filter((time, index) => index % 4 === 0 && time !== null);
}
export function scheduledEchoes(pulses, time, lifetime = 1.6) {
  // Binary search keeps long tracks cheap to preview and seek.
  let low = 0, high = pulses.length;
  while (low < high) { const mid = (low + high) >>> 1; if (pulses[mid] <= time) low = mid + 1; else high = mid; }
  const echoes = [];
  for (let i = low - 1; i >= 0 && time - pulses[i] < lifetime; i--) echoes.unshift({ time: pulses[i], strength: 1 });
  return echoes;
}
export function smoothFlash(state, onset, dt) {
  state.flashEnvelope = Math.max((state.flashEnvelope ?? 0) * Math.exp(-dt * 5), Math.min(1, onset));
  const value = state.flash ?? 0;
  return value + (state.flashEnvelope - value) * (1 - Math.exp(-dt * (state.flashEnvelope > value ? 20 : 7)));
}
