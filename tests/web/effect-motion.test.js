import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateEchoes } from '../../studio/effect-motion.js';
test('echoes respond to audio attacks, avoid duplicate beats, expire, and reset on rewind', () => {
  const state = {};
  updateEchoes(state, 0, 0); updateEchoes(state, 0, .5);
  assert.equal(state.echoes.length, 0);
  updateEchoes(state, .8, .6); updateEchoes(state, .9, .65);
  assert.equal(state.echoes.length, 1);
  updateEchoes(state, .7, 1);
  assert.equal(state.echoes.length, 2);
  updateEchoes(state, 0, 2.3);
  assert.equal(state.echoes.length, 1);
  updateEchoes(state, 0, 0);
  assert.equal(state.echoes.length, 0);
});
