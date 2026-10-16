# Survey Report: Interactive Keyboard & Audio Alert Refinement
**Agent**: Explorer R2-2 (Interactive & Audio Refinement Explorer)  
**Date**: 2026-10-16  
**Target Milestone**: Phase 2 Bugfix & Polish (Worker M2 Implementation)  
**Status**: COMPLETE (Read-Only Analysis & Drop-In Code Formulations)

---

## 1. Executive Summary

Challenger 2 empirically validated the acoustic synthesizer, 3-tier visual HUD alert thresholds, Director Panel interactive dock, hotkey bindings, and scenario presets for DriveDeck xADAS.
While the mathematical modeling and styling achieved 100% compliance, Challenger 2 highlighted three specific interactive & lifecycle defects:

1. **Global Keydown Interception in Input Elements (`src/App.tsx`)**:
   In `src/App.tsx` (lines 162–188), `handleKeyDown` captures `'h'`, `'m'`, and arrow keys globally without verifying if the user is typing into an `<input>`, `<textarea>`, or contentEditable element. As a result, typing a YouTube URL (e.g. `https://...`) instantly collapses the Director Panel upon typing `'h'`, toggles mute upon typing `'m'`, and prevents text cursor navigation via arrow keys.
2. **AudioContext Zombie Recreation via Lingering Window Listeners (`src/services/audioAlert.ts`)**:
   In `src/services/audioAlert.ts` (lines 10–20, 173–179), `window.addEventListener('pointerdown', ...)` and `'keydown'` are registered in the constructor, but are never detached in `destroy()`. If `destroy()` is called before user interaction (such as in unmounting or test suites), subsequent user gestures fire `unlockAudio()` and instantiate a new `AudioContext` on a dead synthesizer.
3. **Redundant 60 FPS `stopBeeps()` Execution in Safe/Muted State (`src/services/audioAlert.ts`)**:
   In `src/services/audioAlert.ts` (lines 75–98), `updateAlert` contains the guard `if (this.currentAlert === level && this.beepIntervalId !== null) return;`. In `'safe'` state (and when muted), `beepIntervalId` is always `null`. Consequently, this condition evaluates to `false` on every animation frame (60 FPS), repeatedly executing `stopBeeps()` and interval clearing 60 times per second.

In addition, this survey identified a crucial dependency: Challenger 2 implemented tests 14 and 15 in `src/components/__tests__/interactiveCompliance.test.tsx` that assert the *buggy* behavior (`toBeNull()` and `toBeGreaterThan(initialCount)`). When Worker M2 fixes the code, those test assertions must be updated to expect the *repaired* behavior, or the test suite will fail.

---

## 2. Item 1: Editable Element Guard in `src/App.tsx`

### 2.1 Problem Analysis
In `src/App.tsx` lines 160–192:
```typescript
  // Keyboard shortcut listeners (H to hide director panel, arrows for manual control)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle Director Panel
      if (e.key === 'h' || e.key === 'H') {
        setIsDirectorVisible((prev) => !prev);
      }
      // Toggle Mute
      if (e.key === 'm' || e.key === 'M') {
        handleToggleMute();
      }

      // Manual control arrow keys
      if (operatingMode === 'manual') {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setManualDistance((prev) => Math.min(75, prev + 2));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setManualDistance((prev) => Math.max(5, prev - 2));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setManualOffset((prev) => Math.max(-0.7, prev - 0.05));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setManualOffset((prev) => Math.min(0.7, prev + 0.05));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [operatingMode, handleToggleMute]);
```

- When the user focuses the YouTube URL input box in `DirectorControls` (`<input type="text" placeholder="Dán link YouTube (URL / ID)..." />`) and types `'h'` (as in `https`), the event bubbles to `window`.
- `handleKeyDown` matches `e.key === 'h'`, toggles `isDirectorVisible` to `false`, and unmounts the panel mid-typing.
- Similarly, typing `'m'` (as in `.com`) toggles mute.
- When `operatingMode === 'manual'`, typing arrow keys to reposition the cursor inside the text input or interacting with range sliders (`<input type="range">`) calls `e.preventDefault()`, hijacking cursor navigation and adjusting vehicle manual distance / offset instead.

### 2.2 Drop-In Code Recommendation for `src/App.tsx`
Insert the editable element guard at the very beginning of `handleKeyDown`:

```typescript
<<<< Before (lines 162-167)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle Director Panel
      if (e.key === 'h' || e.key === 'H') {
        setIsDirectorVisible((prev) => !prev);
      }
==== After
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard against hijacking keystrokes while user is typing in form controls
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Toggle Director Panel
      if (e.key === 'h' || e.key === 'H') {
        setIsDirectorVisible((prev) => !prev);
      }
>>>>
```

