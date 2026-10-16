import { describe, expect, it } from 'vitest';
import type { CameraCalibration, FusionWeights } from '../../types/adas';
import {
  ALERT_COLORS,
  applyKalman1D,
  calculateGroundPinholeDistance,
  calculateMinSafeDistance,
  calculateTTC,
  calculateUncertainty,
  calculateWidthPinholeDistance,
  determineAlertLevel,
  fuseDistances,
  projectDistanceToBBox,
} from '../adasMath';

describe('CHALLENGER 1: ADAS Math Engine Boundary & Stress Oracle Suite', () => {
  const kittiCalibration: CameraCalibration = {
    f_y: 721.5,
    f_x: 721.5,
    c_y: 185.0,
    c_x: 640.0,
    H_cam: 1.65,
    pitch_deg: 0.5,
    W_car: 1.82,
  };

  // Horizon line calculation:
  // pitch_rad = 0.5 * PI / 180 = 0.008726646259971648
  // pitch_offset = 721.5 * tan(0.008726646259971648) = 6.296369...
  // y_horizon = c_y - pitch_offset = 185.0 - 6.296369 = 178.70363...
  const pitchRad = (kittiCalibration.pitch_deg * Math.PI) / 180;
  const pitchOffset = kittiCalibration.f_y * Math.tan(pitchRad);
  const theoreticalHorizonY = kittiCalibration.c_y - pitchOffset;

  describe('1. Horizon Singularity & Screen Boundary Stress Tests', () => {
    it('empirical oracle: y_max exactly at theoretical horizon does not throw or return NaN/Infinity', () => {
      const zHorizon = calculateGroundPinholeDistance(theoreticalHorizonY, kittiCalibration);
      expect(Number.isFinite(zHorizon)).toBe(true);
      expect(zHorizon).toBeGreaterThanOrEqual(2.0);
      expect(zHorizon).toBeLessThanOrEqual(150.0);
      // Denominator is 0.0, so denominator <= 1.0 branch triggers -> returns 150.0m maximum range
      expect(zHorizon).toBe(150.0);
    });

    it('empirical oracle: y_max well above horizon (sky / negative coordinates) returns bounded fallback', () => {
      const skyValues = [-1000, -100, 0, 50, 100, 150, theoreticalHorizonY - 10];
      for (const y of skyValues) {
        const dist = calculateGroundPinholeDistance(y, kittiCalibration);
        expect(Number.isFinite(dist)).toBe(true);
        expect(dist).toBe(150.0);
      }
    });

    it('empirical oracle: continuous monotonic saturation at 150m without discontinuity at denominator = 1.0', () => {
      const yThreshold = theoreticalHorizonY + 1.0;

      const zBelow = calculateGroundPinholeDistance(yThreshold - 0.01, kittiCalibration);
      const zAbove = calculateGroundPinholeDistance(yThreshold + 0.01, kittiCalibration);

      // Both below and above threshold cleanly clamp to 150.0m without jump
      expect(zBelow).toBe(150.0);
      expect(zAbove).toBe(150.0);
      expect(zAbove - zBelow).toBe(0.0);
    });

    it('empirical oracle: extreme bottom-of-screen values (y_max up to 10000px)', () => {
      const zExtremeBottom = calculateGroundPinholeDistance(10000, kittiCalibration);
      expect(Number.isFinite(zExtremeBottom)).toBe(true);
      // Should clamp cleanly to 2.0m minimum
      expect(zExtremeBottom).toBe(2.0);
    });

    it('empirical oracle: full monotonic range verification for valid ground points', () => {
      // From y_max = 200px to 800px, distance must be strictly monotonically decreasing
      let prevDist = calculateGroundPinholeDistance(190, kittiCalibration);
      for (let y = 200; y <= 800; y += 25) {
        const curDist = calculateGroundPinholeDistance(y, kittiCalibration);
        expect(curDist).toBeLessThanOrEqual(prevDist);
        expect(curDist).toBeGreaterThanOrEqual(2.0);
        expect(curDist).toBeLessThanOrEqual(150.0);
        prevDist = curDist;
      }
    });
  });

  describe('2. Bounding Box Width & Zero/Negative Dimension Stress Tests', () => {
    it('empirical oracle: width = 0px is protected by safe_width clamp and returns 150m', () => {
      const zZeroWidth = calculateWidthPinholeDistance(0, kittiCalibration);
      expect(Number.isFinite(zZeroWidth)).toBe(true);
      expect(zZeroWidth).toBe(150.0);
    });

    it('empirical oracle: negative widths (corrupted bounding box) are protected and return 150m', () => {
      const negativeWidths = [-1, -50, -500, -10000];
      for (const w of negativeWidths) {
        const dist = calculateWidthPinholeDistance(w, kittiCalibration);
        expect(Number.isFinite(dist)).toBe(true);
        expect(dist).toBe(150.0);
      }
    });

    it('empirical oracle: sub-pixel tiny widths (0 < w < 8px) are clamped by safe_width', () => {
      const tinyWidths = [0.001, 1.0, 4.0, 7.99];
      for (const w of tinyWidths) {
        const dist = calculateWidthPinholeDistance(w, kittiCalibration);
        // safe_width is 8.0px -> 721.5 * 1.82 / 8.0 = 164.14m -> clamped to 150m
        expect(dist).toBe(150.0);
      }
    });

    it('empirical oracle: massive bounding box width (w = 10000px) clamps to 2.0m', () => {
      const dist = calculateWidthPinholeDistance(10000, kittiCalibration);
      expect(dist).toBe(2.0);
    });

    it('empirical oracle: ground truth exact mathematical width verification', () => {
      // Formula: Z_w = (f_x * W_car) / w_px
      // For w_px = 50px: Z = 721.5 * 1.82 / 50 = 26.2626 m
      const expectedZ = (kittiCalibration.f_x * kittiCalibration.W_car) / 50;
      const actualZ = calculateWidthPinholeDistance(50, kittiCalibration);
      expect(actualZ).toBeCloseTo(expectedZ, 4);
    });
  });

  describe('3. Extreme Distances & Clamping Invariants', () => {
    it('empirical oracle: verify all outputs are strictly within [2.0, 150.0]', () => {
      // Extensive test sweep across y_max from -2000 to +5000 in steps of 50
      for (let y = -2000; y <= 5000; y += 50) {
        const z = calculateGroundPinholeDistance(y, kittiCalibration);
        expect(z).toBeGreaterThanOrEqual(2.0);
        expect(z).toBeLessThanOrEqual(150.0);
      }

      // Extensive test sweep across w_px from -2000 to +5000 in steps of 50
      for (let w = -2000; w <= 5000; w += 50) {
        const z = calculateWidthPinholeDistance(w, kittiCalibration);
        expect(z).toBeGreaterThanOrEqual(2.0);
        expect(z).toBeLessThanOrEqual(150.0);
      }
    });

    it('empirical oracle: projectDistanceToBBox clamps distance < 3m to 3.0m', () => {
      const bboxNegative = projectDistanceToBBox(-10, 0, kittiCalibration, 1280, 720);
      const bboxZero = projectDistanceToBBox(0, 0, kittiCalibration, 1280, 720);
      const bboxThree = projectDistanceToBBox(3, 0, kittiCalibration, 1280, 720);

      expect(bboxNegative.width).toBe(bboxThree.width);
      expect(bboxZero.width).toBe(bboxThree.width);
      expect(bboxNegative.y2).toBe(bboxThree.y2);
    });

    it('empirical oracle: projectDistanceToBBox handles extreme far distance (Z = 1000m)', () => {
      const bboxFar = projectDistanceToBBox(1000, 0, kittiCalibration, 1280, 720);
      expect(bboxFar.width).toBeGreaterThanOrEqual(1);
      expect(bboxFar.height).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(bboxFar.x1)).toBe(true);
      expect(Number.isFinite(bboxFar.y1)).toBe(true);
    });
  });

  describe('4. Kalman / EMA Gain Extremes (K_gain = 0.0 to 1.0)', () => {
    it('empirical oracle: K_gain = 0.0 is clamped to minimum 0.02 (prevent dead filter)', () => {
      const zPrev = 50.0;
      const zRaw = 20.0;
      const filtered = applyKalman1D(zRaw, zPrev, 0.0);
      // With gain clamped to 0.02: 0.02 * 20 + 0.98 * 50 = 0.4 + 49.0 = 49.4
      expect(filtered).toBeCloseTo(49.4, 2);
    });

    it('empirical oracle: K_gain = 1.0 passes raw measurement exactly (0 lag)', () => {
      const zPrev = 50.0;
      const zRaw = 18.75;
      const filtered = applyKalman1D(zRaw, zPrev, 1.0);
      expect(filtered).toBe(18.75);
    });

    it('empirical oracle: negative K_gain is clamped to 0.02', () => {
      const filtered = applyKalman1D(20.0, 50.0, -1.5);
      expect(filtered).toBeCloseTo(49.4, 2);
    });

    it('empirical oracle: K_gain > 1.0 is clamped to 1.0', () => {
      const filtered = applyKalman1D(15.0, 50.0, 3.5);
      expect(filtered).toBe(15.0);
    });

    it('empirical oracle: 100-step step-response convergence verification', () => {
      let state = 100.0; // Initial distance
      const target = 15.0; // Sudden stop target
      const K_gain = 0.25;

      for (let i = 0; i < 100; i++) {
        state = applyKalman1D(target, state, K_gain);
      }

      // After 100 iterations of (1 - 0.25)^100 = 0.75^100 ≈ 3.2e-13, state must equal target
      expect(state).toBeCloseTo(target, 4);
    });
  });

  describe('5. Fusion Weight Extremes (w_y = 1, w_w = 0 and w_y = 0, w_w = 1)', () => {
    it('empirical oracle: w_y = 1.0, w_w = 0.0 purely tracks ground contact (autoWeight=false)', () => {
      const weights: FusionWeights = { w_y: 1.0, w_w: 0.0, K_gain: 0.25, autoWeightByConf: false };
      const { Z_raw, eff_wy, eff_ww } = fuseDistances(35.0, 60.0, weights, 0.9);
      expect(Z_raw).toBe(35.0);
      expect(eff_wy).toBe(1.0);
      expect(eff_ww).toBe(0.0);
    });

    it('empirical oracle: w_y = 0.0, w_w = 1.0 purely tracks vehicle width (autoWeight=false)', () => {
      const weights: FusionWeights = { w_y: 0.0, w_w: 1.0, K_gain: 0.25, autoWeightByConf: false };
      const { Z_raw, eff_wy, eff_ww } = fuseDistances(35.0, 60.0, weights, 0.9);
      expect(Z_raw).toBe(60.0);
      expect(eff_wy).toBe(0.0);
      expect(eff_ww).toBe(1.0);
    });

    it('empirical oracle: autoWeightByConf adjusts weights proportionally across confidence [0.0..1.0]', () => {
      const weights: FusionWeights = { w_y: 0.65, w_w: 0.35, K_gain: 0.25, autoWeightByConf: true };

      // At confidence 1.0: eff_wy = 0.65 * 1.0 = 0.65, eff_ww = 0.35
      const resHigh = fuseDistances(20.0, 40.0, weights, 1.0);
      expect(resHigh.eff_wy).toBeCloseTo(0.65, 4);
      expect(resHigh.eff_ww).toBeCloseTo(0.35, 4);
      expect(resHigh.eff_wy + resHigh.eff_ww).toBeCloseTo(1.0, 4);

      // At confidence 0.5: eff_wy = 0.65 * 0.5 = 0.325, eff_ww = 1 - 0.325 = 0.675
      const resMid = fuseDistances(20.0, 40.0, weights, 0.5);
      expect(resMid.eff_wy).toBeCloseTo(0.325, 4);
      expect(resMid.eff_ww).toBeCloseTo(0.675, 4);
      expect(resMid.eff_wy + resMid.eff_ww).toBeCloseTo(1.0, 4);

      // At confidence 0.0: clamped by confFactor = Math.max(0.2, 0.0) = 0.2 -> eff_wy = 0.65 * 0.2 = 0.13
      const resZero = fuseDistances(20.0, 40.0, weights, 0.0);
      expect(resZero.eff_wy).toBeCloseTo(0.13, 4);
      expect(resZero.eff_ww).toBeCloseTo(0.87, 4);
      expect(resZero.eff_wy + resZero.eff_ww).toBeCloseTo(1.0, 4);
    });

    it('empirical oracle: unnormalized weights are automatically normalized when autoWeightByConf is false', () => {
      // If someone configures weights that do not sum to 1.0 (e.g. w_y = 0.8, w_w = 0.8)
      // eff_wy and eff_ww normalize to 0.5 and 0.5, ensuring Z_raw remains strictly 50m!
      const unnormalizedWeights: FusionWeights = { w_y: 0.8, w_w: 0.8, K_gain: 0.25, autoWeightByConf: false };
      const { Z_raw, eff_wy, eff_ww } = fuseDistances(50.0, 50.0, unnormalizedWeights, 0.9);
      expect(eff_wy).toBe(0.5);
      expect(eff_ww).toBe(0.5);
      expect(Z_raw).toBe(50.0);
    });
  });

  describe('6. Time-To-Collision (TTC) Stress & Division by Zero', () => {
    it('empirical oracle: zero relative speed (ego == lead) returns 99.9s', () => {
      const ttc = calculateTTC(30, 80, 80);
      expect(ttc).toBe(99.9);
    });

    it('empirical oracle: lead faster than ego (pulling away) returns 99.9s', () => {
      const ttc = calculateTTC(20, 60, 90);
      expect(ttc).toBe(99.9);
    });

    it('empirical oracle: negligible closing speed (relSpeedMs <= 0.2 m/s) returns safe 99.9s', () => {
      // 0.5 km/h = 0.138 m/s <= 0.2 m/s
      const ttc = calculateTTC(15, 60.5, 60.0);
      expect(ttc).toBe(99.9);
    });

    it('empirical oracle: closing speed exact calculation', () => {
      // ego = 100 km/h, lead = 64 km/h -> delta = 36 km/h = 10 m/s
      // distance = 50m -> TTC = 50 / 10 = 5.0s
      const ttc = calculateTTC(50, 100, 64);
      expect(ttc).toBeCloseTo(5.0, 2);
    });

    it('empirical oracle: extreme high-speed collision approaches 0.1s minimum', () => {
      // delta = 200 km/h = 55.55 m/s, distance = 2m -> TTC = 0.036s -> clamped to 0.1s
      const ttc = calculateTTC(2, 250, 50);
      expect(ttc).toBe(0.1);
    });
  });

  describe('7. Alert Level Threshold Invariants & Color Configs', () => {
    it('empirical oracle: verifies exact boundary partitioning at 25m and 12m', () => {
      expect(determineAlertLevel(25.0001)).toBe('safe');
      expect(determineAlertLevel(25.0)).toBe('warning');
      expect(determineAlertLevel(24.999)).toBe('warning');
      expect(determineAlertLevel(12.0001)).toBe('warning');
      expect(determineAlertLevel(12.0)).toBe('warning');
      expect(determineAlertLevel(11.999)).toBe('danger');
      expect(determineAlertLevel(2.0)).toBe('danger');
    });

    it('empirical oracle: all alert levels have valid hex, twText, twBg, badgeText', () => {
      const levels = ['safe', 'warning', 'danger'] as const;
      for (const lvl of levels) {
        const conf = ALERT_COLORS[lvl];
        expect(conf).toBeDefined();
        expect(conf.hex).toMatch(/^#[0-9A-F]{6}$/i);
        expect(conf.badgeText.length).toBeGreaterThan(0);
      }
    });
  });

  describe('8. Safe 2-Second Braking Distance Invariants', () => {
    it('empirical oracle: safe distance follows d = v (m/s) * 2s exactly', () => {
      // 90 km/h = 25 m/s -> 25 * 2 = 50m
      expect(calculateMinSafeDistance(90)).toBe(50);
      // 108 km/h = 30 m/s -> 30 * 2 = 60m
      expect(calculateMinSafeDistance(108)).toBe(60);
      // 0 km/h -> 0m
      expect(calculateMinSafeDistance(0)).toBe(0);
    });

    it('empirical oracle: negative ego speed is clamped to 0m safe distance', () => {
      // In reverse (-18 km/h = -5 m/s):
      const dMin = calculateMinSafeDistance(-18);
      expect(dMin).toBe(0); // Clamped with Math.max(0, ...)
    });
  });

  describe('9. Uncertainty Margin Bounds', () => {
    it('empirical oracle: uncertainty strictly bounded in [0.5, 4.5]', () => {
      // Perfect match, high confidence, fast response
      const minUncert = calculateUncertainty(30, 30, 1.0, 1.0);
      expect(minUncert).toBe(0.5);

      // Huge discrepancy (150m vs 2m), zero confidence, low gain
      const maxUncert = calculateUncertainty(150, 2, 0.0, 0.05);
      expect(maxUncert).toBe(4.5);
    });
  });

  describe('10. Inverse Pinhole vs Forward Pinhole Closed-Loop Accuracy', () => {
    it('empirical oracle: projectDistanceToBBox and pinhole reconstruct within physical pixel quantization margin', () => {
      // At distances up to 80m, integer rounding (Math.round) of screen pixels produces
      // up to 0.5px quantization error. At 80m, 0.5px = 0.5 * (80^2 / 1190) ≈ 2.7m.
      const testDistances = [5, 10, 15, 25, 40, 60, 80];
      for (const d of testDistances) {
        const bbox = projectDistanceToBBox(d, 0, kittiCalibration, 1280, 720);

        // Forward width reconstruction
        const reconstructedZw = calculateWidthPinholeDistance(bbox.width, kittiCalibration);
        // Forward ground reconstruction
        const reconstructedZy = calculateGroundPinholeDistance(bbox.y2, kittiCalibration);

        // Max error is bounded by 0.5px quantization (< 2.8m)
        expect(Math.abs(reconstructedZw - d)).toBeLessThanOrEqual(2.8);
        expect(Math.abs(reconstructedZy - d)).toBeLessThanOrEqual(2.8);
      }
    });
  });

  describe('11. Numerical Stability & NaN Injection Stress Tests', () => {
    it('empirical challenge finding: NaN in bounding box propagates to distance calculations', () => {
      const zY_nan = calculateGroundPinholeDistance(NaN, kittiCalibration);
      const zW_nan = calculateWidthPinholeDistance(NaN, kittiCalibration);
      expect(Number.isNaN(zY_nan)).toBe(true);
      expect(Number.isNaN(zW_nan)).toBe(true);
    });

    it('empirical oracle: Kalman filter resists NaN and recovers gracefully without permanent state corruption', () => {
      // Initial state is valid: 30m
      let state = 30.0;
      // Corrupt frame arrives: Z_raw = NaN
      state = applyKalman1D(NaN, state, 0.25);
      // Filter holds previous healthy state instead of poisoning state to NaN
      expect(state).toBe(30.0);

      // Next frame recovers: valid Z_raw = 30.0m arrives
      state = applyKalman1D(30.0, state, 0.25);
      expect(state).toBe(30.0);
      expect(Number.isFinite(state)).toBe(true);
    });

    it('empirical challenge finding: NaN in TTC calculation propagates to NaN result', () => {
      const ttc_nan = calculateTTC(30, NaN, 50);
      expect(Number.isNaN(ttc_nan)).toBe(true);
    });
  });
});
