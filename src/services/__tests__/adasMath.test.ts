import { describe, expect, it } from 'vitest';
import type { CameraCalibration, FusionWeights } from '../../types/adas';
import {
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

describe('ADAS Mathematical & Vision Pipeline Tests', () => {
  const defaultCalibration: CameraCalibration = {
    f_y: 721.5,
    f_x: 721.5,
    c_y: 185.0,
    c_x: 640.0,
    H_cam: 1.65,
    pitch_deg: 0.5,
    W_car: 1.82,
  };



  describe('Ground Contact Pinhole (Z_y)', () => {
    it('should calculate realistic distance from ground contact point y_max', () => {
      // With y_max = 220px (close to horizon), distance should be larger (~30-40m)
      const Z_far = calculateGroundPinholeDistance(220, defaultCalibration);
      expect(Z_far).toBeGreaterThan(25);
      expect(Z_far).toBeLessThan(45);

      // With y_max = 350px (closer to bottom of screen), distance should be smaller (~6-10m)
      const Z_near = calculateGroundPinholeDistance(350, defaultCalibration);
      expect(Z_near).toBeGreaterThan(4);
      expect(Z_near).toBeLessThan(12);
    });

    it('should handle extreme horizon boundary without crashing or negative distance', () => {
      const Z_edge = calculateGroundPinholeDistance(180, defaultCalibration);
      expect(Z_edge).toBeGreaterThanOrEqual(2.0);
      expect(Z_edge).toBeLessThanOrEqual(150.0);
    });
  });

  describe('Vehicle Width Pinhole (Z_w)', () => {
    it('should calculate distance based on bounding box width', () => {
      // 1.82m car with width = 35px
      const Z_far = calculateWidthPinholeDistance(35, defaultCalibration);
      // Z = 721.5 * 1.82 / 35 = 37.5m
      expect(Z_far).toBeCloseTo(37.5, 1);

      // Width = 140px (car is close)
      const Z_near = calculateWidthPinholeDistance(140, defaultCalibration);
      // Z = 721.5 * 1.82 / 140 = 9.38m
      expect(Z_near).toBeCloseTo(9.38, 1);
    });
  });

  describe('Weighted Fusion (Z_raw)', () => {
    it('should correctly fuse ground and width distances with weights', () => {
      const Z_y = 30.0;
      const Z_w = 40.0;
      const weights: FusionWeights = {
        w_y: 0.6,
        w_w: 0.4,
        K_gain: 0.25,
        autoWeightByConf: false,
      };

      const { Z_raw } = fuseDistances(Z_y, Z_w, weights, 0.9);
      // Z_raw = 0.6 * 30 + 0.4 * 40 = 18 + 16 = 34
      expect(Z_raw).toBeCloseTo(34.0, 2);
    });

    it('should adapt weights according to AI confidence when autoWeightByConf is enabled', () => {
      const Z_y = 20.0;
      const Z_w = 30.0;
      const adaptiveWeights: FusionWeights = {
        w_y: 0.65,
        w_w: 0.35,
        K_gain: 0.25,
        autoWeightByConf: true,
      };

      // When confidence is lower (e.g. 0.5), eff_wy decreases, shifting weight to width
      const { eff_wy, eff_ww } = fuseDistances(Z_y, Z_w, adaptiveWeights, 0.5);
      expect(eff_wy).toBeLessThan(0.65);
      expect(eff_ww).toBeGreaterThan(0.35);
      expect(eff_wy + eff_ww).toBeCloseTo(1.0, 5);
    });
  });

  describe('1D Kalman / EMA Filter', () => {
    it('should apply smoothing gain correctly', () => {
      const Z_raw = 20.0;
      const Z_prev = 30.0;

      // With K_gain = 0.25: 0.25 * 20 + 0.75 * 30 = 5 + 22.5 = 27.5
      const smoothed = applyKalman1D(Z_raw, Z_prev, 0.25);
      expect(smoothed).toBeCloseTo(27.5, 2);

      // With K_gain = 0.95 (very fast response):
      const fast = applyKalman1D(Z_raw, Z_prev, 0.95);
      expect(fast).toBeCloseTo(20.5, 1);
    });
  });

  describe('Inverse Pinhole Projection Consistency', () => {
    it('should produce mathematically consistent forward and inverse projections', () => {
      const targetZ = 35.0; // 35 meters
      const screenW = 1280;
      const screenH = 720;

      const bbox = projectDistanceToBBox(targetZ, 0, defaultCalibration, screenW, screenH);

      // Pass width back to Width Pinhole
      const reconstructedZw = calculateWidthPinholeDistance(bbox.width, defaultCalibration);
      expect(reconstructedZw).toBeCloseTo(targetZ, 0); // Within ~1m precision due to pixel rounding

      // Pass y2 back to Ground Pinhole
      const reconstructedZy = calculateGroundPinholeDistance(bbox.y2, defaultCalibration);
      expect(reconstructedZy).toBeCloseTo(targetZ, 0);
    });
  });

  describe('Time-To-Collision (TTC)', () => {
    it('should compute TTC when ego car is closing in on lead car', () => {
      const distance = 30; // 30 meters
      const egoSpeed = 80; // 80 km/h
      const leadSpeed = 44; // 44 km/h -> relative speed 36 km/h = 10 m/s
      const ttc = calculateTTC(distance, egoSpeed, leadSpeed);
      // TTC = 30m / 10m/s = 3.0s
      expect(ttc).toBeCloseTo(3.0, 1);
    });

    it('should return safe indicator (>99s) when cars are maintaining distance or pulling away', () => {
      const distance = 40;
      const egoSpeed = 60;
      const leadSpeed = 70; // Lead car is faster
      const ttc = calculateTTC(distance, egoSpeed, leadSpeed);
      expect(ttc).toBe(99.9);
    });
  });

  describe('Min Safe Distance (2-second rule)', () => {
    it('should calculate safe distance proportional to speed', () => {
      // 72 km/h = 20 m/s -> 20 * 2 = 40m
      expect(calculateMinSafeDistance(72)).toBe(40);
      // 36 km/h = 10 m/s -> 10 * 2 = 20m
      expect(calculateMinSafeDistance(36)).toBe(20);
    });
  });

  describe('Alert Level Thresholds', () => {
    it('should return safe (>25m), warning (12-25m), and danger (<12m)', () => {
      expect(determineAlertLevel(45.0)).toBe('safe');
      expect(determineAlertLevel(25.1)).toBe('safe');
      expect(determineAlertLevel(25.0)).toBe('warning');
      expect(determineAlertLevel(18.0)).toBe('warning');
      expect(determineAlertLevel(12.0)).toBe('warning');
      expect(determineAlertLevel(11.9)).toBe('danger');
      expect(determineAlertLevel(5.0)).toBe('danger');
    });
  });

  describe('Uncertainty Margins', () => {
    it('should increase uncertainty when sensors disagree or confidence is low', () => {
      const uncertHighConf = calculateUncertainty(30, 31, 0.95, 0.25);
      const uncertLowConf = calculateUncertainty(30, 38, 0.5, 0.25);
      expect(uncertLowConf).toBeGreaterThan(uncertHighConf);
    });
  });
});
