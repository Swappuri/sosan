export const ECHO_LIFETIME = 1.6;
// Retain only audio-triggered pulses; the renderer never invents clock-based rings.
export function updateEchoes(state, onset, time) {
  if (time < (state.echoTime ?? time) - .01) { state.echoes = []; state.lastEchoBeat = -Infinity; }
  state.echoTime = time;
  state.echoes = (state.echoes ?? []).filter(beat => time >= beat.time && time - beat.time < ECHO_LIFETIME);
  if (onset > .1 && time - (state.lastEchoBeat ?? -Infinity) >= .22) {
    state.echoes.push({ time, strength: .4 + .6 * Math.min(1, onset) });
    state.echoes = state.echoes.slice(-8);
    state.lastEchoBeat = time;
  }
}
