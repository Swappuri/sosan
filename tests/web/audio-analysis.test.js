import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpectrumAnalysis, frameCount, advanceMotion } from '../../studio/audio-analysis.js';

test('fractional final frames are retained', () => {
  assert.equal(frameCount(24816, 48000, 60), 32);
  assert.equal(frameCount(48000 * 3, 48000, 30), 90);
});

test('silence produces no spectrum, bass, or flashes', () => {
  const analysis = new SpectrumAnalysis([new Float32Array(48000)], 48000, 64, 1.2);
  for (const t of [0, .25, .5, .99]) {
    const frame = analysis.frame(t);
    assert.ok(frame.levels.every(value => value === 0));
    assert.equal(frame.bass, 0);
    assert.equal(frame.onset, 0);
  }
});

test('a tone has its strongest response near its frequency', () => {
  const sampleRate = 48000;
  const pcm = Float32Array.from({ length: sampleRate }, (_, i) => .3 * Math.sin(2 * Math.PI * 1000 * i / sampleRate));
  const analysis = new SpectrumAnalysis([pcm], sampleRate, 64, 1);
  const { levels } = analysis.frame(.5);
  let strongest = 0;
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[strongest]) strongest = i;
  const frequency = 35 * (14000 / 35) ** ((strongest + .5) / 64);
  assert.ok(frequency > 800 && frequency < 1200);
  assert.ok(levels[strongest] > .4);
});

test('frame-clock motion is deterministic and responds to audio', () => {
  const make = () => ({ levels: new Float32Array(64), bass: 0, flash: 0 });
  const a = make(), b = make();
  const target = { levels: new Float32Array(64).fill(.8), bass: .9, onset: .5 };
  for (let i = 0; i < 20; i++) { advanceMotion(a, target, 1 / 30); advanceMotion(b, target, 1 / 30); }
  assert.deepEqual(a, b);
  assert.ok(a.levels[0] > .7 && a.bass > .8);
});


test('high reactivity retains differences instead of clipping bands to one', () => {
  const pcm = Float32Array.from({ length: 48000 }, (_, i) => .9 * Math.sin(2 * Math.PI * 70 * i / 48000));
  const a = new SpectrumAnalysis([pcm], 48000, 64, 2.1).frame(.5).levels;
  const b = new SpectrumAnalysis([pcm], 48000, 64, 2.5).frame(.5).levels;
  assert.ok(Math.max(...a) < Math.max(...b));
  assert.ok(Math.max(...b) < 1);
});
