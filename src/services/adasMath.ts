import type { AlertLevel, BoundingBox, CameraCalibration, FusionWeights } from '../types/adas';

/**
 * Method 1 - Ground Contact Pinhole (Z_y):
 * Z_y = (f_y * H_cam) / ((y_max - c_y) + f_y * Math.tan(pitch_rad))
 */
export function calculateGroundPinholeDistance(
  y_max: number,
  calibration: CameraCalibration
): number {
  const { f_y, H_cam, c_y, pitch_deg } = calibration;
  const pitch_rad = (pitch_deg * Math.PI) / 180;
  const pitch_offset = f_y * Math.tan(pitch_rad);
  const denominator = (y_max - c_y) + pitch_offset;

  // Prevent division by zero or negative projection at or above horizon
  if (denominator <= 1.0) {
    return 150.0; // Distant horizon maximum range (meters)
  }

  const Z_y = (f_y * H_cam) / denominator;
  return Math.min(150.0, Math.max(2.0, Z_y));
}

/**
 * Method 2 - Vehicle Width Pinhole (Z_w):
 * Z_w = (f_x * W_car) / (x_max - x_min)
 */
export function calculateWidthPinholeDistance(
  w_px: number,
  calibration: CameraCalibration
): number {
  const { f_x, W_car } = calibration;
  const safe_width = Math.max(8.0, w_px);
  const Z_w = (f_x * W_car) / safe_width;
  return Math.min(150.0, Math.max(2.0, Z_w));
}

/**
 * Method 3 - Weighted Fusion:
 * Z_raw = w_y * Z_y + w_w * Z_w
 */
export function fuseDistances(
  Z_y: number,
  Z_w: number,
  weights: FusionWeights,
  confidence: number
): { Z_raw: number; eff_wy: number; eff_ww: number } {
  let eff_wy = weights.w_y;
  let eff_ww = weights.w_w;

  if (weights.autoWeightByConf) {
    // When confidence is very high, ground contact is reliable
    // If confidence drops (e.g., occlusion/cut-in), shift weight towards vehicle width
    const confFactor = Math.max(0.2, Math.min(1.0, confidence));
    eff_wy = weights.w_y * confFactor;
    eff_ww = 1.0 - eff_wy;
  } else {
    // Normalize weights so eff_wy + eff_ww === 1.0 even if input weights do not sum to 1.0
    const sum = weights.w_y + weights.w_w;
    if (sum > 0 && Number.isFinite(sum)) {
      eff_wy = weights.w_y / sum;
      eff_ww = weights.w_w / sum;
    } else {
      eff_wy = 0.5;
      eff_ww = 0.5;
    }
  }

  const Z_raw = eff_wy * Z_y + eff_ww * Z_w;
  return { Z_raw, eff_wy, eff_ww };
}

/**
 * 1D Kalman / EMA Filter:
 * Z_filtered = K_gain * Z_raw + (1 - K_gain) * Z_prev
 */
export function applyKalman1D(
  Z_raw: number,
  Z_prev: number,
  K_gain: number
): number {
  const clamped_gain = Number.isFinite(K_gain)
    ? Math.max(0.02, Math.min(1.0, K_gain))
    : 0.25;

  const rawValid = Number.isFinite(Z_raw);
  const prevValid = Number.isFinite(Z_prev);

  // If both inputs are non-finite, fallback to safe nominal cruising distance (40.0m)
  if (!rawValid && !prevValid) {
    return 40.0;
  }

  // If raw measurement is corrupted, hold previous filtered distance
  if (!rawValid) {
    return Z_prev;
  }

  // If previous filter state is invalid/uninitialized, initialize with raw measurement
  if (!prevValid) {
    return Z_raw;
  }

  return clamped_gain * Z_raw + (1 - clamped_gain) * Z_prev;
}

/**
 * Calculate uncertainty margin (± m) based on sensor discrepancy and confidence
 */
export function calculateUncertainty(
  Z_y: number,
  Z_w: number,
  confidence: number,
  K_gain: number
): number {
  const discrepancy = Math.abs(Z_y - Z_w);
  const rawUncertainty = discrepancy * 0.25 + (1 - confidence) * 2.0 + (1 - K_gain) * 0.4;
  return Math.max(0.5, Math.min(4.5, Number(rawUncertainty.toFixed(1))));
}

