import type { Calib, Det, Status } from './types.ts';
import { CONFIG } from './config.ts';

const RAD = Math.PI / 180;

/** Ground-plane distance (m) of an image row, or null if the ray is at/above the horizon. */
export function groundDistance(yPx: number, imgH: number, c: Calib): number | null {
  const fy = imgH / 2 / Math.tan((c.vfovDeg * RAD) / 2);
  const cy = imgH / 2;
  const pitch = Math.atan((cy - c.horizonY * imgH) / fy);
  const angle = pitch + Math.atan((yPx - cy) / fy);
  if (angle < CONFIG.MIN_RAY_ANGLE_DEG * RAD) return null;
  return c.heightM / Math.tan(angle);
}

/** Half-width of the ROI trapezoid at normalized row yN (valid for yN > horizonY). */
function roiHalfW(yN: number, horizonY: number): number {
  const t = (yN - horizonY) / (1 - horizonY);
  return CONFIG.ROI_TOP_HALF_W + t * (CONFIG.ROI_BOTTOM_HALF_W - CONFIG.ROI_TOP_HALF_W);
}

export function inRoi(xN: number, yN: number, horizonY: number): boolean {
  if (yN <= horizonY) return false;
  return Math.abs(xN - CONFIG.ROI_CENTER_X) <= roiHalfW(yN, horizonY);
}

/** Normalized vertices: top-left, top-right, bottom-right, bottom-left. */
export function roiPolygon(horizonY: number): [number, number][] {
  const c = CONFIG.ROI_CENTER_X;
  const top = roiHalfW(horizonY, horizonY);
  const bot = roiHalfW(1, horizonY);
  return [
    [c - top, horizonY],
    [c + top, horizonY],
    [c + bot, 1],
    [c - bot, 1],
  ];
}

export function iou(a: Det, b: Det): number {
  const iw = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const ih = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (iw <= 0 || ih <= 0) return 0;
  const inter = iw * ih;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

export function pickLead(dets: Det[], prev: Det | null, W: number, H: number, horizonY: number): Det | null {
  const cands = dets
    .map((d) => ({ d, yN: (d.y + d.h) / H, xN: (d.x + d.w / 2) / W }))
    .filter((c) => inRoi(c.xN, c.yN, horizonY));
  if (cands.length === 0) return null;
  const nearest = cands.reduce((a, b) => (b.yN > a.yN ? b : a));
  if (prev) {
    // Several candidates may overlap prev; keep the best IoU match.
    let match: (typeof cands)[number] | null = null;
    let best: number = CONFIG.LEAD_IOU_KEEP;
    for (const c of cands) {
      const v = iou(c.d, prev);
      if (v > best) { best = v; match = c; }
    }
    if (match && nearest.yN - match.yN < CONFIG.LEAD_KEEP_MARGIN_Y) return match.d;
  }
  return nearest.d;
}

export function ema(prev: number | null, next: number, alpha: number = CONFIG.EMA_ALPHA): number {
  return prev === null ? next : prev + alpha * (next - prev);
}

export function resolveStatus(input: {
  ready: boolean; error: boolean; hasVideo: boolean; calib: Calib;
  dets: Det[]; lead: Det | null; rawDistance: number | null; imgH: number; imgW: number;
}): Status {
  const { ready, error, hasVideo, calib, dets, lead, rawDistance, imgH, imgW } = input;
  if (error) return 'model-error';
  if (!ready) return 'loading';
  if (!hasVideo) return 'no-video';
  if (!calib.confirmed) return 'uncalibrated';
  if (dets.length === 0) return 'no-vehicle';
  if (!lead) {
    // pickLead drops boxes at/above the horizon, so a centered one there means the calibration is wrong, not "no lead".
    const centeredAbove = dets.some((d) =>
      (d.y + d.h) / imgH <= calib.horizonY && Math.abs((d.x + d.w / 2) / imgW - CONFIG.ROI_CENTER_X) <= CONFIG.ROI_BOTTOM_HALF_W);
    return centeredAbove ? 'above-horizon' : 'no-lead';
  }
  if (lead.y + lead.h >= imgH * CONFIG.BOTTOM_CLIP_RATIO) return 'too-close';
  if (rawDistance === null) return 'above-horizon';
  if (rawDistance > CONFIG.MAX_RANGE_M) return 'out-of-range';
  return 'ok';
}

/**
 * d < 20: nearest 0.5 m, one decimal. d >= 20: nearest 1 m.
 * Boundary: a value that rounds up to 20 (>= 19.75) is shown as '20 m', never '20.0 m'.
 */
export function formatDistance(d: number): string {
  const r = d < 20 ? Math.round(d * 2) / 2 : Math.round(d);
  return r >= 20 ? `${r} m` : `${r.toFixed(1)} m`;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
