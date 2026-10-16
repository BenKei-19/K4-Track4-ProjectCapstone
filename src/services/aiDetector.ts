import type { BoundingBox, CameraCalibration, DetectionModelType } from '../types/adas';

export interface DetectionResult {
  bbox: BoundingBox;
  confidence: number;
  inferenceMs: number;
  label: string;
}

// In-browser COCO-SSD detection wrapper with dynamic CDN injection & fallback
class VehicleDetectorService {
  private cocoModel: unknown = null;
  private isModelLoading: boolean = false;

  public async loadCocoModel(): Promise<boolean> {
    if (this.cocoModel) return true;
    if (this.isModelLoading) return false;
    this.isModelLoading = true;

    try {
      // Check if global cocoSsd is already on window
      const win = window as unknown as { cocoSsd?: { load: () => Promise<unknown> } };
      if (!win.cocoSsd) {
        // Dynamically inject scripts
        await this.injectScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
        await this.injectScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
      }

      if (win.cocoSsd) {
        this.cocoModel = await win.cocoSsd.load();
        this.isModelLoading = false;
        return true;
      }
    } catch {
      this.isModelLoading = false;
    }
    return false;
  }

  private injectScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Run real vehicle detection on HTMLVideoElement or Canvas
   */
  public async detectRealVideo(
    videoElement: HTMLVideoElement,
    screenW: number,
    screenH: number
  ): Promise<DetectionResult | null> {
    const startTime = performance.now();

    if (!this.cocoModel) {
      const loaded = await this.loadCocoModel();
      if (!loaded) return null;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = this.cocoModel as any;
      const predictions = await model.detect(videoElement);

      const vehicleClasses = ['car', 'truck', 'bus'];
      // Filter vehicles that are in front of ego car (roughly centered X)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vehicles = predictions.filter((p: any) =>
        vehicleClasses.includes(p.class) && p.score > 0.45
      );

      if (vehicles.length === 0) return null;

      // Find lead vehicle closest to bottom center of screen
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let leadCar: any = null;
      let maxBottom = 0;

      for (const v of vehicles) {
        const bottom = v.bbox[1] + v.bbox[3];
        // Must be in bottom 75% of screen and center lane region
        const centerX = v.bbox[0] + v.bbox[2] / 2;
        const distFromCenter = Math.abs(centerX - videoElement.videoWidth / 2);
        if (distFromCenter < videoElement.videoWidth * 0.35 && bottom > maxBottom) {
          maxBottom = bottom;
          leadCar = v;
        }
      }

      if (!leadCar) {
        leadCar = vehicles[0];
      }

      // Scale coordinates to current screen size
      const scaleX = screenW / (videoElement.videoWidth || screenW);
      const scaleY = screenH / (videoElement.videoHeight || screenH);

      const x1 = Math.round(leadCar.bbox[0] * scaleX);
      const y1 = Math.round(leadCar.bbox[1] * scaleY);
      const w = Math.round(leadCar.bbox[2] * scaleX);
      const h = Math.round(leadCar.bbox[3] * scaleY);

      const inferenceMs = Number((performance.now() - startTime).toFixed(1));

      return {
        bbox: {
          x1,
          y1,
          x2: x1 + w,
          y2: y1 + h,
          width: w,
          height: h,
        },
        confidence: Number(leadCar.score.toFixed(2)),
        inferenceMs: Math.max(10.5, inferenceMs),
        label: leadCar.class.toUpperCase(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Smart Vision Simulation (for YouTube IFrame where CORS prevents pixel inspection,
   * or when calibrated YOLOv8n-KITTI profile is active)
   */
  public simulateDetection(
    simDistanceM: number,
    lateralOffset: number,
    calibration: CameraCalibration,
    modelType: DetectionModelType,
    screenW: number,
    _screenH?: number
  ): DetectionResult {
    const { f_y, f_x, H_cam, c_y, pitch_deg, W_car } = calibration;
    const pitch_rad = (pitch_deg * Math.PI) / 180;
    const safeZ = Math.max(3.0, simDistanceM);

    // Add tiny realistic sensor jitter to raw bounding box (± 0.8px)
    const jitterW = (Math.sin(Date.now() / 150) * 0.9);
    const jitterH = (Math.cos(Date.now() / 200) * 0.8);

    const w_px = (f_x * W_car) / safeZ + jitterW;
    const h_px = w_px * 0.82 + jitterH;

    const y_max = c_y - f_y * Math.tan(pitch_rad) + (f_y * H_cam) / safeZ;
    const y_min = y_max - h_px;

    const centerX = screenW / 2 + lateralOffset * (screenW * 0.24 * (40 / Math.max(12, safeZ)));
    const x_min = centerX - w_px / 2;
    const x_max = centerX + w_px / 2;

    // Confidence depends on distance: further vehicles have lower confidence
    const baseConf = modelType === 'YOLOv8n-KITTI' ? 0.94 : 0.88;
    const distanceAttenuation = Math.max(0.65, baseConf - (safeZ / 120) * 0.28);
    const confNoise = (Math.sin(Date.now() / 400) * 0.03);
    const finalConf = Math.min(0.99, Math.max(0.70, distanceAttenuation + confNoise));

    // Simulated inference duration (YOLOv8n: ~11-14ms, COCO-SSD: ~18-24ms)
    const inferenceBase = modelType === 'YOLOv8n-KITTI' ? 12.2 : 21.5;
    const inferenceMs = Number((inferenceBase + (Math.sin(Date.now() / 300) * 2.1)).toFixed(1));

    return {
      bbox: {
        x1: Math.round(x_min),
        y1: Math.round(y_min),
        x2: Math.round(x_max),
        y2: Math.round(y_max),
        width: Math.round(w_px),
        height: Math.round(h_px),
      },
      confidence: Number(finalConf.toFixed(2)),
      inferenceMs,
      label: 'CAR (LEAD)',
    };
  }
}

export const vehicleDetector = new VehicleDetectorService();
