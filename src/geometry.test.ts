import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groundDistance, inRoi, roiPolygon, iou, pickLead, ema, resolveStatus, formatDistance, median,
} from './geometry.ts';
import type { Calib, Det } from './types.ts';

const near = (a: number | null, b: number, eps = 1e-9) => {
  assert.notEqual(a, null);
  assert.ok(Math.abs((a as number) - b) <= eps, `${a} != ${b}`);
};

const cal = (o: Partial<Calib> = {}): Calib => ({ heightM: 1.5, vfovDeg: 90, horizonY: 0.5, confirmed: true, ...o });

// Box in a 1000x1000 frame, centered at cxN, bottom at bottomN.
const box = (cxN: number, bottomN: number, w = 100, h = 100): Det => ({
  x: cxN * 1000 - w / 2, y: bottomN * 1000 - h, w, h, label: 'car', score: 0.9,
});

test('groundDistance', () => {
  near(groundDistance(550, 1000, cal()), 15);
  near(groundDistance(1000, 1000, cal()), 1.5);
  assert.equal(groundDistance(500, 1000, cal()), null);
  assert.equal(groundDistance(400, 1000, cal({ horizonY: 0.4 })), null);
});

test('inRoi', () => {
  assert.equal(inRoi(0.5, 0.9, 0.45), true);
  assert.equal(inRoi(0.05, 0.9, 0.45), false);
  assert.equal(inRoi(0.5, 0.4, 0.45), false);
  assert.equal(inRoi(0.5, 0.45, 0.45), false); // exactly on horizon
});

test('roiPolygon vertices agree with inRoi', () => {
  const h = 0.45;
  const [tl, tr, br, bl] = roiPolygon(h);
  assert.equal(tl[1], h);
  assert.equal(tr[1], h);
  assert.equal(br[1], 1);
  assert.equal(bl[1], 1);
  assert.ok(tl[0] < tr[0] && bl[0] < br[0]);
  const e = 1e-6;
  // Bottom edge corners.
  assert.equal(inRoi(br[0] - e, 1, h), true);
  assert.equal(inRoi(br[0] + e, 1, h), false);
  assert.equal(inRoi(bl[0] + e, 1, h), true);
  assert.equal(inRoi(bl[0] - e, 1, h), false);
  // Midpoint of each slanted edge.
  const midY = (h + 1) / 2;
  const rightX = (tr[0] + br[0]) / 2;
  const leftX = (tl[0] + bl[0]) / 2;
  assert.equal(inRoi(rightX - e, midY, h), true);
  assert.equal(inRoi(rightX + e, midY, h), false);
  assert.equal(inRoi(leftX + e, midY, h), true);
  assert.equal(inRoi(leftX - e, midY, h), false);
  // Just below the top edge is inside; the top edge itself is not.
  assert.equal(inRoi(0.5, h + e, h), true);
  assert.equal(inRoi(0.5, h, h), false);
});

test('iou', () => {
  const a: Det = { x: 0, y: 0, w: 10, h: 10, label: 'car', score: 1 };
  assert.equal(iou(a, a), 1);
  assert.equal(iou(a, { ...a, x: 10 }), 0); // touching only
  assert.equal(iou(a, { ...a, x: 100 }), 0);
  near(iou(a, { ...a, x: 5 }), 50 / 150);
});

test('pickLead: nearest in ROI wins', () => {
  const far = box(0.5, 0.7);
  const close = box(0.5, 0.9);
  assert.equal(pickLead([far, close], null, 1000, 1000, 0.45), close);
});

test('pickLead: box outside ROI -> null; empty -> null', () => {
  assert.equal(pickLead([box(0.05, 0.9)], null, 1000, 1000, 0.45), null);
  assert.equal(pickLead([], null, 1000, 1000, 0.45), null);
});

test('pickLead hysteresis: keeps prev when nearest is only slightly lower', () => {
  const prev = box(0.5, 0.80);
  const slightlyNearer = box(0.5, 0.81); // overlaps prev, margin 0.01 < 0.03
  const same = box(0.5, 0.80);
  assert.equal(pickLead([slightlyNearer, same], prev, 1000, 1000, 0.45), same);
});

test('pickLead hysteresis: switches to a clearly nearer cut-in car', () => {
  const prev = box(0.5, 0.80);
  const same = box(0.5, 0.80);
  const cutIn = box(0.6, 0.95); // no overlap with prev, margin 0.15
  assert.equal(pickLead([same, cutIn], prev, 1000, 1000, 0.45), cutIn);
});

