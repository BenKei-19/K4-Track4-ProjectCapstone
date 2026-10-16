import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TargetLockBox } from '../TargetLockBox';
import type { AdasTelemetry } from '../../types/adas';

const createMockTelemetry = (overrides?: Partial<AdasTelemetry>): AdasTelemetry => ({
  egoSpeedKmh: 65,
  minSafeDistanceM: 36,
  relativeSpeedKmh: 0,
  detectionModel: 'YOLOv8n-KITTI',
  confidence: 0.94,
  inferenceMs: 12.2,
  rawBBox: { x1: 250, y1: 180, x2: 390, y2: 300, width: 140, height: 120 },
  v_bottom: 300,
  w_px: 140,
  Z_y: 28.4,
  Z_w: 29.1,
  Z_raw: 28.6,
  Z_kalman: 28.5,
  uncertaintyM: 1.2,
  TTC: 4.5,
  alertLevel: 'safe',
  lateralOffset: 0,
  timestamp: Date.now(),
  ...overrides,
});

describe('TargetLockBox Reticle Component', () => {
  it('renders target tag with distance and TTC tracking', () => {
    const mockTelemetry = createMockTelemetry({ Z_kalman: 28.5, TTC: 4.5 });
    render(<TargetLockBox telemetry={mockTelemetry} />);

    expect(screen.getByText('Lead Car')).toBeDefined();
    expect(screen.getByText('28.5m')).toBeDefined();
    expect(screen.getByText('TTC: 4.5s')).toBeDefined();
  });

  it('renders ground contact line y2 coordinate', () => {
    const mockTelemetry = createMockTelemetry({
      rawBBox: { x1: 100, y1: 100, x2: 200, y2: 280, width: 100, height: 180 },
    });
    render(<TargetLockBox telemetry={mockTelemetry} />);

    expect(screen.getByText('Ground Contact y₂=280px')).toBeDefined();
  });

  it('renders SAFE indicator when TTC is greater than 99 seconds', () => {
    const mockTelemetry = createMockTelemetry({ TTC: 99.9 });
    render(<TargetLockBox telemetry={mockTelemetry} />);

    expect(screen.getByText('TTC: SAFE')).toBeDefined();
  });
});
