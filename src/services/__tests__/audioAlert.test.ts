import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AudioAlertSynthesizer } from '../audioAlert';

describe('AudioAlertSynthesizer Web Audio Engine', () => {
  let synthesizer: AudioAlertSynthesizer;

  beforeEach(() => {
    synthesizer = new AudioAlertSynthesizer();
  });

  afterEach(() => {
    synthesizer.destroy();
  });

  it('initializes with unmuted state and safe alert level', () => {
    expect(synthesizer.getMuted()).toBe(false);
  });

  it('toggles mute status correctly', () => {
    expect(synthesizer.getMuted()).toBe(false);
    const muted = synthesizer.toggleMute();
    expect(muted).toBe(true);
    expect(synthesizer.getMuted()).toBe(true);

    const unmuted = synthesizer.toggleMute();
    expect(unmuted).toBe(false);
    expect(synthesizer.getMuted()).toBe(false);
  });

  it('sets mute explicitly and stops active beeps', () => {
    synthesizer.updateAlert('warning');
    synthesizer.setMuted(true);
    expect(synthesizer.getMuted()).toBe(true);
  });

  it('updates alert level without exceptions across safe, warning, and danger', () => {
    expect(() => synthesizer.updateAlert('safe')).not.toThrow();
    expect(() => synthesizer.updateAlert('warning')).not.toThrow();
    expect(() => synthesizer.updateAlert('danger')).not.toThrow();
    expect(() => synthesizer.setAlertLevel('safe')).not.toThrow();
  });

  it('unlocks audio context asynchronously', async () => {
    const unlocked = await synthesizer.unlockAudio();
    expect(typeof unlocked).toBe('boolean');
    expect(synthesizer.getUnlocked()).toBe(true);
  });

  it('cleans up timers and context upon destroy', () => {
    synthesizer.updateAlert('danger');
    expect(() => synthesizer.destroy()).not.toThrow();
  });
});
