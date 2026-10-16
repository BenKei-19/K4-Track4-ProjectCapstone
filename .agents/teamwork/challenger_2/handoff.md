# Empirical Challenge Report & Handoff — Challenger 2 (Acoustic & Interactive UI)

**Agent**: Challenger 2 (Acoustic & Interactive UI Challenger)  
**Date**: 2026-10-16  
**Verdict**: **REQUEST_CHANGES** (Minor, High-Impact Interactive Defect Fix)  
**Overall Risk Assessment**: **MEDIUM**

---

## 1. Challenge Summary

Challenger 2 empirically investigated and executed stress-testing harnesses against the Acoustic Synthesizer, 3-tier visual HUD alert thresholds, Director Panel interactive dock, hotkey bindings, and scenario presets for the DriveDeck xADAS HUD system.

The core implementation exhibits exceptional mathematical rigor, clean 60 FPS state coordination, and 100% compliance with primary acoustics and styling specifications:
- Pure Web Audio API tone synthesis verified: 850 Hz sine wave (caution, 850ms interval) and 1900/2400 Hz triangle wave double-beep (danger, 220ms interval).
- 3-tier alert thresholds verified: Safe (>25m, `#10B981`, silent), Caution (12–25m, `#F59E0B`), Danger (<12m, `#EF4444`, `animate-pulse` badge + `danger-vignette` pulse).
- Preset scenarios verified: Cruising (40m), Hard Braking (40m → 8m), Cut-in (10m), Tailgating (15m).
- Arrow keys in manual mode: ArrowUp/Down (distance ±2m) and ArrowLeft/Right (lane offset ±0.05).

However, rigorous adversarial stress-testing identified **two interactive/lifecycle defects** that require developer attention:
1. **[Medium Risk] Global Keydown Listener Hijacks Typing in Input Fields**: In `src/App.tsx`, typing `'h'` or `'m'` while entering a custom YouTube URL into the Director Panel's input box triggers the global hotkey handler, immediately collapsing the Director Panel or toggling mute mid-typing.
2. **[Low Risk] Audio Unlock Event Listener Lifecycle Leak**: In `src/services/audioAlert.ts`, window listeners for `pointerdown` and `keydown` attached in the constructor are not detached if `destroy()` is called before user interaction, resulting in zombie `AudioContext` recreation on post-destruction clicks.

---

## 2. Challenges & Findings

### [Medium] Challenge 1: Global Hotkey Capture during Form Input in `src/App.tsx`
- **Assumption challenged**: The keyboard listener assumes keypress events 'h', 'm', and arrow keys only represent global HUD control actions.
- **Attack scenario**: User clicks the text input in the Director Panel: *"Dán link YouTube (URL / ID)..."* and starts typing a standard URL (e.g., `https://www.youtube.com/watch?v=...`). Upon typing `'h'` (character 1 of `https`), the global listener intercepts `e.key === 'h'` and toggles `isDirectorVisible` to `false`. The entire Director Panel unmounts/collapses instantly, dropping input focus. Furthermore, typing `'m'` (in `.com` or `watch`) unexpectedly mutes the audio alert. In `manual` mode, pressing Left/Right arrows inside the input box prevents text cursor navigation (`e.preventDefault()`) and instead shifts the car's lane offset.
- **Blast radius**: Breaks Feature F01/R1 (Custom YouTube URL/ID entry) and severely impacts live demonstrations when typing URLs or manual values.
- **Mitigation**:
  Add an editable element guard at the entry of `handleKeyDown` in `src/App.tsx`:
  ```typescript
  const target = e.target as HTMLElement | null;
  const isEditable = target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
  if (isEditable) return;
  ```

---

### [Low] Challenge 2: AudioContext Zombie Re-instantiation via Lingering Window Listeners
- **Assumption challenged**: Calling `audioAlert.destroy()` completely frees and disables audio resources.
- **Attack scenario**: In `src/services/audioAlert.ts`, the constructor adds window event listeners:
  ```typescript
  const unlockListener = () => {
    this.unlockAudio();
    window.removeEventListener('pointerdown', unlockListener);
    window.removeEventListener('keydown', unlockListener);
  };
  window.addEventListener('pointerdown', unlockListener);
  window.addEventListener('keydown', unlockListener);
  ```
  If `destroy()` is invoked before a user click or keypress occurs (e.g., during SPA unmounting or unit testing), `unlockListener` remains registered on `window`. When the user later clicks anywhere on the page, `unlockListener` executes and calls `this.unlockAudio()`, which calls `this.initContext()`, instantiating a new `AudioContext` on the dead synthesizer. In Chromium browsers with a hardware limit of 6 audio contexts, this can trigger resource exhaustion errors.
