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


test('bass moves down both sides with exact mirrored bar geometry', () => {
  for (const rotation of [0, 23, 90, 137, 180]) {
    const canvas = canvasContext(), starts = [], ends = [];
    canvas.ctx.moveTo = (...point) => starts.push(point);
    canvas.ctx.lineTo = (...point) => ends.push(point);
    const levels = new Float32Array(64); levels[0] = 1;
    renderScene(canvas.ctx, 1280, 720, { ...settings, rotation }, { ...motion, levels }, 1, null, 'Title');
    for (let i = 0; i < 64; i++) {
      const j = 127 - i;
      assert.ok(Math.abs(starts[i][0] + starts[j][0] - 1280) < 1e-8);
      assert.ok(Math.abs(ends[i][0] + ends[j][0] - 1280) < 1e-8);
      assert.ok(Math.abs(ends[i][1] - ends[j][1]) < 1e-8);
    }
    const longest = starts.slice(0, 64).map((p, i) => Math.hypot(ends[i][0] - p[0], ends[i][1] - p[1]));
    const peak = longest.indexOf(Math.max(...longest));
    assert.ok(Math.abs(peak - rotation / 180 * 63) <= 1);
    assert.deepEqual(canvas.text[0].slice(1), [640, 360]);
  }
});
