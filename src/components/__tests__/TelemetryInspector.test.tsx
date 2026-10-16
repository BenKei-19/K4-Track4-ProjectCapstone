import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TelemetryInspector } from '../TelemetryInspector';
import type { CameraCalibration, FusionWeights, AdasTelemetry } from '../../types/adas';

const defaultCalibration: CameraCalibration = {
  f_y: 721.5,
  f_x: 721.5,
  c_y: 185.0,
  c_x: 640.0,
  H_cam: 1.65,
  pitch_deg: 0.5,
  W_car: 1.82,
};

const defaultWeights: FusionWeights = {
  w_y: 0.65,
  w_w: 0.35,
  K_gain: 0.25,
  autoWeightByConf: true,
};

const createMockTelemetry = (overrides?: Partial<AdasTelemetry>): AdasTelemetry => ({
  egoSpeedKmh: 68,
  minSafeDistanceM: 38,
  relativeSpeedKmh: 0,
  detectionModel: 'YOLOv8n-KITTI',
  confidence: 0.94,
  inferenceMs: 12.4,
  rawBBox: { x1: 200, y1: 150, x2: 320, y2: 260, width: 120, height: 110 },
  v_bottom: 260,
  w_px: 120,
  Z_y: 34.2,
  Z_w: 35.8,
  Z_raw: 34.8,
  Z_kalman: 34.5,
  uncertaintyM: 1.3,
  TTC: 99.9,
  alertLevel: 'safe',
  lateralOffset: 0,
  timestamp: Date.now(),
  ...overrides,
});

describe('TelemetryInspector Component', () => {
  it('renders all 4 zones and displays live pipeline math formula outputs', () => {
    const mockTelemetry = createMockTelemetry({
      Z_y: 34.2,
      Z_w: 35.8,
      Z_raw: 34.8,
      Z_kalman: 34.5,
      uncertaintyM: 1.3,
    });

    render(
      <TelemetryInspector
        telemetry={mockTelemetry}
        calibration={defaultCalibration}
        onUpdateCalibration={vi.fn()}
        weights={defaultWeights}
        onUpdateWeights={vi.fn()}
        onSelectModel={vi.fn()}
      />
    );

    // Section 1: AI Detection Engine
    expect(screen.getByText('[1] AI DETECTION ENGINE')).toBeDefined();
    expect(screen.getByText('YOLOv8n-KITTI')).toBeDefined();
    expect(screen.getByText('COCO-SSD (Browser)')).toBeDefined();

    // Section 4: Live Pipeline Formula Output
    expect(screen.getByText('[4] LIVE PIPELINE FORMULA OUTPUT')).toBeDefined();
    expect(screen.getByText('34.2 m')).toBeDefined(); // Z_y
    expect(screen.getByText('35.8 m')).toBeDefined(); // Z_w
    expect(screen.getByText('34.8 m')).toBeDefined(); // Z_raw
    expect(screen.getByText(/34\.5 m/)).toBeDefined(); // Z_kalman
  });

  it('triggers onSelectModel when clicking model buttons', () => {
    const onSelectModel = vi.fn();
    const mockTelemetry = createMockTelemetry();

    render(
      <TelemetryInspector
        telemetry={mockTelemetry}
        calibration={defaultCalibration}
        onUpdateCalibration={vi.fn()}
        weights={defaultWeights}
        onUpdateWeights={vi.fn()}
        onSelectModel={onSelectModel}
      />
    );

    const cocoButton = screen.getByText('COCO-SSD (Browser)');
    fireEvent.click(cocoButton);
    expect(onSelectModel).toHaveBeenCalledWith('COCO-SSD');
  });

  it('switches between Weights and Calibration Matrix tabs', () => {
    const mockTelemetry = createMockTelemetry();
    render(
      <TelemetryInspector
        telemetry={mockTelemetry}
        calibration={defaultCalibration}
        onUpdateCalibration={vi.fn()}
        weights={defaultWeights}
        onUpdateWeights={vi.fn()}
        onSelectModel={vi.fn()}
      />
    );

    const matrixTabButton = screen.getByText('Calibration Matrix');
    fireEvent.click(matrixTabButton);

    expect(screen.getByText('[3] CAMERA INTRINSICS / EXTRINSICS')).toBeDefined();
    expect(screen.getByText('721.5 px')).toBeDefined();
  });
});
