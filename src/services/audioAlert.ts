import type { AlertLevel } from '../types/adas';

export class AudioAlertSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private currentAlert: AlertLevel = 'safe';
  private beepIntervalId: number | null = null;
  private isUnlocked: boolean = false;
  private unlockListener: (() => void) | null = null;
  private isDestroyed: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.unlockListener = () => {
        this.unlockAudio();
        this.removeUnlockListeners();
      };
      window.addEventListener('pointerdown', this.unlockListener);
      window.addEventListener('keydown', this.unlockListener);
    }
  }

  private removeUnlockListeners() {
    if (this.unlockListener && typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.unlockListener);
      window.removeEventListener('keydown', this.unlockListener);
      this.unlockListener = null;
    }
  }

  public async unlockAudio(): Promise<boolean> {
    if (this.isDestroyed) return false;
    this.removeUnlockListeners();
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        this.isUnlocked = true;
        return true;
      } catch {
        return false;
      }
    }
    this.isUnlocked = true;
    return true;
  }

  private initContext() {
    if (this.isDestroyed) return;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopBeeps();
    } else {
      this.updateAlert(this.currentAlert);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public getUnlocked(): boolean {
    return this.isUnlocked;
  }

  public setAlertLevel(level: AlertLevel): void {
    this.updateAlert(level);
  }

  public updateAlert(level: AlertLevel) {
    if (
      this.currentAlert === level &&
      (level === 'safe' || this.isMuted || this.beepIntervalId !== null)
    ) {
      return;
    }
    this.currentAlert = level;

    this.stopBeeps();

    if (this.isMuted) return;

    if (level === 'warning') {
      // Gentle intermittent beep (850Hz, 80ms duration every 850ms)
      this.playWarningBeep();
      this.beepIntervalId = window.setInterval(() => {
        this.playWarningBeep();
      }, 850);
    } else if (level === 'danger') {
      // Urgent dual high-pitch chime (1900Hz + 2300Hz, rapid repetition every 220ms)
      this.playDangerDualBeep();
      this.beepIntervalId = window.setInterval(() => {
        this.playDangerDualBeep();
      }, 220);
    }
  }

  private playWarningBeep() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(850, this.ctx.currentTime);

      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.095);
    } catch {
      // Ignore audio synthesis errors
    }
  }

  private playDangerDualBeep() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;

    try {
      const t = this.ctx.currentTime;

      // Pulse 1: 1900 Hz
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(1900, t);

      gain1.gain.setValueAtTime(0, t);
      gain1.gain.linearRampToValueAtTime(0.35, t + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.065);

      // Pulse 2: 2400 Hz (delayed slightly by 40ms)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(2400, t + 0.05);

      gain2.gain.setValueAtTime(0, t + 0.05);
      gain2.gain.linearRampToValueAtTime(0.35, t + 0.055);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(t + 0.05);
      osc2.stop(t + 0.115);
    } catch {
      // Ignore audio synthesis errors
    }
  }

  public stopBeeps() {
    if (this.beepIntervalId !== null) {
      clearInterval(this.beepIntervalId);
      this.beepIntervalId = null;
    }
  }

  public destroy() {
    this.isDestroyed = true;
    this.stopBeeps();
    this.removeUnlockListeners();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const audioAlert = new AudioAlertSynthesizer();
