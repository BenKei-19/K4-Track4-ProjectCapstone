import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioAlertSynthesizer, audioAlert } from '../audioAlert';

describe('Empirical Challenger R2-2: Deep Audio & Interactive Stress Harness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('1. AudioAlertSynthesizer: Frame-by-frame call frequency & stopBeeps() behavior', () => {
    it('does NOT repeatedly call stopBeeps() during 60 FPS safe cruising', () => {
      const synth = new AudioAlertSynthesizer();
      const stopBeepsSpy = vi.spyOn(synth, 'stopBeeps');

      // 60 consecutive frames of safe state (representing 1 full second at 60 FPS)
      for (let f = 0; f < 60; f++) {
        synth.updateAlert('safe');
      }

      // Initial state was 'safe', so no transition occurred and stopBeeps must be 0
      expect(stopBeepsSpy).toHaveBeenCalledTimes(0);

      // Transition to warning: must call stopBeeps once
      synth.updateAlert('warning');
      expect(stopBeepsSpy).toHaveBeenCalledTimes(1);

      // 60 consecutive frames of warning state
      for (let f = 0; f < 60; f++) {
        synth.updateAlert('warning');
      }
      // No extra stopBeeps calls during steady-state warning
      expect(stopBeepsSpy).toHaveBeenCalledTimes(1);

      // Transition to danger: must call stopBeeps once
      synth.updateAlert('danger');
      expect(stopBeepsSpy).toHaveBeenCalledTimes(2);

      // 60 consecutive frames of danger state
      for (let f = 0; f < 60; f++) {
        synth.updateAlert('danger');
      }
      expect(stopBeepsSpy).toHaveBeenCalledTimes(2);

      // Transition back to safe: must call stopBeeps once to halt danger beeps
      synth.updateAlert('safe');
      expect(stopBeepsSpy).toHaveBeenCalledTimes(3);

      // 60 consecutive frames of safe cruising
      for (let f = 0; f < 60; f++) {
        synth.updateAlert('safe');
      }
      // Must remain exactly 3 calls across all 243 simulated frames
      expect(stopBeepsSpy).toHaveBeenCalledTimes(3);

      synth.destroy();
    });

    it('suppresses stopBeeps() when muted across consecutive frames', () => {
      const synth = new AudioAlertSynthesizer();
      synth.setMuted(true);
      const stopBeepsSpy = vi.spyOn(synth, 'stopBeeps');

      // When already muted, calling updateAlert with the same level should short-circuit
      for (let f = 0; f < 30; f++) {
        synth.updateAlert('safe');
      }
      expect(stopBeepsSpy).toHaveBeenCalledTimes(0);

      for (let f = 0; f < 30; f++) {
        synth.updateAlert('warning');
      }
      // Transition from safe to warning while muted calls stopBeeps once on transition
      expect(stopBeepsSpy).toHaveBeenCalledTimes(1);

      synth.destroy();
    });
  });

  describe('2. AudioContext Lifecycle & Zombie Prevention', () => {
    let mockContextInstances: any[] = [];

    class MockAudioContext {
      state: AudioContextState = 'suspended';
      currentTime: number = 0;
      destination = {};
      createOscillator = vi.fn(() => ({
        type: 'sine',
        frequency: { setValueAtTime: vi.fn(), value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }));
      createGain = vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 1 },
        connect: vi.fn(),
      }));
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);

      constructor() {
        mockContextInstances.push(this);
      }
    }

    beforeEach(() => {
      mockContextInstances = [];
      (window as any).AudioContext = MockAudioContext;
      // Clean up the module-level singleton's window listeners so it does not interfere
      audioAlert.destroy();
    });

    it('attaches window event listeners on construction and detaches them upon unlockAudio()', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const synth = new AudioAlertSynthesizer();
      expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      await synth.unlockAudio();

      expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      // Destroy synth
      synth.destroy();
    });

    it('detaches unlock listeners on destroy() if not unlocked yet', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const synth = new AudioAlertSynthesizer();
      synth.destroy();

      expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('strictly prevents zombie AudioContext creation after destroy() under all triggers', async () => {
      const synth = new AudioAlertSynthesizer();
      synth.destroy();

      const countAfterDestroy = mockContextInstances.length;

      // 1. Trigger window events that previously unlocked audio
      window.dispatchEvent(new Event('pointerdown'));
      window.dispatchEvent(new Event('keydown'));

      // 2. Explicitly call unlockAudio()
      const unlockResult = await synth.unlockAudio();
      expect(unlockResult).toBe(false);

      // 3. Attempt to trigger alert levels
      synth.updateAlert('warning');
      synth.updateAlert('danger');
      synth.setAlertLevel('warning');

      // 4. Toggle mute
      synth.toggleMute();
      synth.setMuted(false);

      // Verify no new AudioContext was instantiated
      expect(mockContextInstances.length).toBe(countAfterDestroy);
    });

    it('handles multiple destroy() calls idempotently without errors', () => {
      const synth = new AudioAlertSynthesizer();
      expect(() => {
        synth.destroy();
        synth.destroy();
        synth.destroy();
      }).not.toThrow();
    });
  });
});
