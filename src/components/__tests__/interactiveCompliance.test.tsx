import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AudioAlertSynthesizer } from '../../services/audioAlert';
import { ALERT_COLORS, determineAlertLevel } from '../../services/adasMath';
import { HudTelemetry } from '../HudTelemetry';
import { BackgroundVideo } from '../BackgroundVideo';
import { DirectorControls } from '../DirectorControls';
import App from '../../App';
import type { AdasTelemetry, VideoSource } from '../../types/adas';

// Mock Web Audio API classes to inspect actual synthesized frequencies
interface MockAudioParam {
  value: number;
  setValueAtTime: (val: number, time: number) => void;
  linearRampToValueAtTime: (val: number, time: number) => void;
  exponentialRampToValueAtTime: (val: number, time: number) => void;
}

interface MockOscillator {
  type: OscillatorType;
  frequency: MockAudioParam;
  connect: (dest: unknown) => void;
  start: (time?: number) => void;
  stop: (time?: number) => void;
}

interface MockGain {
  gain: MockAudioParam;
  connect: (dest: unknown) => void;
}

const createdOscillators: MockOscillator[] = [];
const createdGains: MockGain[] = [];

class MockAudioContext {
  state: AudioContextState = 'suspended';
  currentTime: number = 0;
  destination = {};

