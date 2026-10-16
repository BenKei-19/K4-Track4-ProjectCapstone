import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertLevel, requiredMinDistance, sigmaM } from './alert.ts';

test('requiredMinDistance follows TT 38/2024 tiers', () => {
  assert.equal(requiredMinDistance(50), null);
  assert.equal(requiredMinDistance(60), 35);
  assert.equal(requiredMinDistance(61), 55);
  assert.equal(requiredMinDistance(80), 55);
  assert.equal(requiredMinDistance(81), 70);
  assert.equal(requiredMinDistance(100), 70);
  assert.equal(requiredMinDistance(120), 100);
  assert.equal(requiredMinDistance(130), null);
});

test('alertLevel is conservative with uncertainty', () => {
  assert.equal(alertLevel('ok', 20, 2, 55), 'below');
  assert.equal(alertLevel('ok', 54, 2, 55), 'near');
  assert.equal(alertLevel('ok', 40, 2, 35), 'meets');
  assert.equal(alertLevel('too-close', null, 0, 35), 'below');
  assert.equal(alertLevel('no-lead', null, 0, 70), 'none-seen'); // không thấy xe ≠ an toàn
  assert.equal(alertLevel('ok', 20, 1, null), 'no-rule');
  assert.equal(alertLevel('uncalibrated', null, 0, 35), 'unknown');
});

test('sigmaM grows with d²', () => {
  const c = { heightM: 1.3, vfovDeg: 41, horizonY: 0.45, confirmed: true };
  const s10 = sigmaM(10, c, 1280, 720), s20 = sigmaM(20, c, 1280, 720);
  assert.ok(Math.abs(s20 / s10 - 4) < 1e-9);
});