- **Blast radius**: Potential memory leak and AudioContext exhaustion in long-running sessions or rapid unmount/remount flows.
- **Mitigation**:
  Store `unlockListener` as an instance property and remove it in `destroy()`:
  ```typescript
  private unlockListener: (() => void) | null = null;
  ...
  public destroy() {
    this.stopBeeps();
    if (this.unlockListener && typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.unlockListener);
      window.removeEventListener('keydown', this.unlockListener);
      this.unlockListener = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
  ```

---

### [Low] Challenge 3: Inefficient Short-Circuit Guard in `audioAlert.updateAlert`
- **Assumption challenged**: `updateAlert` short-circuits on every frame when the alert level has not changed.
- **Attack scenario**: In `src/services/audioAlert.ts`:
  ```typescript
  public updateAlert(level: AlertLevel) {
    if (this.currentAlert === level && this.beepIntervalId !== null) {
      return;
    }
  ```
  When the vehicle is in `'safe'` state, `this.beepIntervalId` is `null`. As a result, the condition evaluates to `false` on every animation frame (60 times per second), redundantly executing `this.stopBeeps()` and property updates.
- **Blast radius**: Negligible CPU overhead, zero audio glitch, but violates clean idempotent state guard design.
- **Mitigation**: Update short-circuit check:
  ```typescript
  if (this.currentAlert === level && (level === 'safe' || this.isMuted || this.beepIntervalId !== null)) {
    return;
  }
  ```

---

## 3. Stress Test Results

Test execution ran against `src/components/__tests__/interactiveCompliance.test.tsx` (15 empirical tests):

| # | Stress Scenario | Expected Behavior | Actual Behavior | Result |
|---|-----------------|-------------------|-----------------|:------:|
| 1 | Caution Alert Audio Tone (`level='warning'`) | Pure 850 Hz sine wave, 850ms interval | `osc.type === 'sine'`, `osc.frequency === 850`, `setInterval(..., 850)` | **PASS** |
| 2 | Danger Alert Audio Tone (`level='danger'`) | Dual-pitch 1900 Hz & 2400 Hz triangle waves, 220ms interval | `osc1.frequency === 1900`, `osc2.frequency === 2400` (+50ms delay), `setInterval(..., 220)` | **PASS** |
| 3 | Safe Alert State (`level='safe'`) | 0 oscillators created, silent | 0 oscillators generated | **PASS** |
| 4 | Audio Mute Toggle | Immediate silence, stops intervals, unmuting restores current alert | Beep timer cleared on mute; re-triggers on unmute | **PASS** |
| 5 | Audio Unlock Mechanics | Resumes suspended context, sets `isUnlocked = true` | `ctx.resume()` invoked, `isUnlocked === true` | **PASS** |
| 6 | Safe Boundary Classification | `distance > 25.0m` -> `'safe'` | 25.01m -> `'safe'`, 45.0m -> `'safe'` | **PASS** |
| 7 | Caution Boundary Classification | `12.0m <= distance <= 25.0m` -> `'warning'` | 25.00m -> `'warning'`, 12.00m -> `'warning'` | **PASS** |
| 8 | Danger Boundary Classification | `distance < 12.0m` -> `'danger'` | 11.99m -> `'danger'`, 8.0m -> `'danger'` | **PASS** |
| 9 | Exact Hex Colors & Badge Text | Green `#10B981`, Amber `#F59E0B`, Red `#EF4444` | Exact matches with Vietnamese badge copy | **PASS** |
| 10 | Danger Red Vignette Pulse | `.danger-vignette` element rendered only when `isDanger=true` | Inset red shadow pulse border rendered conditionally | **PASS** |
| 11 | Scenario Presets (4 modes) | Cruising (40m), Hard Brake (40->8m), Cut-in (10m), Tailgate (15m) | Buttons call `onTriggerScenario` with exact enum targets | **PASS** |
| 12 | Director Panel Hotkey 'H' | Pressing 'h'/'H' toggles dock between expanded and minimized pill | Toggles state seamlessly on keydown | **PASS** |
| 13 | Manual Arrow Keys Control | Up (+2m), Down (-2m), Left (-0.05), Right (+0.05) | Manual distance and offset update correctly | **PASS** |
| 14 | **Adversarial**: Typing in text inputs | Global hotkeys should ignore text inputs | **FAIL (Bug Confirmed)**: Typing 'h' collapses Director Panel; typing 'm' toggles mute | **CONFIRMED** |
| 15 | **Adversarial**: Window click post-`destroy()` | No zombie AudioContext instantiation | **FAIL (Leak Confirmed)**: Lingering listener instantiates new AudioContext | **CONFIRMED** |