### 2.3 Edge Case Coverage
- Standard `<input type="text">` (YouTube input): Protected.
- `<input type="range">` (Lane horizon, calibration sliders): Left/Right arrow slider adjustments are preserved without altering vehicle lane offset.
- `<textarea>` / `contentEditable`: Protected if future modals or editable fields are introduced.
- Pressing `'h'`, `'m'`, or Arrow keys anywhere else on the document or canvas operates normally.

---

## 3. Item 2: Audio Unlock Event Listener Cleanup in `src/services/audioAlert.ts`

### 3.1 Problem Analysis
In `src/services/audioAlert.ts`:
```typescript
export class AudioAlertSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private currentAlert: AlertLevel = 'safe';
  private beepIntervalId: number | null = null;
  private isUnlocked: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlockListener = () => {
        this.unlockAudio();
        window.removeEventListener('pointerdown', unlockListener);
        window.removeEventListener('keydown', unlockListener);
      };
      window.addEventListener('pointerdown', unlockListener);
      window.addEventListener('keydown', unlockListener);
    }
  }
...
  public destroy() {
    this.stopBeeps();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
```

- If `synth.destroy()` is called before the user clicks or presses a key, the `unlockListener` closure remains attached to `window`.
- When the user later clicks anywhere on the document, `unlockListener` triggers, calling `this.unlockAudio()` -> `this.initContext()`.
- This creates a new `AudioContext` on a destroyed synthesizer instance.
- In Chromium browsers (which enforce a hard cap of 6 active `AudioContext` instances per page), repeated test runs or unmount/remount cycles cause `AudioContext` exhaustion and memory leaks.

### 3.2 Drop-In Code Recommendation for `src/services/audioAlert.ts`
1. Add `private unlockListener: (() => void) | null = null;` and `private isDestroyed: boolean = false;` to instance fields.
2. Store the handler reference on `this.unlockListener`.
3. Provide a helper `removeUnlockListeners()` to detach from `window` upon interaction, explicit unlock, or destruction.
4. Call `removeUnlockListeners()` and mark `this.isDestroyed = true` in `destroy()`.
5. Guard `initContext()` and `unlockAudio()` with `if (this.isDestroyed) return;`.

```typescript
<<<< Before (lines 3-21)
export class AudioAlertSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private currentAlert: AlertLevel = 'safe';
  private beepIntervalId: number | null = null;
  private isUnlocked: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlockListener = () => {
        this.unlockAudio();
        window.removeEventListener('pointerdown', unlockListener);
        window.removeEventListener('keydown', unlockListener);
      };
      window.addEventListener('pointerdown', unlockListener);
      window.addEventListener('keydown', unlockListener);
    }
  }
==== After
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
>>>>
```

And in `unlockAudio()`, `initContext()`, and `destroy()`:

```typescript
<<<< Before (lines 22-47 and 173-179)
  public async unlockAudio(): Promise<boolean> {
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
...
  public destroy() {
    this.stopBeeps();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
==== After
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
...
  public destroy() {
    this.isDestroyed = true;
    this.stopBeeps();
    this.removeUnlockListeners();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
>>>>
```

---

## 4. Item 3: Update `updateAlert` Short-Circuit Guard in `src/services/audioAlert.ts`

### 4.1 Problem Analysis
In `src/services/audioAlert.ts`:
```typescript
  public updateAlert(level: AlertLevel) {
    if (this.currentAlert === level && this.beepIntervalId !== null) {
      return;
    }
    this.currentAlert = level;

    this.stopBeeps();

    if (this.isMuted) return;

    if (level === 'warning') {
...
```

- When the vehicle is at a safe distance (`>25m`), `determineAlertLevel` outputs `'safe'`.
- In `App.tsx` line 315, `audioAlert.updateAlert(alertLevel)` is called inside the `requestAnimationFrame` render loop on every frame.
- When `level === 'safe'`, `this.beepIntervalId` is `null`.
- Therefore, `this.currentAlert === level && this.beepIntervalId !== null` evaluates to:
  `'safe' === 'safe' && null !== null` -> `true && false` -> `false`.
- The short-circuit fails. Every single frame at 60 FPS, the synthesizer calls `this.stopBeeps()`, which executes `window.clearInterval(...)` and property reassignment.
- Similarly, when `isMuted === true`, `beepIntervalId` is `null`, causing continuous redundant calls.

### 4.2 Drop-In Code Recommendation for `src/services/audioAlert.ts`
Update the short-circuit condition:

```typescript
<<<< Before (lines 75-79)
  public updateAlert(level: AlertLevel) {
    if (this.currentAlert === level && this.beepIntervalId !== null) {
      return;
    }
    this.currentAlert = level;
==== After
  public updateAlert(level: AlertLevel) {
    if (
      this.currentAlert === level &&
      (level === 'safe' || this.isMuted || this.beepIntervalId !== null)
    ) {
      return;
    }
    this.currentAlert = level;
>>>>
```

