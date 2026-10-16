import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import type { ObjectDetectorResult } from '@mediapipe/tasks-vision';
import { CONFIG } from './config.ts';
import type { Delegate, Det } from './types.ts';

// Paths live here, not in config.ts: config.ts is imported by Node tests (no import.meta.env).
const WASM_PATH = import.meta.env.BASE_URL + 'wasm';
const MODEL_PATH = import.meta.env.BASE_URL + 'models/efficientdet_lite0.tflite';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function createDetector(): Promise<{ detector: ObjectDetector; delegate: Delegate }> {
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  const make = (delegate: Delegate) =>
    ObjectDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      scoreThreshold: CONFIG.SCORE_THRESHOLD,
      maxResults: CONFIG.MAX_RESULTS,
      categoryAllowlist: [...CONFIG.VEHICLE_LABELS],
    });
  try {
    return { detector: await make('GPU'), delegate: 'GPU' };
  } catch (gpuErr) {
    console.warn('GPU delegate failed, falling back to CPU:', gpuErr);
    try {
      return { detector: await make('CPU'), delegate: 'CPU' };
    } catch (cpuErr) {
      throw new Error(`Không khởi tạo được mô hình (GPU: ${msg(gpuErr)}; CPU: ${msg(cpuErr)})`);
    }
  }
}

export function toDets(result: ObjectDetectorResult): Det[] {
  const out: Det[] = [];
  for (const d of result.detections) {
    const b = d.boundingBox;
    const c = d.categories[0];
    if (!b || !c) continue;
    out.push({ x: b.originX, y: b.originY, w: b.width, h: b.height, label: c.categoryName, score: c.score });
  }
  return out;
}
