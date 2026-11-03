import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateEchoes } from '../../studio/effect-motion.js';
test('tempo pulses settle on a four-beat grid instead of every attack', () => {
  const state = {};
  for (let i = 0; i <= 60; i++) updateEchoes(state, i % 5 === 0 ? .8 : 0, i / 10);
  assert.ok(Math.abs(state.period - .5) < .01);
  assert.deepEqual(state.echoes.map(e => e.time), [6]);
  updateEchoes(state, 0, 0);
  assert.equal(state.echoes.length, 0);
  assert.equal(state.period, undefined);
});
test('silence and isolated attacks do not invent a tempo', () => {
 const state = {}; updateEchoes(state, .8, 0); updateEchoes(state, 0, 5);
 assert.equal(state.echoes.length, 0);
});