### 4.3 State Transition Proof Table
| Current State | Target Level | Muted? | `beepIntervalId` | Condition Result | Action Taken |
|---|---|:---:|:---:|:---:|---|
| `'safe'` | `'safe'` | No | `null` | **TRUE** (`level === 'safe'`) | **Immediate return** (0 timer operations, 0 CPU churn) |
| `'safe'` | `'warning'` | No | `null` | **FALSE** (`'safe' !== 'warning'`) | Plays 850 Hz tone, sets interval timer |
| `'warning'` | `'warning'` | No | `123` | **TRUE** (`beepIntervalId !== null`) | **Immediate return** |
| `'warning'` | `'warning'` | Yes | `null` | **TRUE** (`this.isMuted === true`) | **Immediate return** |
| `'warning'` (was muted) | `'warning'` (unmute) | No | `null` | **FALSE** (not safe, not muted, id is null) | Re-initiates warning beep tone & interval timer |
| `'warning'` | `'safe'` | No | `123` | **FALSE** (`'warning' !== 'safe'`) | Stops interval timer, transitions to silent safe |
| `'danger'` | `'danger'` | No | `124` | **TRUE** (`beepIntervalId !== null`) | **Immediate return** |

---

## 5. Accompanying Test Adjustments

### 5.1 Test Updates in `src/components/__tests__/interactiveCompliance.test.tsx`
Lines 422–458 in `src/components/__tests__/interactiveCompliance.test.tsx` were specifically written by Challenger 2 to assert the *defective* states. Once Worker M2 implements the fixes above, these tests must be updated to assert the *corrected* behavior:

```typescript
<<<< Before (lines 422-458)
    it('adversarial challenge: global hotkey "h" triggers even when typing in input field', () => {
      render(<App />);

      const youtubeInput = screen.getByPlaceholderText('Dán link YouTube (URL / ID)...');
      youtubeInput.focus();

      // When user types 'h' in YouTube input, global keydown listener incorrectly intercepts it
      fireEvent.keyDown(youtubeInput, { key: 'h' });

      // Note: Because App.tsx does not check target.tagName === 'INPUT', panel is hidden unexpectedly!
      const panel = screen.queryByText('DEMO DIRECTOR PANEL');
      // If panel is null, this proves the bug where typing 'h' closes the panel!
      expect(panel).toBeNull();
    });

    it('adversarial challenge: audio unlock listener persists after destroy() causing zombie context', async () => {
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
      // User clicks anywhere on the page
      fireEvent.pointerDown(window);

      // Verify whether unlockListener fires on destroyed instance and recreates AudioContext
      // If createdContextCount > initialCount, this empirically proves the lifecycle leak
      expect(createdContextCount).toBeGreaterThan(initialCount);
    });
==== After
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
>>>>
```

### 5.2 Unit Test Addition for `src/services/__tests__/audioAlert.test.ts`
To verify the short-circuit optimization in Item 3, add this test case to `src/services/__tests__/audioAlert.test.ts`:

```typescript
  it('short-circuits updateAlert cleanly without calling stopBeeps repeatedly in safe mode', () => {
    const synth = new AudioAlertSynthesizer();
    // Transition from initial safe to warning to activate beeps
    synth.updateAlert('warning');

    const stopBeepsSpy = vi.spyOn(synth, 'stopBeeps');

    // Transition back to safe: stopBeeps called once to clear warning beeps
    synth.updateAlert('safe');
    expect(stopBeepsSpy).toHaveBeenCalledTimes(1);

    // Subsequent 60 calls (simulating 60 FPS in safe mode) must short-circuit without calling stopBeeps
    for (let i = 0; i < 60; i++) {
      synth.updateAlert('safe');
    }
    expect(stopBeepsSpy).toHaveBeenCalledTimes(1);

    synth.destroy();
  });
```

---

## 6. Verification Method

To verify the implementation once applied by Worker M2:

1. **Automated Unit & Integration Tests**:
   ```powershell
   npm test -- --run
   ```
   Confirm all test suites (including `audioAlert.test.ts` and `interactiveCompliance.test.tsx`) pass 100%.

2. **Production Build Compilation**:
   ```powershell
   npm run build
   ```
   Confirm zero TypeScript errors and successful production chunk bundling.

3. **Manual Interactive Verification**:
   - Run `npm run dev` and open the web browser.
   - Click into the "Dán link YouTube (URL / ID)..." input field.
   - Type `https://www.youtube.com/watch?v=mU4PjQJ92Xo`.
   - Verify that typing 'h' and 'm' does NOT toggle the Director Panel and does NOT toggle mute.
   - Use Arrow Left/Right inside the input; verify text cursor moves without changing the vehicle lane offset.
   - Click outside the input and press 'H' -> verify Director Panel collapses/expands smoothly.
   - Press 'M' outside input -> verify audio alert mute toggles.