/**
 * Inverse Pinhole Projection:
 * Computes screen pixel Bounding Box from 3D distance Z and lateral offset.
 * Gives mathematically consistent 2D projection corresponding to the forward pinhole formulas.
 */
export function projectDistanceToBBox(
  Z: number,
  lateralOffset: number, // -1.0 (left lane) to 1.0 (right lane), 0 = center
  calibration: CameraCalibration,
  screenW: number,
  _screenH?: number
): BoundingBox {
  const { f_y, f_x, H_cam, c_y, pitch_deg, W_car } = calibration;
  const pitch_rad = (pitch_deg * Math.PI) / 180;
  const safeZ = Math.max(3.0, Z);

  // From Z_w = (f_x * W_car) / w_px  =>  w_px = (f_x * W_car) / Z
  const w_px = (f_x * W_car) / safeZ;
  // Typical sedan/SUV aspect ratio (height ~ 0.82 * width)
  const h_px = w_px * 0.82;

  // From Z_y = (f_y * H_cam) / ((y_max - c_y) + f_y * tan(pitch))
  // => y_max = c_y - f_y * tan(pitch) + (f_y * H_cam) / Z
  const y_max = c_y - f_y * Math.tan(pitch_rad) + (f_y * H_cam) / safeZ;
  const y_min = y_max - h_px;

  // Center X with lateral offset
  const centerX = screenW / 2 + lateralOffset * (screenW * 0.22 * (50 / Math.max(15, safeZ)));
  const x_min = centerX - w_px / 2;
  const x_max = centerX + w_px / 2;

  return {
    x1: Number(x_min.toFixed(2)),
    y1: Number(y_min.toFixed(2)),
    x2: Number(x_max.toFixed(2)),
    y2: Number(y_max.toFixed(2)),
    width: Number(w_px.toFixed(2)),
    height: Number(h_px.toFixed(2)),
  };
}

/**
 * Calculate Time-To-Collision (TTC) in seconds:
 * TTC = Z / (v_ego - v_lead)
 */
export function calculateTTC(
  Z: number,
  egoSpeedKmh: number,
  leadSpeedKmh: number
): number {
  const relativeSpeedKmh = egoSpeedKmh - leadSpeedKmh;
  const relSpeedMs = relativeSpeedKmh / 3.6;

  if (relSpeedMs <= 0.2) {
    return 99.9; // Safe / Not closing in
  }

  const ttc = Z / relSpeedMs;
  return Math.max(0.1, Math.min(99.9, ttc));
}

/**
 * Minimum safe following distance (2-second rule)
 * d_min = v_ego (m/s) * 2s
 */
export function calculateMinSafeDistance(egoSpeedKmh: number): number {
  const safeSpeedKmh = Number.isFinite(egoSpeedKmh) ? Math.max(0, egoSpeedKmh) : 0;
  const speedMs = safeSpeedKmh / 3.6;
  return Math.round(speedMs * 2.0);
}

/**
 * Determine ADAS alert level:
 * > 25m: safe (Green)
 * 12m - 25m: warning (Orange)
 * < 12m: danger (Red)
 */
export function determineAlertLevel(distanceM: number): AlertLevel {
  if (distanceM > 25) return 'safe';
  if (distanceM >= 12) return 'warning';
  return 'danger';
}

/**
 * Colors based on Alert Level
 */
export const ALERT_COLORS = {
  safe: {
    hex: '#10B981',
    twText: 'text-emerald-500',
    twBg: 'bg-emerald-500',
    twBorder: 'border-emerald-500',
    badgeText: 'KHOẢNG CÁCH AN TOÀN',
    subtleBg: 'rgba(16, 185, 129, 0.15)',
    glow: 'rgba(16, 185, 129, 0.4)',
  },
  warning: {
    hex: '#F59E0B',
    twText: 'text-amber-500',
    twBg: 'bg-amber-500',
    twBorder: 'border-amber-500',
    badgeText: 'CHÚ Ý GIỮ KHOẢNG CÁCH',
    subtleBg: 'rgba(245, 158, 11, 0.18)',
    glow: 'rgba(245, 158, 11, 0.5)',
  },
  danger: {
    hex: '#EF4444',
    twText: 'text-red-500',
    twBg: 'bg-red-500',
    twBorder: 'border-red-500',
    badgeText: 'GẦN HƠN QUY ĐỊNH',
    subtleBg: 'rgba(239, 68, 68, 0.25)',
    glow: 'rgba(239, 68, 68, 0.75)',
  },
};
