import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderScene, spectrumBandPosition, smoothSpectrum, shapeRadius, logoPlacement } from '../../studio/render-scene.js';
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


test('180 degrees reverses the full frequency range without wrapping', () => {
  for (let position = 0; position < 64; position++) {
    assert.equal(spectrumBandPosition(position, 64, 0), position);
    assert.equal(spectrumBandPosition(position, 64, 180), 63 - position);
  }
  for (const rotation of [23, 70, 90, 137, 179]) {
    const mapped = Array.from({ length: 64 }, (_, i) => spectrumBandPosition(i, 64, rotation));
    for (let i = 1; i < 64; i++) assert.ok(Math.abs(mapped[i] - mapped[i - 1]) <= 2.001);
  }
});

test('neighbor smoothing spreads narrow peaks without blending bass and treble endpoints', () => {
  const values = new Float32Array(64); values[0] = 1;
  const smooth = smoothSpectrum(values);
  assert.ok(smooth[0] > smooth[1] && smooth[1] > smooth[2] && smooth[2] > 0);
  assert.equal(smooth[63], 0);
  assert.ok(smoothSpectrum(new Float32Array(64)).every(x => x === 0));
});


test('smoothing slider preserves sharp peaks at zero and progressively softens them', () => {
  const values = new Float32Array(64); values[32] = 1;
  assert.deepEqual(smoothSpectrum(values, 0), values);
  assert.equal(smoothSpectrum(values, 50)[32], 6 / 16);
  const roughness = values => values.slice(1).reduce((sum, value, i) => sum + (value - values[i]) ** 2, 0);
  let previous = Infinity;
  for (const amount of [0, 25, 50, 75, 100]) {
    const result = smoothSpectrum(values, amount);
    assert.ok(roughness(result) < previous);
    assert.ok(Math.abs(result.reduce((a, b) => a + b, 0) - 1) < 1e-6);
    previous = roughness(result);
  }
});


test('wave style joins every segment, closes the loop, and stays mirrored', () => {
  const canvas = canvasContext(), starts = [], curves = [], lines = [];
  canvas.ctx.moveTo = (...p) => starts.push(p);
  canvas.ctx.quadraticCurveTo = (...p) => curves.push(p);
  canvas.ctx.lineTo = (...p) => lines.push(p);
  renderScene(canvas.ctx, 1280, 720, { ...settings, rotation: 70, style: 'wave' }, motion, 1, null, 'Title');
  assert.equal(curves.length, 512);
  assert.equal(lines.length, 0);
  for (let i = 0; i < curves.length; i++) {
    assert.deepEqual(curves[i].slice(2), starts[(i + 1) % curves.length]);
    assert.ok(Math.abs(curves[i][0] + curves[curves.length - i - 1][0] - 1280) < 1e-8);
  }
  assert.deepEqual(canvas.text[0], ['Title', 640, 360]);
});


test('shape boundaries follow polygon edges and remain left-right symmetric', () => {
  assert.equal(shapeRadius('circle', 100, 0), 100);
  assert.ok(Math.abs(shapeRadius('square', 100, 0) - 100 / Math.SQRT2) < 1e-8);
  assert.ok(Math.abs(shapeRadius('triangle', 100, -Math.PI / 2) - 100) < 1e-8);
  assert.ok(Math.abs(shapeRadius('triangle', 100, Math.PI / 2) - 50) < 1e-8);
  for (const shape of ['circle', 'square', 'triangle']) {
    for (let i = 0; i < 128; i++) {
      const angle = (i + .5) / 128 * Math.PI * 2 - Math.PI / 2;
      const reach = shapeRadius(shape, 100, angle);
      assert.ok(reach >= 49.999 && reach <= 100.001);
      assert.ok(Math.abs(reach - shapeRadius(shape, 100, Math.PI - angle)) < 1e-8);
    }
    for (const style of ['bars', 'wave']) {
      const canvas = canvasContext();
      const logo = { width: 100, height: 80 };
      renderScene(canvas.ctx, 1280, 720, { ...settings, shape, style }, motion, 1, logo, 'Title');
      assert.equal(canvas.saves, 0);
      assert.equal(canvas.images[0][1] + canvas.images[0][3] / 2, 640);
      const logoCenterY = canvas.images[0][2] + canvas.images[0][4] / 2;
      if (shape === 'triangle') assert.ok(logoCenterY < 360);
      else assert.equal(logoCenterY, 360);
    }
  }
});


test('Fit keeps every image corner inside each shape, including tall and wide logos', () => {
  for (const shape of ['circle', 'square', 'triangle']) for (const [w, h] of [[100, 100], [30, 200], [200, 30]]) {
    const p = logoPlacement(shape, 100, w, h, 'contain');
    for (const x of [p.x, p.x + p.width]) for (const y of [p.y, p.y + p.height]) {
      assert.ok(Math.hypot(x, y) <= shapeRadius(shape, 100, Math.atan2(y, x)) + 1e-8);
    }
    const fill = logoPlacement(shape, 100, w, h, 'cover');
    assert.ok(fill.width >= (shape === 'triangle' ? Math.sqrt(3) : shape === 'square' ? Math.SQRT2 : 2) * 100 - 1e-8);
    assert.ok(fill.height >= (shape === 'triangle' ? 1.5 : shape === 'square' ? Math.SQRT2 : 2) * 100 - 1e-8);
  }
});

