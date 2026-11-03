export const ECHO_LIFETIME = 1.6;
// Estimate tempo from recent attacks, then emit one pulse every four beats.
// The first attack anchors the grid; musical downbeats cannot be inferred reliably
// from bass attacks alone, so this is a four-beat pulse, not a bar detector.
export function updateEchoes(state, onset, time) {
  if (time < (state.echoTime ?? time) - .01) {
    state.echoes = []; state.beatTimes = []; state.nextEcho = undefined; state.period = undefined;
  }
  state.echoTime = time;
  state.echoes = (state.echoes ?? []).filter(beat => time >= beat.time && time - beat.time < ECHO_LIFETIME);
  const beats = state.beatTimes ??= [];
  if (onset > .1 && time - (beats.at(-1) ?? -Infinity) >= .28) {
    if (beats.length && time - beats.at(-1) > 2) { beats.length = 0; state.nextEcho = undefined; state.period = undefined; }
    beats.push(time);
    if (beats.length > 12) beats.shift();
    if (beats.length >= 4) {
      const intervals = beats.slice(1).map((beat, i) => {
        let interval = beat - beats[i];
        while (interval > .85) interval /= 2;
        while (interval < .35) interval *= 2;
        return interval;
      }).sort((a, b) => a - b);
      const estimate = intervals[Math.floor(intervals.length / 2)];
      state.period = state.period ? state.period * .9 + estimate * .1 : estimate;
      state.nextEcho ??= beats[0] + state.period * 4;
    }
    state.lastAttack = time;
  }
  if (state.period && time - state.lastAttack < 2 && time >= state.nextEcho) {
    const scheduled = state.nextEcho;
    state.nextEcho += (Math.floor((time - scheduled) / (state.period * 4)) + 1) * state.period * 4;
    if (time - scheduled < ECHO_LIFETIME) state.echoes.push({ time: scheduled, strength: 1 });
  }
}
