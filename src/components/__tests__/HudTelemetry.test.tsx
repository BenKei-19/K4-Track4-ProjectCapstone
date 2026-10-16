import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HudTelemetry } from '../HudTelemetry';
import type { AdasTelemetry } from '../../types/adas';

const createMockTelemetry = (overrides?: Partial<AdasTelemetry>): AdasTelemetry => ({
  egoSpeedKmh: 64,
  minSafeDistanceM: 36,
  relativeSpeedKmh: 0,
  detectionModel: 'YOLOv8n-KITTI',
  confidence: 0.95,
  inferenceMs: 12.0,
  rawBBox: { x1: 200, y1: 150, x2: 300, y2: 250, width: 100, height: 100 },
  v_bottom: 250,
  w_px: 100,
  Z_y: 35.2,
  Z_w: 36.1,
  Z_raw: 35.5,
  Z_kalman: 35.4,
  uncertaintyM: 1.4,
  TTC: 99.9,
  alertLevel: 'safe',
  lateralOffset: 0,
  timestamp: Date.now(),
  ...overrides,
});

describe('HudTelemetry Visual HUD Component', () => {
  it('renders large tabular distance readout synchronized with Z_kalman', () => {
    const mockTelemetry = createMockTelemetry({ Z_kalman: 42.8, uncertaintyM: 1.4 });
    render(<HudTelemetry telemetry={mockTelemetry} isMuted={false} onToggleMute={vi.fn()} />);

    // Distance rounded to nearest integer (43)
    expect(screen.getByText('43')).toBeDefined();
    expect(screen.getByText('± 1.4')).toBeDefined();
  });

  it('renders "KHOẢNG CÁCH AN TOÀN" badge when alert level is safe', () => {
    const mockTelemetry = createMockTelemetry({ alertLevel: 'safe', Z_kalman: 38.0 });
    render(<HudTelemetry telemetry={mockTelemetry} isMuted={false} onToggleMute={vi.fn()} />);

    expect(screen.getByText('KHOẢNG CÁCH AN TOÀN')).toBeDefined();
  });

  it('renders "CHÚ Ý GIỮ KHOẢNG CÁCH" badge when alert level is warning', () => {
    const mockTelemetry = createMockTelemetry({ alertLevel: 'warning', Z_kalman: 18.5 });
    render(<HudTelemetry telemetry={mockTelemetry} isMuted={false} onToggleMute={vi.fn()} />);

    expect(screen.getByText('CHÚ Ý GIỮ KHOẢNG CÁCH')).toBeDefined();
  });

  it('renders "GẦN HƠN QUY ĐỊNH" badge when alert level is danger', () => {
    const mockTelemetry = createMockTelemetry({ alertLevel: 'danger', Z_kalman: 8.2 });
    render(<HudTelemetry telemetry={mockTelemetry} isMuted={false} onToggleMute={vi.fn()} />);

    expect(screen.getByText('GẦN HƠN QUY ĐỊNH')).toBeDefined();
  });

  it('renders ego speed and 2-second safe following distance rule', () => {
    const mockTelemetry = createMockTelemetry({ egoSpeedKmh: 72, minSafeDistanceM: 40 });
    render(<HudTelemetry telemetry={mockTelemetry} isMuted={false} onToggleMute={vi.fn()} />);

    expect(screen.getByText('72')).toBeDefined();
    expect(screen.getByText('40 m')).toBeDefined();
    expect(screen.getByText('(2s)')).toBeDefined();
  });

  it('triggers onToggleMute callback when audio toggle button is clicked', () => {
    const onToggleMute = vi.fn();
    const mockTelemetry = createMockTelemetry();
    render(<HudTelemetry telemetry={mockTelemetry} isMuted={false} onToggleMute={onToggleMute} />);

    const muteButton = screen.getByTitle('Tắt tiếng cảnh báo');
    fireEvent.click(muteButton);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });
});
