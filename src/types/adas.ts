export type AlertLevel = 'safe' | 'warning' | 'danger';

export type OperatingMode = 'auto' | 'scenario' | 'manual';

export type ScenarioType = 'cruising' | 'hard_brake' | 'cut_in' | 'tailgate';

export type DetectionModelType = 'YOLOv8n-KITTI' | 'COCO-SSD';

export interface VideoSource {
  type: 'youtube' | 'mp4';
  url: string;
  id?: string;
  title: string;
  description?: string;
}

export interface CameraCalibration {
  f_y: number; // Focal length Y in pixels (e.g. 721.5)
  f_x: number; // Focal length X in pixels (e.g. 721.5)
  c_y: number; // Optical center Y in pixels (e.g. 185.0 / 360)
  c_x: number; // Optical center X in pixels (e.g. 640)
  H_cam: number; // Camera height above ground in meters (e.g. 1.65m)
  pitch_deg: number; // Camera pitch angle in degrees (e.g. 0.5)
  W_car: number; // Average vehicle width in meters (e.g. 1.82m)
}

export interface LaneCalibration {
  horizonY: number; // Normalized horizon Y (0 to 1, default ~0.48)
  topWidth: number; // Normalized lane width at horizon (default 0.12)
  bottomWidth: number; // Normalized lane width at bumper (default 0.72)
  vanishX: number; // Normalized vanishing point X (default 0.5)
}

export interface FusionWeights {
  w_y: number; // Ground contact weight (0.0 to 1.0, default 0.65)
  w_w: number; // Width weight (1 - w_y, default 0.35)
  K_gain: number; // Kalman / EMA filter gain (0.05 to 1.0, default 0.25)
  autoWeightByConf: boolean; // Auto-adjust weights based on AI confidence
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

export interface AdasTelemetry {
  // Vehicle kinematics
  egoSpeedKmh: number;
  minSafeDistanceM: number;
  relativeSpeedKmh: number;

  // AI Detection info
  detectionModel: DetectionModelType;
  confidence: number;
  inferenceMs: number;
  rawBBox: BoundingBox;
  v_bottom: number; // y2 in px
  w_px: number; // width in px

  // Pipeline Math outputs
  Z_y: number; // Ground Contact Pinhole (m)
  Z_w: number; // Vehicle Width Pinhole (m)
  Z_raw: number; // Weighted Fusion raw (m)
  Z_kalman: number; // Filtered distance (m)
  uncertaintyM: number; // ± error margin (m)
  TTC: number; // Time-to-Collision (s)

  // System status
  alertLevel: AlertLevel;
  lateralOffset: number; // -1.0 to 1.0 (relative to lane center)
  timestamp: number;
}

export interface SparklinePoint {
  time: number;
  distance: number;
  alert: AlertLevel;
}
