import type { Calib, Status } from './types.ts';
import { CONFIG } from './config.ts';

// Thông tư 38/2024/TT-BGTVT, Điều 11 — khoảng cách an toàn tối thiểu (đường khô, thẳng, tầm nhìn tốt).
// Dưới 60 km/h: không có trị số cố định. Trên 120 km/h: ngoài bảng quy định.
export const REG_SOURCE = 'TT 38/2024/TT-BGTVT, Điều 11';
export function requiredMinDistance(kmh: number): number | null {
  const v = Math.round(kmh);
  if (v < 60 || v > 120) return null;
  if (v === 60) return 35;
  if (v <= 80) return 55;
  if (v <= 100) return 70;
  return 100;
}

// shortcut: σ chỉ tính cho lượt detect nguyên khung (1 px model ≈ max(W,H)/320 px video); thêm vùng cắt thì truyền pxScale nhỏ hơn.
export function sigmaM(d: number, calib: Calib, imgW: number, imgH: number, sigmaModelPx = 1): number {
  const fy = imgH / 2 / Math.tan((calib.vfovDeg * Math.PI) / 360);
  const pxScale = Math.max(imgW, imgH) / CONFIG.MODEL_INPUT_PX;
  return (d * d) / (calib.heightM * fy) * sigmaModelPx * pxScale;
}

export type AlertLevel = 'below' | 'near' | 'meets' | 'none-seen' | 'no-rule' | 'unknown';

/** So khoảng cách đo được (kèm sai số σ) với mức tối thiểu; chỉ báo "đủ" khi chắc chắn. */
export function alertLevel(status: Status, d: number | null, sigma: number, minM: number | null): AlertLevel {
  if (minM === null) return 'no-rule';
  if (status === 'too-close') return 'below';
  if (status === 'ok' && d !== null) {
    if (d + sigma < minM) return 'below';
    if (d - sigma >= minM) return 'meets';
    return 'near';
  }
  if (status === 'out-of-range') return minM <= CONFIG.MAX_RANGE_M ? 'meets' : 'none-seen';
  if (status === 'no-vehicle' || status === 'no-lead') return 'none-seen';
  return 'unknown';
}

export const headwayS = (d: number, kmh: number) => (kmh > 0 ? d / (kmh / 3.6) : null);
