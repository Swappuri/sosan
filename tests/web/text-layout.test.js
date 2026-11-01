import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutText, textHalfWidth } from '../../studio/text-layout.js';
const measure = (text, size) => Array.from(text).length * size * .6;
for (const shape of ['circle', 'square', 'triangle']) {
  test(`${shape}: words wrap before reducing the selected size`, () => {
    const text = 'Sky full of stars';
    const result = layoutText(text, shape, 100, 24, measure);
    assert.equal(result.fontSize, 24);
    assert.ok(result.lines.length > 1);
    assert.equal(result.lines.map(line => line.text).join(' '), text);
  });
  test(`${shape}: overflowing text shrinks and every line stays within its shape slice`, () => {
    const text = 'On The Floor X Sky Full of Stars dsad dsa d sad ds';
    const result = layoutText(text, shape, 70, 84, measure);
    assert.ok(result.fontSize < 84);
    assert.equal(result.lines.map(line => line.text).join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
    for (const line of result.lines) {
      assert.ok(measure(line.text, result.fontSize) <= line.width);
      for (const y of [line.y - result.lineHeight / 2, line.y + result.lineHeight / 2]) {
        assert.ok(measure(line.text, result.fontSize) <= 2 * textHalfWidth(shape, 70, y) + 1e-8);
      }
    }
  });
}
test('unbroken tokens wrap without losing characters', () => {
  const text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const result = layoutText(text, 'circle', 100, 24, measure);
  assert.equal(result.fontSize, 24);
  assert.equal(result.lines.map(line => line.text).join(''), text);
});
test('empty text has no lines', () => assert.deepEqual(layoutText(' ', 'circle', 100, 24, measure).lines, []));
