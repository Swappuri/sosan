import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optionSupport } from '../../studio/export-support.js';
test('menu availability depends on the other selected setting', () => {
  const supported = new Set(['1280x720/30', '1280x720/60', '3840x2160/30']);
  const resolutions = ['1280x720', '3840x2160'], rates = ['30', '60', '120'];
  assert.deepEqual(optionSupport(supported, '1280x720', '60', resolutions, rates), { resolutions: [true, false], frameRates: [true, true, false] });
  assert.deepEqual(optionSupport(supported, '3840x2160', '30', resolutions, rates), { resolutions: [true, true], frameRates: [true, false, false] });
  assert.deepEqual(optionSupport(new Set(), '1280x720', '30', resolutions, rates), { resolutions: [false, false], frameRates: [false, false, false] });
});
