import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackPulses, scheduledEchoes, smoothFlash } from '../../studio/beat-grid.js';
test('whole-track pulse grid follows offset kicks and is seek deterministic', () => {
 const sr = 8000, pcm = new Float32Array(sr * 12);
 for (let t = .23; t < 12; t += .5) for (let i = 0; i < sr * .12; i++) pcm[Math.round(t * sr) + i] = Math.sin(i * 2 * Math.PI * 80 / sr) * Math.exp(-i / (sr * .025));
 const pulses = trackPulses([pcm], sr);
 assert.ok(pulses.length >= 5);
 for (const pulse of pulses) assert.ok(Math.abs((pulse - .23) / .5 - Math.round((pulse - .23) / .5)) < .08);
 assert.deepEqual(scheduledEchoes(pulses, 7), scheduledEchoes(pulses, 7));
 assert.deepEqual(trackPulses([new Float32Array(sr)],sr), []);
});
test('flash has a gradual attack and release rather than snapping to the onset', () => {
 const state = {flash:0}; state.flash = smoothFlash(state, 1, 1/60);
 assert.ok(state.flash > 0 && state.flash < .4);
 const first = state.flash; state.flash = smoothFlash(state, 0, 1/60);
 assert.ok(state.flash > first);
 for(let i=0;i<120;i++) state.flash=smoothFlash(state,0,1/60);
 assert.ok(state.flash < .001);
});