test('pickLead hysteresis: no IoU match with prev -> nearest', () => {
  const prev = box(0.45, 0.60);
  const a = box(0.5, 0.80);
  const b = box(0.5, 0.81);
  assert.equal(pickLead([a, b], prev, 1000, 1000, 0.45), b);
});

test('ema', () => {
  assert.equal(ema(null, 10), 10);
  near(ema(10, 20), 13); // alpha 0.3
  assert.equal(ema(10, 20, 1), 20);
});

const baseInput = () => ({
  ready: true, error: false, hasVideo: true, calib: cal(),
  dets: [box(0.5, 0.8)], lead: box(0.5, 0.8), rawDistance: 15 as number | null, imgH: 1000, imgW: 1000,
});

test('resolveStatus: SPEC 7.1 rows in priority order', () => {
  assert.equal(resolveStatus({ ...baseInput(), ready: false }), 'loading');
  assert.equal(resolveStatus({ ...baseInput(), hasVideo: false, ready: true }), 'no-video');
  assert.equal(resolveStatus({ ...baseInput(), calib: cal({ confirmed: false }) }), 'uncalibrated');
  assert.equal(resolveStatus({ ...baseInput(), dets: [], lead: null, rawDistance: null }), 'no-vehicle');
  assert.equal(resolveStatus({ ...baseInput(), lead: null, rawDistance: null }), 'no-lead');
  assert.equal(resolveStatus({ ...baseInput(), lead: box(0.5, 1.0) }), 'too-close');
  assert.equal(resolveStatus({ ...baseInput(), rawDistance: null }), 'above-horizon');
  assert.equal(resolveStatus({ ...baseInput(), rawDistance: 80 }), 'out-of-range');
  assert.equal(resolveStatus(baseInput()), 'ok');
});

test('resolveStatus: model-error beats loading and everything else', () => {
  assert.equal(resolveStatus({ ...baseInput(), ready: false, error: true }), 'model-error');
  assert.equal(resolveStatus({ ...baseInput(), ready: true, error: true, hasVideo: false }), 'model-error');
});

test('resolveStatus: uncalibrated with dets (spec case) and priority over no-lead', () => {
  assert.equal(resolveStatus({ ...baseInput(), calib: cal({ confirmed: false }), lead: null }), 'uncalibrated');
});

test('resolveStatus: boundaries', () => {
  // too-close is >= 0.98 * imgH
  assert.equal(resolveStatus({ ...baseInput(), lead: box(0.5, 0.98) }), 'too-close');
  assert.equal(resolveStatus({ ...baseInput(), lead: box(0.5, 0.97) }), 'ok');
  // out-of-range is strictly > MAX_RANGE_M
  assert.equal(resolveStatus({ ...baseInput(), rawDistance: 50 }), 'ok');
  assert.equal(resolveStatus({ ...baseInput(), rawDistance: 50.01 }), 'out-of-range');
});

test('resolveStatus: no lead but a centered car above the horizon -> above-horizon; edge car -> no-lead', () => {
  const c = cal({ horizonY: 0.5 });
  const noLead = { ...baseInput(), calib: c, lead: null, rawDistance: null };
  assert.equal(resolveStatus({ ...noLead, dets: [box(0.5, 0.4)] }), 'above-horizon');
  assert.equal(resolveStatus({ ...noLead, dets: [box(0.5, 0.5)] }), 'above-horizon'); // exactly on horizon
  assert.equal(resolveStatus({ ...noLead, dets: [box(0.05, 0.4)] }), 'no-lead');
});

test('formatDistance', () => {
  assert.equal(formatDistance(12.34), '12.5 m');
  assert.equal(formatDistance(27.6), '28 m');
  assert.equal(formatDistance(5), '5.0 m');
  assert.equal(formatDistance(12.2), '12.0 m');
  assert.equal(formatDistance(0.1), '0.0 m');
});

test('formatDistance boundary at 20: values rounding up to 20 print "20 m", not "20.0 m"', () => {
  assert.equal(formatDistance(19.7), '19.5 m');
  assert.equal(formatDistance(19.8), '20 m');
  assert.equal(formatDistance(19.99), '20 m');
  assert.equal(formatDistance(20), '20 m');
  assert.equal(formatDistance(20.4), '20 m');
  assert.equal(formatDistance(20.5), '21 m');
});

test('median', () => {
  assert.equal(median([]), 0);
  assert.equal(median([5]), 5);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  const xs = [9, 1, 5];
  median(xs);
  assert.deepEqual(xs, [9, 1, 5]); // input not mutated
});
