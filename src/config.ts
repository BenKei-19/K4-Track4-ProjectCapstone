import type { Calib } from './types.ts';

// Không dùng import.meta.env ở đây: file này được import bởi geometry.ts và chạy test bằng Node.
export const CONFIG = {
  VEHICLE_LABELS: ['car', 'truck', 'bus', 'motorcycle'],
  SCORE_THRESHOLD: 0.35,
  MAX_RESULTS: 10,

  DETECT_MIN_INTERVAL_MS: 66,   // trần ~15 Hz
  INFER_WINDOW: 15,             // số mẫu để lấy median inferMs

  ROI_TOP_HALF_W: 0.04,         // nửa bề ngang cạnh trên (normalized), ngay dưới chân trời
  ROI_BOTTOM_HALF_W: 0.30,      // nửa bề ngang cạnh dưới, tại yN = 1
  ROI_CENTER_X: 0.5,

  LEAD_IOU_KEEP: 0.3,           // giữ xe cũ nếu IoU > ngưỡng
  LEAD_KEEP_MARGIN_Y: 0.03,     // ...và đáy chênh với xe gần nhất < 3% chiều cao ảnh

  EMA_ALPHA: 0.3,
  EMA_RESET_MS: 500,            // mất lead quá lâu → reset EMA

  BOTTOM_CLIP_RATIO: 0.98,
  MIN_RAY_ANGLE_DEG: 0.5,
  MAX_RANGE_M: 50,
  MODEL_INPUT_PX: 320,          // EfficientDet-Lite0 input

  CALIB_LIMITS: { heightM: [0.5, 3], vfovDeg: [20, 120], horizonY: [0.05, 0.95] },
} as const;

export const CALIB_DEFAULT: Calib = { heightM: 1.3, vfovDeg: 41, horizonY: 0.45, confirmed: false };

// Điền từ số đo thực tế (SPEC mục 12). null = chưa đo → nút preset bị ẩn. Không điền số đoán.
export const DEMO_CALIB: Calib | null = null;
