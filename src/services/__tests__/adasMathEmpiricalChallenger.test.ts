import { describe, expect, it } from 'vitest';
import type { CameraCalibration, FusionWeights } from '../../types/adas';
import {
  applyKalman1D,
  calculateGroundPinholeDistance,
  calculateMinSafeDistance,
  calculateWidthPinholeDistance,
  fuseDistances,
} from '../adasMath';

describe('Empirical Challenger R2-1: Adversarial Stress & Invariant Harness', () => {
  const baseCalibration: CameraCalibration = {
    f_y: 721.5,
    f_x: 721.5,
    c_y: 185.0,
    c_x: 640.0,
    H_cam: 1.65,
    pitch_deg: 0.5,
    W_car: 1.82,
  };

  describe('Fix 1: Horizon Fallback & Discontinuity Jump Oracle', () => {
    it('verifies 0m discontinuity jump across boundary denominator = 1.0 with micro-steps', () => {
      const pitchRad = (baseCalibration.pitch_deg * Math.PI) / 180;
      const pitchOffset = baseCalibration.f_y * Math.tan(pitchRad);
      // denominator = (y_max - c_y) + pitchOffset
      // y_max for denominator = 1.0: y_crit = 1.0 + c_y - pitchOffset
      const yCrit = 1.0 + baseCalibration.c_y - pitchOffset;

      // Test fine epsilon neighborhood around boundary: [-1e-4, +1e-4]
      const epsilons = [-1e-4, -1e-5, -1e-6, -1e-7, 0, 1e-7, 1e-6, 1e-5, 1e-4];
      for (const eps of epsilons) {
        const y = yCrit + eps;
        const z = calculateGroundPinholeDistance(y, baseCalibration);
        // Both sides of denominator = 1.0 must equal 150.0m because:
        // for denom <= 1.0: returns 150.0
        // for denom = 1.0 + 1e-4: (721.5 * 1.65) / 1.0001 = 1190m -> clamped to 150.0m
        expect(z).toBe(150.0);
      }
    });

    it('verifies ceiling consistency between ground pinhole and width pinhole at limits', () => {
      // Both estimators must saturate at exactly 150.0m
      const zGroundHorizon = calculateGroundPinholeDistance(-500, baseCalibration);
      const zWidthMin = calculateWidthPinholeDistance(0, baseCalibration);
      expect(zGroundHorizon).toBe(150.0);
      expect(zWidthMin).toBe(150.0);
      expect(Math.abs(zGroundHorizon - zWidthMin)).toBe(0.0);
    });

    it('fuzzes 10,000 random y_max inputs over extreme domain [-1e6, +1e6]', () => {
      for (let i = 0; i < 10000; i++) {
        const y = (Math.random() - 0.5) * 2e6;
        const z = calculateGroundPinholeDistance(y, baseCalibration);
        expect(Number.isFinite(z)).toBe(true);
        expect(z).toBeGreaterThanOrEqual(2.0);
        expect(z).toBeLessThanOrEqual(150.0);
      }
    });
  });

  describe('Fix 2: Kalman NaN Resistance & Recovery Oracle', () => {
    it('prevents state corruption during 100 consecutive corrupted NaN frames', () => {
      let state = 28.5;
      for (let frame = 0; frame < 100; frame++) {
        state = applyKalman1D(NaN, state, 0.25);
        expect(state).toBe(28.5);
        expect(Number.isFinite(state)).toBe(true);
      }

      // Once clean frame arrives, filter smoothly moves towards new measurement
      state = applyKalman1D(20.0, state, 0.25);
      // 0.25 * 20 + 0.75 * 28.5 = 5.0 + 21.375 = 26.375
      expect(state).toBeCloseTo(26.375, 4);
    });

    it('protects against Infinity and -Infinity inputs', () => {
      let state = 35.0;
      state = applyKalman1D(Infinity, state, 0.25);
      expect(state).toBe(35.0);

      state = applyKalman1D(-Infinity, state, 0.25);
      expect(state).toBe(35.0);
    });

    it('handles uninitialized previous state (NaN, Infinity, -Infinity) gracefully', () => {
      const seededFromValid = applyKalman1D(42.0, NaN, 0.25);
      expect(seededFromValid).toBe(42.0);

      const fallbackBothNaN = applyKalman1D(NaN, NaN, 0.25);
      expect(fallbackBothNaN).toBe(40.0);

      const fallbackBothInf = applyKalman1D(Infinity, -Infinity, 0.25);
      expect(fallbackBothInf).toBe(40.0);
    });

    it('fuzzes 5,000 random corrupted filter updates with mixed noise and NaNs', () => {
      let state = 40.0;
      for (let i = 0; i < 5000; i++) {
        const coin = Math.random();
        const raw = coin < 0.2 ? NaN : coin < 0.25 ? Infinity : coin < 0.3 ? -Infinity : 10 + Math.random() * 80;
        const gain = coin < 0.05 ? NaN : Math.random() * 2 - 0.5;
        state = applyKalman1D(raw, state, gain);
        expect(Number.isFinite(state)).toBe(true);
        expect(state).toBeGreaterThanOrEqual(1.0);
        expect(state).toBeLessThanOrEqual(150.0);
      }
    });
  });

  describe('Fix 3: Fusion Weights Normalization Oracle', () => {
    it('verifies partition of unity (sum === 1.0) for unnormalized manual weights', () => {
      const testCases: [number, number][] = [
        [0.8, 0.8],
        [1.5, 0.5],
        [10.0, 90.0],
        [0.001, 0.001],
        [100, 100],
      ];

      for (const [wy, ww] of testCases) {
        const weights: FusionWeights = { w_y: wy, w_w: ww, K_gain: 0.25, autoWeightByConf: false };
        const result = fuseDistances(30.0, 50.0, weights, 0.8);
        expect(result.eff_wy + result.eff_ww).toBeCloseTo(1.0, 10);
        // Scale invariance check: scale weights by factor 10, result must be identical
        const scaledWeights: FusionWeights = { w_y: wy * 10, w_w: ww * 10, K_gain: 0.25, autoWeightByConf: false };
        const scaledResult = fuseDistances(30.0, 50.0, scaledWeights, 0.8);
        expect(result.Z_raw).toBeCloseTo(scaledResult.Z_raw, 8);
      }
    });

    it('verifies fallback to 0.5 / 0.5 when weight sum <= 0 or non-finite', () => {
      const degenerateWeights: [number, number][] = [
        [0, 0],
        [-1, -1],
        [-5, 2],
        [NaN, 0.5],
        [0.5, NaN],
        [Infinity, 1.0],
      ];

      for (const [wy, ww] of degenerateWeights) {
        const weights: FusionWeights = { w_y: wy, w_w: ww, K_gain: 0.25, autoWeightByConf: false };
        const result = fuseDistances(20.0, 40.0, weights, 0.9);
        expect(result.eff_wy).toBe(0.5);
        expect(result.eff_ww).toBe(0.5);
        expect(result.Z_raw).toBe(30.0);
      }
    });

    it('fuzzes 10,000 random non-negative weight pairs ensuring convex combination', () => {
      for (let i = 0; i < 10000; i++) {
        const wy = Math.random() * 100;
        const ww = Math.random() * 100;
        const zy = 10 + Math.random() * 50;
        const zw = 10 + Math.random() * 50;
        const weights: FusionWeights = { w_y: wy, w_w: ww, K_gain: 0.25, autoWeightByConf: false };
        const result = fuseDistances(zy, zw, weights, 0.5);

        expect(result.eff_wy + result.eff_ww).toBeCloseTo(1.0, 8);
        const minZ = Math.min(zy, zw);
        const maxZ = Math.max(zy, zw);
        expect(result.Z_raw).toBeGreaterThanOrEqual(minZ - 1e-6);
        expect(result.Z_raw).toBeLessThanOrEqual(maxZ + 1e-6);
      }
    });
  });

  describe('Fix 4: Negative Ego Speed Safe Distance Oracle', () => {
    it('strictly clamps negative ego speeds to 0m safe distance', () => {
      const negativeSpeeds = [-0.01, -1, -5, -18, -60, -120, -500];
      for (const v of negativeSpeeds) {
        expect(calculateMinSafeDistance(v)).toBe(0);
      }
    });

    it('handles non-finite speed values cleanly by returning 0m', () => {
      expect(calculateMinSafeDistance(NaN)).toBe(0);
      expect(calculateMinSafeDistance(Infinity)).toBe(0);
      expect(calculateMinSafeDistance(-Infinity)).toBe(0);
    });

    it('strictly follows 2-second rule for positive speeds with integer rounding', () => {
      // v (m/s) = speedKmh / 3.6; d = round(v * 2)
      for (let kmh = 0; kmh <= 200; kmh += 5) {
        const expected = Math.round((kmh / 3.6) * 2.0);
        expect(calculateMinSafeDistance(kmh)).toBe(expected);
        expect(calculateMinSafeDistance(kmh)).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