  createOscillator(): MockOscillator {
    const osc: MockOscillator = {
      type: 'sine',
      frequency: {
        value: 0,
        setValueAtTime: vi.fn((val) => { osc.frequency.value = val; }),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    createdOscillators.push(osc);
    return osc;
  }

  createGain(): MockGain {
    const gain: MockGain = {
      gain: {
        value: 1,
        setValueAtTime: vi.fn((val) => { gain.gain.value = val; }),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    createdGains.push(gain);
    return gain;
  }

  resume = vi.fn().mockImplementation(async () => {
    this.state = 'running';
    return Promise.resolve();
  });

  close = vi.fn().mockImplementation(async () => {
    this.state = 'closed';
    return Promise.resolve();
  });
}

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

describe('Challenger 2 Empirical Verification: Acoustic Synthesizer & Interactive UI', () => {
  beforeEach(() => {
    createdOscillators.length = 0;
    createdGains.length = 0;
    vi.useFakeTimers();
    // Install Mock AudioContext on window
    (window as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('1. Acoustic Synthesizer Audio Verification (Web Audio API)', () => {
    it('synthesizes Caution/Warning tone with exact 850 Hz sine wave and 850ms interval', () => {
      const synth = new AudioAlertSynthesizer();
      synth.updateAlert('warning');

      // Initial beep played immediately
      expect(createdOscillators.length).toBe(1);
      const osc = createdOscillators[0];
      expect(osc.type).toBe('sine');
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(850, 0);

      // Advance by 850ms to trigger next interval beep
      vi.advanceTimersByTime(850);
      expect(createdOscillators.length).toBe(2);
      expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(850, 0);

      synth.destroy();
    });

    it('synthesizes Danger tone with dual-frequency 1900 Hz & 2400 Hz triangle waves and 220ms interval', () => {
      const synth = new AudioAlertSynthesizer();
      synth.updateAlert('danger');

      // Danger generates 2 oscillators per beep cycle (1900 Hz + 2400 Hz)
      expect(createdOscillators.length).toBe(2);
      const osc1 = createdOscillators[0];
      const osc2 = createdOscillators[1];

      expect(osc1.type).toBe('triangle');
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(1900, 0);

      expect(osc2.type).toBe('triangle');
      expect(osc2.frequency.setValueAtTime).toHaveBeenCalledWith(2400, 0.05);

      // Advance 220ms for next rapid repetition
      vi.advanceTimersByTime(220);
      expect(createdOscillators.length).toBe(4);
      expect(createdOscillators[2].frequency.setValueAtTime).toHaveBeenCalledWith(1900, 0);
      expect(createdOscillators[3].frequency.setValueAtTime).toHaveBeenCalledWith(2400, 0.05);

      synth.destroy();
    });

    it('remains completely silent when alert level is safe', () => {
      const synth = new AudioAlertSynthesizer();
      synth.updateAlert('safe');

      expect(createdOscillators.length).toBe(0);
      vi.advanceTimersByTime(2000);
      expect(createdOscillators.length).toBe(0);

      synth.destroy();
    });

    it('immediately halts sound and intervals upon mute toggle', () => {
      const synth = new AudioAlertSynthesizer();
      synth.updateAlert('warning');
      expect(createdOscillators.length).toBe(1);

      synth.toggleMute();
      expect(synth.getMuted()).toBe(true);

      // Advance timers - no further oscillators should be scheduled
      vi.advanceTimersByTime(1700);
      expect(createdOscillators.length).toBe(1);

      // Unmuting should resume warning beep
      synth.toggleMute();
      expect(synth.getMuted()).toBe(false);
      expect(createdOscillators.length).toBe(2);

      synth.destroy();
    });

    it('unlocks audio context asynchronously and marks isUnlocked=true', async () => {
      const synth = new AudioAlertSynthesizer();
      expect(synth.getUnlocked()).toBe(false);

      const unlocked = await synth.unlockAudio();
      expect(unlocked).toBe(true);
      expect(synth.getUnlocked()).toBe(true);

      synth.destroy();
    });
  });

  describe('2. 3-Tier Alert Thresholds & Visual Styling', () => {
    it('accurately classifies boundaries: Safe (>25m), Caution (12-25m), Danger (<12m)', () => {
      // Safe > 25m
      expect(determineAlertLevel(45.0)).toBe('safe');
      expect(determineAlertLevel(25.01)).toBe('safe');

      // Caution/Warning: 12m to 25m inclusive
      expect(determineAlertLevel(25.0)).toBe('warning');
      expect(determineAlertLevel(20.0)).toBe('warning');
      expect(determineAlertLevel(12.0)).toBe('warning');

      // Danger: < 12m
      expect(determineAlertLevel(11.99)).toBe('danger');
      expect(determineAlertLevel(8.0)).toBe('danger');
      expect(determineAlertLevel(2.0)).toBe('danger');
    });

    it('validates exact hex color specifications and badge text', () => {
      expect(ALERT_COLORS.safe.hex).toBe('#10B981');
      expect(ALERT_COLORS.safe.badgeText).toBe('KHOẢNG CÁCH AN TOÀN');

      expect(ALERT_COLORS.warning.hex).toBe('#F59E0B');
      expect(ALERT_COLORS.warning.badgeText).toBe('CHÚ Ý GIỮ KHOẢNG CÁCH');

      expect(ALERT_COLORS.danger.hex).toBe('#EF4444');
      expect(ALERT_COLORS.danger.badgeText).toBe('GẦN HƠN QUY ĐỊNH');
    });

    it('renders blinking red badge and red vignette pulse strictly in danger state', () => {
      const dangerTelemetry = createMockTelemetry({ alertLevel: 'danger', Z_kalman: 8.5 });
      render(
        <HudTelemetry telemetry={dangerTelemetry} isMuted={false} onToggleMute={vi.fn()} />
      );

      // Danger badge has animate-pulse and red text
      const badge = screen.getByText('GẦN HƠN QUY ĐỊNH');
      expect(badge).toBeDefined();
      expect(badge.closest('.animate-pulse')).not.toBeNull();

      // Background video vignette test
      const dummySource: VideoSource = { type: 'youtube', id: 'test', url: 'https://youtu.be/test', title: 'Test' };
      const { container: videoContainer } = render(
        <BackgroundVideo source={dummySource} isDanger={true} />
      );
      expect(videoContainer.querySelector('.danger-vignette')).not.toBeNull();

      // In safe state, vignette must not be rendered
      const { container: safeVideoContainer } = render(
        <BackgroundVideo source={dummySource} isDanger={false} />
      );
      expect(safeVideoContainer.querySelector('.danger-vignette')).toBeNull();
    });
  });

  describe('3. Director Panel Controls & Scenario Presets', () => {
    const defaultLaneCalib = { horizonY: 0.48, topWidth: 0.12, bottomWidth: 0.72, vanishX: 0.5 };
    const defaultVideo: VideoSource = { type: 'youtube', id: 'mU4PjQJ92Xo', url: 'https://youtube.com', title: 'Test' };

    it('triggers all 4 scenario presets with exact target parameters', () => {
      const onTriggerScenario = vi.fn();
      render(
        <DirectorControls
          isVisible={true}
          onToggleVisible={vi.fn()}
          videoSource={defaultVideo}
          onSelectVideo={vi.fn()}
          operatingMode="scenario"
          onChangeMode={vi.fn()}
          onTriggerScenario={onTriggerScenario}
          manualDistance={38}
          onChangeManualDistance={vi.fn()}
          manualOffset={0}
          onChangeManualOffset={vi.fn()}
          egoSpeed={64}
          onChangeEgoSpeed={vi.fn()}
          laneCalibration={defaultLaneCalib}
          onUpdateLaneCalibration={vi.fn()}
          isMuted={false}
          onToggleMute={vi.fn()}
        />
      );

      // Verify the 4 scenario buttons exist and trigger respective callbacks
      fireEvent.click(screen.getByText('Cruising An toàn (40m)'));
      expect(onTriggerScenario).toHaveBeenCalledWith('cruising');

      fireEvent.click(screen.getByText('Phanh gấp (40m → 8m)'));
      expect(onTriggerScenario).toHaveBeenCalledWith('hard_brake');

      fireEvent.click(screen.getByText('Xe cắt mặt (10m)'));
      expect(onTriggerScenario).toHaveBeenCalledWith('cut_in');

      fireEvent.click(screen.getByText('Bám đuôi cao tốc (15m)'));
      expect(onTriggerScenario).toHaveBeenCalledWith('tailgate');
    });

    it('supports toggling Director Panel visibility between open and minimized dock', () => {
      const onToggleVisible = vi.fn();
      const { rerender } = render(
        <DirectorControls
          isVisible={true}
          onToggleVisible={onToggleVisible}
          videoSource={defaultVideo}
          onSelectVideo={vi.fn()}
          operatingMode="auto"
          onChangeMode={vi.fn()}
          onTriggerScenario={vi.fn()}
          manualDistance={38}
          onChangeManualDistance={vi.fn()}
          manualOffset={0}
          onChangeManualOffset={vi.fn()}
          egoSpeed={64}
          onChangeEgoSpeed={vi.fn()}
          laneCalibration={defaultLaneCalib}
          onUpdateLaneCalibration={vi.fn()}
          isMuted={false}
          onToggleMute={vi.fn()}
        />
      );

      // In visible mode, chevron toggle exists
      const hideButton = screen.getByTitle('Thu gọn bảng (Phím H)');
      fireEvent.click(hideButton);
      expect(onToggleVisible).toHaveBeenCalledTimes(1);

      // Re-render as hidden
      rerender(
        <DirectorControls
          isVisible={false}
          onToggleVisible={onToggleVisible}
          videoSource={defaultVideo}
          onSelectVideo={vi.fn()}
          operatingMode="auto"
          onChangeMode={vi.fn()}
          onTriggerScenario={vi.fn()}
          manualDistance={38}
          onChangeManualDistance={vi.fn()}
          manualOffset={0}
          onChangeManualOffset={vi.fn()}
          egoSpeed={64}
          onChangeEgoSpeed={vi.fn()}
          laneCalibration={defaultLaneCalib}
          onUpdateLaneCalibration={vi.fn()}
          isMuted={false}
          onToggleMute={vi.fn()}
        />
      );

      const restoreButton = screen.getByText('DIRECTOR PANEL (Phím H)');
      fireEvent.click(restoreButton);
      expect(onToggleVisible).toHaveBeenCalledTimes(2);
    });
  });

  describe('4. Full App Keyboard & Interactive Integration Stress Tests', () => {
    it('toggles director panel visibility upon keydown "h" / "H"', () => {
      render(<App />);

      // Panel starts visible
      expect(screen.getByText('DEMO DIRECTOR PANEL')).toBeDefined();

      // Press 'h' -> Panel hides
      fireEvent.keyDown(window, { key: 'h' });
      expect(screen.queryByText('DEMO DIRECTOR PANEL')).toBeNull();
      expect(screen.getByText('DIRECTOR PANEL (Phím H)')).toBeDefined();

      // Press 'H' -> Panel shows again
      fireEvent.keyDown(window, { key: 'H' });
      expect(screen.getByText('DEMO DIRECTOR PANEL')).toBeDefined();
    });

    it('toggles audio mute upon keydown "m" / "M"', () => {
      render(<App />);

      // Initially unmuted
      const muteBtn = screen.getByTitle('Tắt tiếng cảnh báo');
      expect(muteBtn).toBeDefined();

      // Press 'm'
      fireEvent.keyDown(window, { key: 'm' });
      expect(screen.getByTitle('Bật âm thanh cảnh báo')).toBeDefined();

      // Press 'M'
      fireEvent.keyDown(window, { key: 'M' });
      expect(screen.getByTitle('Tắt tiếng cảnh báo')).toBeDefined();
    });

    it('controls manual distance and lateral offset via arrow keys in manual mode', () => {
      render(<App />);

      // Switch to manual mode
      fireEvent.click(screen.getByText('[3] Manual Live'));
      expect(screen.getByText('Khoảng cách (Phím ↑ / ↓):')).toBeDefined();

      // Default distance is 38m
      const distanceSpans = screen.getAllByText('38 m');
      expect(distanceSpans.length).toBeGreaterThan(0);

      // Press ArrowUp: increases by 2m -> 40m
      fireEvent.keyDown(window, { key: 'ArrowUp' });
      expect(screen.getByText('40 m')).toBeDefined();

      // Press ArrowDown twice: decreases by 4m -> 36m
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      expect(screen.getByText('36 m')).toBeDefined();

      // Press ArrowRight: increases lateral offset
      expect(screen.getByText('0.00')).toBeDefined();
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText('0.05')).toBeDefined();

      // Press ArrowLeft twice: decreases offset to -0.05
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText('-0.05')).toBeDefined();
    });

    it('verifies global hotkeys ignore keydown events inside editable elements (INPUT / TEXTAREA)', () => {
      render(<App />);

      const youtubeInput = screen.getByPlaceholderText('Dán link YouTube (URL / ID)...');
      youtubeInput.focus();

      // Typing 'h' and 'm' inside input field must NOT trigger global hotkeys
      fireEvent.keyDown(youtubeInput, { key: 'h' });
      fireEvent.keyDown(youtubeInput, { key: 'm' });

      // Panel must stay visible and NOT be collapsed
      const panel = screen.queryByText('DEMO DIRECTOR PANEL');
      expect(panel).not.toBeNull();
    });

    it('verifies audio unlock listener is detached on destroy() preventing zombie AudioContext', async () => {
      let createdContextCount = 0;
      class CountingAudioContext extends MockAudioContext {
        constructor() {
          super();
          createdContextCount++;
        }
      }
      (window as unknown as { AudioContext: typeof CountingAudioContext }).AudioContext = CountingAudioContext;

      const synth = new AudioAlertSynthesizer();
      synth.destroy();

      const initialCount = createdContextCount;
      // User clicks anywhere on the page or presses keys
      fireEvent.pointerDown(window);
      fireEvent.keyDown(window, { key: 'Enter' });

      // No new AudioContext should be created on destroyed synthesizer
      expect(createdContextCount).toBe(initialCount);
    });
  });
});
