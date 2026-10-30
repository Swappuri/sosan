import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderScene } from '../../studio/render-scene.js';
import { syncPlaybackButton } from '../../studio/playback-state.js';

const settings = { primary: '#a7f36b', secondary: '#5de5ec', background: '#0b1114', radius: 115, bars: 128, particles: true, pulse: true, glow: true };
const motion = { levels: new Float32Array(64).fill(.4), bass: .5, flash: 0 };
function canvasContext() {
  const text = [], images = [];
  let saves = 0;
  const ctx = new Proxy({
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: value => ({ width: value.length * 12 }),
    fillText: (...args) => text.push(args),
    drawImage: (...args) => images.push(args),
    save: () => saves++, restore: () => saves--,
  }, { get(target, key) { return target[key] ?? (() => {}); } });
  return { ctx, text, images, get saves() { return saves; } };
}

test('nonempty display text renders without throwing on successive frames', () => {
  const canvas = canvasContext();
  for (const title of ['My track', 'Changed text', '音楽 ✦']) renderScene(canvas.ctx, 1280, 720, settings, motion, 1, null, title);
  assert.deepEqual(canvas.text.map(call => call[0]), ['My track', 'Changed text', '音楽 ✦']);
});

test('logo drawing restores the canvas clip even if an image fails', () => {
  const canvas = canvasContext();
  canvas.ctx.drawImage = () => { throw new Error('Bad image'); };
  assert.throws(() => renderScene(canvas.ctx, 1280, 720, settings, motion, 1, { width: 100, height: 100 }, ''), /Bad image/);
  assert.equal(canvas.saves, 0);
  renderScene(canvas.ctx, 1280, 720, settings, motion, 2, null, 'Recovered');
  assert.equal(canvas.text[0][0], 'Recovered');
});

test('valid logos render and closed bitmaps fall back to display text', () => {
  const canvas = canvasContext();
  const logo = { width: 200, height: 100 };
  renderScene(canvas.ctx, 1280, 720, settings, motion, 1, logo, 'Title');
  assert.equal(canvas.images[0][0], logo);
  renderScene(canvas.ctx, 1280, 720, settings, motion, 2, { width: 0, height: 0 }, 'Title');
  assert.equal(canvas.text[0][0], 'Title');
});

test('play symbol follows replacement/loading/ended state, not stale media events', () => {
  const attributes = new Map();
  const button = { textContent: '', getAttribute: key => attributes.get(key), setAttribute: (key, value) => attributes.set(key, value) };
  syncPlaybackButton(button, { paused: false, ended: false }, true);
  assert.equal(button.textContent, 'Ⅱ');
  syncPlaybackButton(button, { paused: false, ended: false }, false);
  assert.equal(button.textContent, '▶');
  assert.equal(attributes.get('aria-label'), 'Play');
  syncPlaybackButton(button, { paused: true, ended: false }, true);
  assert.equal(button.textContent, '▶');
  syncPlaybackButton(button, { paused: false, ended: false }, true);
  assert.equal(attributes.get('aria-label'), 'Pause');
  syncPlaybackButton(button, { paused: false, ended: true }, true);
  assert.equal(button.textContent, '▶');
});


test('rotation moves bass clockwise without rotating the center logo', () => {
  const positions = [];
  for (const rotation of [0, 90, 180, 360]) {
    const canvas = canvasContext(), starts = [];
    canvas.ctx.moveTo = (...point) => starts.push(point);
    const logo = { width: 100, height: 100 };
    renderScene(canvas.ctx, 1280, 720, { ...settings, rotation }, motion, 1, logo, 'Title');
    positions.push(starts[0]);
    assert.equal(canvas.images[0][1] + canvas.images[0][3] / 2, 640);
    assert.equal(canvas.images[0][2] + canvas.images[0][4] / 2, 360);
  }
  assert.ok(Math.abs(positions[0][0] - 640) < 1e-8 && positions[0][1] < 360);
  assert.ok(positions[1][0] > 640 && Math.abs(positions[1][1] - 360) < 1e-8);
  assert.ok(Math.abs(positions[2][0] - 640) < 1e-8 && positions[2][1] > 360);
  positions[0].forEach((value, index) => assert.ok(Math.abs(value - positions[3][index]) < 1e-8));
});