---

## 4. 5-Component Handoff Protocol

### 1. Observation
- In `src/App.tsx:162-188`:
  ```typescript
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'h' || e.key === 'H') {
      setIsDirectorVisible((prev) => !prev);
    }
    if (e.key === 'm' || e.key === 'M') {
      handleToggleMute();
    }
    if (operatingMode === 'manual') {
      if (e.key === 'ArrowUp') { ... }
    }
  };
  ```
  No check for `target.tagName === 'INPUT'` exists.
- In `src/services/audioAlert.ts:10-20` and `173-179`:
  Constructor registers window listeners for `pointerdown` and `keydown`, but `destroy()` only calls `this.stopBeeps()` and `this.ctx.close()`. The window listeners remain active.
- In `src/services/audioAlert.ts:108-160`:
  Warning beep configures `osc.frequency.setValueAtTime(850, ...)` with type `'sine'`.
  Danger beep configures `osc1.frequency.setValueAtTime(1900, ...)` and `osc2.frequency.setValueAtTime(2400, ...)` with type `'triangle'`.
- In `src/services/adasMath.ts:167-171`:
  ```typescript
  export function determineAlertLevel(distanceM: number): AlertLevel {
    if (distanceM > 25) return 'safe';
    if (distanceM >= 12) return 'warning';
    return 'danger';
  }
  ```
- Vitest suite results: 81 passing tests across 7 test files.
- Build results: `npm run build` succeeds cleanly in 273ms with zero TypeScript or CSS errors.

### 2. Logic Chain
1. Requirement R1 and R5 specify custom YouTube URL entry and 'H' hotkey panel hiding.
2. When a user focuses the YouTube URL text input and enters `https://youtu.be/...`, the keydown event bubbles up to `window`.
3. Because `handleKeyDown` listens on `window` without verifying if `e.target` is an input field, `e.key === 'h'` triggers `setIsDirectorVisible(false)`.
4. The Director Panel is unmounted, disrupting user input.
5. Therefore, an input guard is required in `handleKeyDown`.

### 3. Caveats
- Audio playback in headless test environments (jsdom) relies on the Web Audio API mock spy. Real browser execution depends on user gesture interaction to satisfy browser autoplay policies (`unlockAudio`).
- The 40m → 8m hard braking curve is time-interpolated over 2.5 seconds via `requestAnimationFrame` ticks; in extreme lag or frame drops (>100ms dt), step clamping ensures stability.

### 4. Conclusion
The implementation of the acoustic synthesizer, 3-tier visual HUD alerts, Director Panel controls, and preset scenarios is mathematically sound and feature-complete.
Challenger 2 issues a **REQUEST_CHANGES** solely to fix the input element hotkey conflict in `src/App.tsx` and the listener cleanup in `src/services/audioAlert.ts`. Once these 2 targeted fixes are applied, the system will achieve 100% production-grade interactive stability.

### 5. Verification Method
To independently verify the implementation and findings:
1. Run the Vitest test suite:
   ```powershell
   npm test
   ```
   Inspect results for `src/components/__tests__/interactiveCompliance.test.tsx`.
2. Run production build:
   ```powershell
   npm run build
   ```
3. Manual verification in browser (`npm run dev`):
   - Click "Dán link YouTube (URL / ID)..." and type `https://...`. Observe if the panel disappears on the letter 'h'.
   - Press 'H' outside input to verify Director Panel hide/show dock behavior.
   - Switch to "Chế độ Kịch bản" and test all 4 scenario presets.
   - Switch to "Manual Live" and press Up/Down/Left/Right arrows.
