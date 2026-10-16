import type { ObjectDetector } from '@mediapipe/tasks-vision';

export type Calib = {
  heightM: number;     // chiều cao ống kính so với mặt đường (m)
  vfovDeg: number;     // góc nhìn dọc của video (độ)
  horizonY: number;    // vị trí đường chân trời, normalized 0..1
  confirmed: boolean;  // false → không hiển thị khoảng cách
};

export type Det = {
  x: number; y: number; w: number; h: number; // video px
  label: string;                              // 'car' | 'truck' | 'bus' | 'motorcycle'
  score: number;                              // 0..1
};

export type Status =
  | 'loading' | 'model-error' | 'no-video' | 'uncalibrated' | 'no-vehicle'
  | 'no-lead' | 'too-close' | 'above-horizon' | 'out-of-range' | 'ok';

export type Frame = {
  dets: Det[];               // mọi xe sau khi lọc
  lead: Det | null;          // xe dẫn đầu (nếu có)
  distanceM: number | null;  // đã làm mượt; null khi status !== 'ok'
  status: Status;
  inferMs: number;           // median INFER_WINDOW lần detect gần nhất
  detectHz: number;          // số lần detect trong 1000 ms gần nhất
  videoTime: number;         // video.currentTime của frame đã detect (để tra dữ liệu dataset)
};

// File JSON đi kèm clip dataset (VD public/demo/kitti.json), sinh bởi tools/kitti/prepare.py.
export type Sidecar = {
  source: string; license: string; fps: number;
  calib: Calib;
  frames: { i: number; t: number; speedKmh: number; gtRearM: number | null }[];
};

export type Delegate = 'GPU' | 'CPU';

// Contract giữa App.tsx (UI) và Viewport.tsx (pipeline). Viewport là default export của src/Viewport.tsx.
export type ViewportProps = {
  src: string | null;                        // object URL của file upload hoặc đường dẫn clip mẫu
  detector: ObjectDetector | null;           // null khi model chưa sẵn sàng / lỗi
  calib: Calib;
  playing: boolean;                          // App điều khiển play/pause
  onFrame: (f: Frame) => void;               // gọi ở nhịp detect (≤ 15 Hz)
  onVideoState: (s: VideoState) => void;     // khi metadata/play/pause/ended thay đổi
  onVideoError: (msg: string) => void;       // file không phát được
  onDetectorError: (msg: string) => void;    // > 10 lỗi detect liên tiếp
  onHorizonChange?: (horizonY: number) => void; // kéo chân trời trên canvas (SHOULD)
};

export type VideoState = {
  hasVideo: boolean;  // đã loadeddata và videoWidth > 0
  playing: boolean;
  width: number;      // videoWidth
  height: number;     // videoHeight
};