test('logo zoom and position are independent and proportional to shape size', () => {
  const base = logoPlacement('triangle', 100, 100, 100);
  const moved = logoPlacement('triangle', 100, 100, 100, 'cover', 150, 25, -10);
  assert.ok(Math.abs(moved.width - base.width * 1.5) < 1e-8);
  assert.ok(Math.abs(moved.x + moved.width / 2 - 25) < 1e-8);
  assert.ok(Math.abs(moved.y + moved.height / 2 - (-35)) < 1e-8);
});


test('logo fills to the main outline with no inset clip or inner rim', () => {
  const canvas = canvasContext(), radii = [], events = [];
  let clipRadius;
  canvas.ctx.arc = (x, y, radius) => radii.push(radius);
  canvas.ctx.clip = () => { clipRadius = radii.at(-1); };
  canvas.ctx.drawImage = () => events.push('logo');
  canvas.ctx.stroke = () => events.push('outline');
  renderScene(canvas.ctx, 854, 480, { ...settings, particles: false, pulse: false, logoFit: 'cover', innerRing: false }, motion, 1, { width: 100, height: 100 }, '');
  assert.equal(clipRadius, settings.radius);
  assert.ok(!radii.includes(settings.radius - 5));
  assert.deepEqual(events.slice(-2), ['logo', 'outline']);
});


test('inner fill spans to the outline and optional inner ring overlays logos', () => {
  for (const innerRing of [false, true]) {
    const canvas = canvasContext(), radii = [], fills = [], events = [];
    canvas.ctx.arc = (x, y, r) => radii.push(r);
    canvas.ctx.fill = () => fills.push([canvas.ctx.fillStyle, radii.at(-1)]);
    canvas.ctx.drawImage = () => events.push('logo');
    canvas.ctx.stroke = () => events.push('ring');
    renderScene(canvas.ctx, 854, 480, { ...settings, particles: false, pulse: false, innerFill: '#123456', innerRing, logoZoom: 50 }, motion, 1, { width: 100, height: 100 }, '');
    assert.deepEqual(fills[0], ['#123456', settings.radius]);
    assert.equal(radii.includes(settings.radius - 5), innerRing);
    assert.deepEqual(events.slice(-(innerRing ? 3 : 2)), innerRing ? ['logo', 'ring', 'ring'] : ['logo', 'ring']);
  }
});


test('polygon bars use the original radial geometry at every energy level', () => {
  for (const shape of ['square', 'triangle']) for (const energy of [0, .5, 1]) {
    const canvas = canvasContext(), starts = [], ends = [];
    canvas.ctx.moveTo = (...p) => starts.push(p);
    canvas.ctx.lineTo = (...p) => ends.push(p);
    renderScene(canvas.ctx, 854, 480, { ...settings, shape, style: 'bars', particles: false, pulse: false }, { ...motion, levels: new Float32Array(64).fill(energy) }, 0, null, '');
    for (let i = 0; i < settings.bars; i++) {
      const angle = (i + .5) / settings.bars * Math.PI * 2 - Math.PI / 2;
      const reach = shapeRadius(shape, settings.radius, angle) + 8;
      const length = 3 + energy ** 1.35 * 67;
      assert.ok(Math.abs(starts[i][0] - (427 + Math.cos(angle) * reach)) < 1e-8);
      assert.ok(Math.abs(starts[i][1] - (240 + Math.sin(angle) * reach)) < 1e-8);
      assert.ok(Math.abs(Math.hypot(ends[i][0] - starts[i][0], ends[i][1] - starts[i][1]) - length) < 1e-6);
    }
  }
});

test('polygon waves follow the original radial control points and band count', () => {
  for (const shape of ['square', 'triangle']) {
    const canvas = canvasContext(), curves = [];
    canvas.ctx.quadraticCurveTo = (...p) => curves.push(p);
    renderScene(canvas.ctx, 854, 480, { ...settings, shape, style: 'wave', particles: false, pulse: false }, { ...motion, levels: new Float32Array(64).fill(1) }, 0, null, '');
    assert.equal(curves.length, settings.bars);
    curves.forEach(([x, y], i) => {
      const angle = (i + .5) / settings.bars * Math.PI * 2 - Math.PI / 2;
      const reach = shapeRadius(shape, settings.radius, angle) + 8 + 70;
      assert.ok(Math.abs(x - (427 + Math.cos(angle) * reach)) < 1e-8);
      assert.ok(Math.abs(y - (240 + Math.sin(angle) * reach)) < 1e-8);
    });
  }
});
