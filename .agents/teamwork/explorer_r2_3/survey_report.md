# Test & Regression Survey Report — Explorer R2-3
**Project**: DriveDeck xADAS (Forward Collision Warning & Distance Estimation HUD)  
**Date**: 2026-10-16  
**Investigator**: Explorer R2-3 (Test & Regression Explorer)  
**Objective**: Comprehensive audit of the 7 test suites (81 tests), verification of proposed Challenger 1 & 2 remediations, and specification of test suite updates to achieve 100% pass rate without test relaxation.

---

## Executive Summary

The DriveDeck xADAS automated verification suite consists of **7 test suites containing 81 unit and integration tests** executed via Vitest and Testing Library React:
- **Baseline Test Pass Rate**: 81 / 81 passed (100% passing).
- **Production Build Status**: Clean compilation (`tsc -b && vite build`) in 245ms with 0 TypeScript and 0 CSS errors.
- **Critical Finding**: 8 tests across 2 challenger suites (`adasMathChallenge.test.ts`: 6 tests, `interactiveCompliance.test.tsx`: 2 tests) were constructed specifically to assert and document the existence of bugs confirmed by Challenger 1 (4 math anomalies) and Challenger 2 (2 interactive defects).
- **Remediation Impact**: Once the engineering team applies the planned fixes to `src/services/adasMath.ts`, `src/services/audioAlert.ts`, and `src/App.tsx`, these 8 tests will fail if left in their "bug-affirming" state.
- **Action Plan**: Upgrading these 8 tests from "bug-affirming assertions" to "hardened invariant verifications" ensures 100% test pass rate with **ZERO test relaxation**, preserving the full 81-test coverage and mathematically validating all boundary safeguards.

---

## 1. Inventory & Architecture of the 7 Test Suites (81 Tests)

| # | Test File Path | Tests | Scope & Focus Area | Target Modules |
|---|----------------|:-----:|-------------------|----------------|
| 1 | `src/services/__tests__/audioAlert.test.ts` | 6 | Web Audio API synthesizer states, mute lifecycle, alert level updates, audio unlocking, timer cleanup on destroy. | `audioAlert.ts` |
| 2 | `src/services/__tests__/adasMath.test.ts` | 12 | Standard ADAS mathematical functions: Ground pinhole, width pinhole, weighted fusion, adaptive confidence weighting, 1D Kalman EMA, TTC, 2s safe distance rule, alert level boundaries, uncertainty. | `adasMath.ts` |
| 3 | `src/components/__tests__/HudTelemetry.test.tsx` | 6 | Visual HUD rendering: large tabular distance readout ($\pm 1.4\text{m}$), 3-tier color badges, ego speed & 2-second rule, audio toggle button. | `HudTelemetry.tsx` |
| 4 | `src/components/__tests__/TargetLockBox.test.tsx` | 3 | Lead vehicle target lock reticle: floating tag text (`Lead Car • [Z]m • TTC: [X.X]s`), ground contact line ($y_2$), SAFE indicator when TTC > 99s. | `TargetLockBox.tsx` |
| 5 | `src/components/__tests__/TelemetryInspector.test.tsx` | 3 | Inspector panel: 4 functional zones, AI model selection tabs, live pipeline formula outputs ($Z_y, Z_w, Z_{raw}, Z_{kalman}$), Calibration Matrix tab switching. | `TelemetryInspector.tsx` |
| 6 | `src/services/__tests__/adasMathChallenge.test.ts` | 36 | Challenger 1 mathematical boundary oracle: horizon singularities, negative/zero box widths, clamping invariants, Kalman gain extremes, unnormalized fusion weights, reverse ego speed, closed-loop inverse projection, NaN resilience. | `adasMath.ts` |
| 7 | `src/components/__tests__/interactiveCompliance.test.tsx` | 15 | Challenger 2 acoustic & UI compliance: exact 850 Hz / 1900+2400 Hz frequencies, alert thresholds, danger vignette, Director panel presets, 'H' & 'M' hotkeys, manual arrow controls, input field isolation, audio listener cleanup. | `App.tsx`, `audioAlert.ts`, `DirectorControls.tsx` |
| **Total** | **7 Test Suites** | **81** | **Complete Full-Stack Coverage** | **All Core Services & HUD UI** |

---

## 2. Deep-Dive Audit of Challenger 1 & 2 Findings

### 2.1 Challenger 1 Mathematical Anomalies in `src/services/adasMath.ts`

| # | Anomaly | Current Behavior | Flaw & Risk | Planned Remediation |
|---|---------|------------------|-------------|---------------------|
| M1 | **Horizon Discontinuity** | `if (denominator <= 1.0) return 120.0;` | At $denominator = 1.001$, $Z_y = 150m$. At $denominator = 0.999$, $Z_y = 120m$. Abrupt 30m backward jump violates monotonic projection. | Return `150.0` instead of `120.0` to smoothly saturate at sensor maximum ceiling. |
| M2 | **Kalman NaN Poisoning** | `applyKalman1D` computes `clamped_gain * Z_raw + (1 - clamped_gain) * Z_prev` without checks | A single dropped frame with `NaN` permanently poisons `prevKalman` into `NaN`. The filter never recovers. | Add finite/NaN guards: if `Z_raw` is non-finite return `Z_prev`; if `Z_prev` is non-finite return `Z_raw`. |
| M3 | **Unnormalized Fusion Weights** | In `fuseDistances`, raw weights are multiplied directly when `autoWeightByConf: false` | If weights don't sum to 1.0 (e.g. $w_y=0.8, w_w=0.8$), $Z_{raw}$ is artificially scaled by $1.6\times$ (80m instead of 50m). | Normalize weights by `eff_wy / sum` and `eff_ww / sum` when sum > 0. |
| M4 | **Negative Safe Distance in Reverse** | `calculateMinSafeDistance` returns `Math.round(speedMs * 2.0)` | For negative speed (reverse, e.g. -18 km/h), returns negative distance (-10m). | Clamp input speed or output with `Math.max(0, ...)`. |

### 2.2 Challenger 2 Interactive & Lifecycle Defects

| # | Defect | Current Behavior | Flaw & Risk | Planned Remediation |
|---|--------|------------------|-------------|---------------------|
| I1 | **Global Keydown Hijacks Input Fields** | In `src/App.tsx`, `handleKeyDown` handles `'h'`, `'m'`, and arrow keys globally | Typing a YouTube URL (e.g., `https://...`) intercepts `'h'` and collapses the Director Panel mid-typing. | Guard at top of `handleKeyDown`: if `e.target` is `INPUT`, `TEXTAREA`, or `isContentEditable`, return immediately. |
| I2 | **Audio Unlock Event Listener Leak** | In `src/services/audioAlert.ts`, window listeners for `pointerdown` and `keydown` are added in constructor but never removed in `destroy()` | Calling `destroy()` leaves lingering listeners on `window`. Subsequent clicks resurrect a zombie `AudioContext`. | Store `unlockListener` as private member and `window.removeEventListener` in `destroy()`. |
| I3 | **Redundant Safe State Execution** | `updateAlert` check `this.currentAlert === level && this.beepIntervalId !== null` fails when level is `'safe'` | On every frame (60 FPS) in safe state, `stopBeeps()` is called redundantly. | Refine guard: `if (this.currentAlert === level && (level === 'safe' || this.isMuted || this.beepIntervalId !== null)) return;`. |

---

## 3. The 8 Adversarial "Bug-Affirming" Tests & Root Cause Analysis

Challenger 1 and 2 wrote tests designed to confirm their findings. Because these tests asserted that the bug occurred, implementing the fixes will cause them to fail unless updated.

### Breakdown of the 8 Tests Requiring Assertion Upgrades:

1. **`src/services/__tests__/adasMathChallenge.test.ts` (Lines 36-43)**:
   - *Test*: `y_max exactly at theoretical horizon does not throw or return NaN/Infinity`
   - *Current Assertion*: `expect(zHorizon).toBe(120.0);`
   - *Post-Fix Behavior*: `zHorizon` will be `150.0`.
   - *Failure if unadjusted*: `AssertionError: expected 150 to be 120`.

2. **`src/services/__tests__/adasMathChallenge.test.ts` (Lines 45-52)**:
   - *Test*: `y_max well above horizon (sky / negative coordinates) returns bounded fallback`
   - *Current Assertion*: `expect(dist).toBe(120.0);`
   - *Post-Fix Behavior*: `dist` will be `150.0`.
   - *Failure if unadjusted*: `AssertionError: expected 150 to be 120`.

3. **`src/services/__tests__/adasMathChallenge.test.ts` (Lines 54-70)**:
   - *Test*: `empirical challenge finding: reveals 30-meter non-monotonic jump at denominator = 1.0`
   - *Current Assertion*: `expect(zBelow).toBe(120.0); expect(zAbove - zBelow).toBe(30.0);`
   - *Post-Fix Behavior*: Both `zBelow` and `zAbove` are `150.0`, jump is `0.0`.
   - *Failure if unadjusted*: `AssertionError: expected 150 to be 120` and `expected 0 to be 30`.

4. **`src/services/__tests__/adasMathChallenge.test.ts` (Lines 246-253)**:
   - *Test*: `empirical challenge finding: unnormalized weights distort Z_raw when autoWeightByConf is false`
   - *Current Assertion*: `expect(Z_raw).toBe(80.0);`
   - *Post-Fix Behavior*: Weights normalized to 0.5 each, `Z_raw` becomes `50.0`.
   - *Failure if unadjusted*: `AssertionError: expected 50 to be 80`.

5. **`src/services/__tests__/adasMathChallenge.test.ts` (Lines 318-323)**:
   - *Test*: `empirical challenge finding: negative ego speed produces negative safe distance`
   - *Current Assertion*: `expect(dMin).toBe(-10);`
   - *Post-Fix Behavior*: Clamped to non-negative, `dMin` is `0`.
   - *Failure if unadjusted*: `AssertionError: expected 0 to be -10`.

6. **`src/services/__tests__/adasMathChallenge.test.ts` (Lines 365-376)**:
   - *Test*: `empirical challenge finding: NaN in Kalman filter permanently corrupts internal state`
   - *Current Assertion*: `expect(Number.isNaN(state)).toBe(true);`
   - *Post-Fix Behavior*: Filter recovers, rejects NaN, keeps previous 30.0m.
   - *Failure if unadjusted*: `AssertionError: expected false to be true`.

7. **`src/components/__tests__/interactiveCompliance.test.tsx` (Lines 422-435)**:
   - *Test*: `adversarial challenge: global hotkey "h" triggers even when typing in input field`
   - *Current Assertion*: `expect(panel).toBeNull();`
   - *Post-Fix Behavior*: Keydown ignored inside input, panel stays open (`expect(panel).not.toBeNull()`).
   - *Failure if unadjusted*: `AssertionError: expected HTMLElement to be null`.

8. **`src/components/__tests__/interactiveCompliance.test.tsx` (Lines 437-457)**:
   - *Test*: `adversarial challenge: audio unlock listener persists after destroy() causing zombie context`
   - *Current Assertion*: `expect(createdContextCount).toBeGreaterThan(initialCount);`
   - *Post-Fix Behavior*: Listener removed on `destroy()`, `createdContextCount === initialCount`.
   - *Failure if unadjusted*: `AssertionError: expected 1 to be greater than 1`.

---

## 4. Regression Analysis Across Remaining 5 Test Suites

We conducted an exhaustive dependency audit across the other 5 test suites (55 tests) to verify whether the planned fixes could introduce unintended regressions:

1. **`src/services/__tests__/audioAlert.test.ts` (6 tests)**:
   - Covers: `getMuted()`, `toggleMute()`, `setMuted()`, `updateAlert()`, `unlockAudio()`, `destroy()`.
   - *Audit*: The planned fix in `destroy()` safely detaches `this.unlockListener`. In test line 51: `expect(() => synthesizer.destroy()).not.toThrow()`, cleaning up listeners cleanly satisfies this assertion.
   - *Verdict*: **100% PASS, ZERO REGRESSION RISK**.

2. **`src/services/__tests__/adasMath.test.ts` (12 tests)**:
   - Covers: Ground pinhole ($y=220, 350, 180$), Width pinhole ($w=35, 140$), Weighted fusion ($0.6, 0.4$), Adaptive weights, Kalman ($20, 30$), Inverse pinhole ($Z=35$), TTC, MinSafeDist ($72 \to 40$, $36 \to 20$), Alert levels, Uncertainty.
   - *Audit*:
     - In ground pinhole boundary test: `expect(Z_edge).toBeGreaterThanOrEqual(2.0); expect(Z_edge).toBeLessThanOrEqual(150.0);` — for $y=180$, $Z_y=150.0$, which satisfies the $[2.0, 150.0]$ range.
     - In weighted fusion: $w_y = 0.6, w_w = 0.4 \implies \text{sum} = 1.0$. Normalization produces identical weights ($0.6/1.0 = 0.6$).
     - In safe distance: speeds are $72$ and $36$ (positive), `Math.max(0, ...)` produces identical results.
   - *Verdict*: **100% PASS, ZERO REGRESSION RISK**.

3. **`src/components/__tests__/HudTelemetry.test.tsx` (6 tests)**:
   - Covers: Large tabular numbers, Alert badges, 2-second rule readout, onToggleMute button.
   - *Audit*: Uses isolated mock telemetry objects with static values. No coupling with `App.tsx` keyboard handlers or raw pinhole singularities.
   - *Verdict*: **100% PASS, ZERO REGRESSION RISK**.

4. **`src/components/__tests__/TargetLockBox.test.tsx` (3 tests)**:
   - Covers: Lead Car tag, ground contact line $y_2$, TTC SAFE fallback.
   - *Audit*: Pure visual component driven by explicit mock telemetry props.
   - *Verdict*: **100% PASS, ZERO REGRESSION RISK**.

5. **`src/components/__tests__/TelemetryInspector.test.tsx` (3 tests)**:
   - Covers: 4 zones, model selector buttons, live pipeline values, Calibration matrix tab.
   - *Audit*: Directly renders passed props without internal math calculations.
   - *Verdict*: **100% PASS, ZERO REGRESSION RISK**.

---

## 5. Specification of Exact Test Suite Updates (No Test Relaxation)

To maintain 100% verification rigor without deleting or relaxing any assertions, the 8 tests must be updated as follows:

### 5.1 Updates to `src/services/__tests__/adasMathChallenge.test.ts`

```typescript
<<<<<<<< CURRENT ADVERSARIAL ORACLE
    it('empirical oracle: y_max exactly at theoretical horizon does not throw or return NaN/Infinity', () => {
      const zHorizon = calculateGroundPinholeDistance(theoreticalHorizonY, kittiCalibration);
      expect(Number.isFinite(zHorizon)).toBe(true);
      expect(zHorizon).toBeGreaterThanOrEqual(2.0);
      expect(zHorizon).toBeLessThanOrEqual(150.0);
      // Denominator is 0.0, so denominator <= 1.0 branch triggers -> returns 120.0
      expect(zHorizon).toBe(120.0);
    });

    it('empirical oracle: y_max well above horizon (sky / negative coordinates) returns bounded fallback', () => {
      const skyValues = [-1000, -100, 0, 50, 100, 150, theoreticalHorizonY - 10];
      for (const y of skyValues) {
        const dist = calculateGroundPinholeDistance(y, kittiCalibration);
        expect(Number.isFinite(dist)).toBe(true);
        expect(dist).toBe(120.0);
      }
    });

    it('empirical challenge finding: reveals 30-meter non-monotonic jump at denominator = 1.0', () => {
      const yThreshold = theoreticalHorizonY + 1.0;

      const zBelow = calculateGroundPinholeDistance(yThreshold - 0.01, kittiCalibration);
      const zAbove = calculateGroundPinholeDistance(yThreshold + 0.01, kittiCalibration);

      expect(zBelow).toBe(120.0);
      expect(zAbove).toBe(150.0);
      // Discontinuity observed: 30m jump
      expect(zAbove - zBelow).toBe(30.0);
    });
========
>>>>>>>> HARDENED INVARIANT VERIFICATION
    it('verified invariant: y_max exactly at theoretical horizon saturates smoothly to maximum range 150m', () => {
      const zHorizon = calculateGroundPinholeDistance(theoreticalHorizonY, kittiCalibration);
      expect(Number.isFinite(zHorizon)).toBe(true);
      expect(zHorizon).toBeGreaterThanOrEqual(2.0);
      expect(zHorizon).toBeLessThanOrEqual(150.0);
      // Denominator is 0.0, so denominator <= 1.0 branch triggers -> returns smooth ceiling 150.0m
      expect(zHorizon).toBe(150.0);
    });

    it('verified invariant: y_max well above horizon (sky / negative coordinates) returns smooth ceiling 150m', () => {
      const skyValues = [-1000, -100, 0, 50, 100, 150, theoreticalHorizonY - 10];
      for (const y of skyValues) {
        const dist = calculateGroundPinholeDistance(y, kittiCalibration);
        expect(Number.isFinite(dist)).toBe(true);
        expect(dist).toBe(150.0);
      }
    });

    it('verified invariant: 0-meter continuous transition at denominator = 1.0 boundary (eliminates 30m jump)', () => {
      const yThreshold = theoreticalHorizonY + 1.0;

      const zBelow = calculateGroundPinholeDistance(yThreshold - 0.01, kittiCalibration);
      const zAbove = calculateGroundPinholeDistance(yThreshold + 0.01, kittiCalibration);

      expect(zBelow).toBe(150.0);
      expect(zAbove).toBe(150.0);
      // Continuous boundary verified: 0m discontinuity
      expect(zAbove - zBelow).toBe(0.0);
    });
>>>>>>>>
```

```typescript
<<<<<<<< CURRENT ADVERSARIAL ORACLE (Line 246-253)
    it('empirical challenge finding: unnormalized weights distort Z_raw when autoWeightByConf is false', () => {
      // If someone configures weights that do not sum to 1.0 (e.g. w_y = 0.8, w_w = 0.8)
      // Z_raw becomes 0.8*50 + 0.8*50 = 80m instead of 50m!
      const unnormalizedWeights: FusionWeights = { w_y: 0.8, w_w: 0.8, K_gain: 0.25, autoWeightByConf: false };
      const { Z_raw } = fuseDistances(50.0, 50.0, unnormalizedWeights, 0.9);
      expect(Z_raw).toBe(80.0); // Demonstrates unnormalized sum vulnerability
    });
========
>>>>>>>> HARDENED INVARIANT VERIFICATION
    it('verified invariant: unnormalized weights are automatically normalized when autoWeightByConf is false', () => {
      // When weights do not sum to 1.0 (e.g. w_y = 0.8, w_w = 0.8), normalizer divides by sum (1.6)
      // eff_wy = 0.5, eff_ww = 0.5 -> Z_raw remains strictly 50.0m
      const unnormalizedWeights: FusionWeights = { w_y: 0.8, w_w: 0.8, K_gain: 0.25, autoWeightByConf: false };
      const { Z_raw, eff_wy, eff_ww } = fuseDistances(50.0, 50.0, unnormalizedWeights, 0.9);
      expect(Z_raw).toBe(50.0);
      expect(eff_wy).toBeCloseTo(0.5, 4);
      expect(eff_ww).toBeCloseTo(0.5, 4);
      expect(eff_wy + eff_ww).toBeCloseTo(1.0, 4);
    });
>>>>>>>>
```

```typescript
<<<<<<<< CURRENT ADVERSARIAL ORACLE (Line 318-323)
    it('empirical challenge finding: negative ego speed produces negative safe distance', () => {
      // In reverse (-18 km/h = -5 m/s):
      const dMin = calculateMinSafeDistance(-18);
      expect(dMin).toBe(-10); // Demonstrates lack of Math.max(0, ...) clamp
    });
========
>>>>>>>> HARDENED INVARIANT VERIFICATION
    it('verified invariant: negative ego speed in reverse is bounded to zero safe distance', () => {
      // In reverse (-18 km/h), safe following distance is clamped to 0m
      const dMin = calculateMinSafeDistance(-18);
      expect(dMin).toBe(0);
    });
>>>>>>>>
```

```typescript
<<<<<<<< CURRENT ADVERSARIAL ORACLE (Line 365-376)
    it('empirical challenge finding: NaN in Kalman filter permanently corrupts internal state', () => {
      // Initial state is valid: 30m
      let state = 30.0;
      // Corrupt frame arrives: Z_raw = NaN
      state = applyKalman1D(NaN, state, 0.25);
      expect(Number.isNaN(state)).toBe(true);

      // Next frame recovers: valid Z_raw = 30.0m arrives
      state = applyKalman1D(30.0, state, 0.25);
      // Because state was NaN, it CANNOT recover!
      expect(Number.isNaN(state)).toBe(true);
    });
========
>>>>>>>> HARDENED INVARIANT VERIFICATION
    it('verified invariant: Kalman filter rejects NaN input and smoothly maintains/recovers internal state', () => {
      // Initial state is valid: 30m
      let state = 30.0;
      // Corrupt frame arrives: Z_raw = NaN
      state = applyKalman1D(NaN, state, 0.25);
      // Filter rejects NaN and preserves prior valid state
      expect(Number.isNaN(state)).toBe(false);
      expect(state).toBe(30.0);

      // Next frame recovers: valid Z_raw = 20.0m arrives
      state = applyKalman1D(20.0, state, 0.25);
      // Normal filtering resumes: 0.25 * 20 + 0.75 * 30 = 27.5
      expect(Number.isNaN(state)).toBe(false);
      expect(state).toBeCloseTo(27.5, 2);
    });
>>>>>>>>
```

---

### 5.2 Updates to `src/components/__tests__/interactiveCompliance.test.tsx`

```typescript
<<<<<<<< CURRENT ADVERSARIAL ORACLE (Line 422-435)
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
========
>>>>>>>> HARDENED INVARIANT VERIFICATION
    it('verified invariant: global hotkeys ignore keydown events originating from editable inputs', () => {
      render(<App />);

      const youtubeInput = screen.getByPlaceholderText('Dán link YouTube (URL / ID)...');
      youtubeInput.focus();

      // When user types 'h' in YouTube input, input guard must prevent closing the panel
      fireEvent.keyDown(youtubeInput, { key: 'h' });

      const panel = screen.queryByText('DEMO DIRECTOR PANEL');
      expect(panel).not.toBeNull();

      // Also verify typing 'm' inside input does not trigger mute
      const muteBtn = screen.getByTitle('Tắt tiếng cảnh báo');
      expect(muteBtn).toBeDefined();
      fireEvent.keyDown(youtubeInput, { key: 'm' });
      // Audio is not muted, mute button remains unchanged
      expect(screen.queryByTitle('Bật âm thanh cảnh báo')).toBeNull();
    });
>>>>>>>>
```

```typescript
<<<<<<<< CURRENT ADVERSARIAL ORACLE (Line 437-457)
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
========
>>>>>>>> HARDENED INVARIANT VERIFICATION
    it('verified invariant: audio unlock window listeners are detached upon destroy(), preventing zombie context', async () => {
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
      // User clicks or presses keys anywhere on the page
      fireEvent.pointerDown(window);
      fireEvent.keyDown(window, { key: 'Enter' });

      // Verified: No new AudioContext is created on destroyed instance
      expect(createdContextCount).toBe(initialCount);
    });
>>>>>>>>
```

---

## 6. Synthesis & Execution Summary Table

| Test Suite | File Path | Existing Count | Post-Fix Count | Expected Pass Rate | Test Updates Required |
|---|---|:---:|:---:|:---:|---|
| **Audio Synthesizer** | `src/services/__tests__/audioAlert.test.ts` | 6 | 6 | 100% (6/6) | None (zero changes needed) |
| **ADAS Math Core** | `src/services/__tests__/adasMath.test.ts` | 12 | 12 | 100% (12/12) | None (zero changes needed) |
| **HUD Telemetry** | `src/components/__tests__/HudTelemetry.test.tsx` | 6 | 6 | 100% (6/6) | None (zero changes needed) |
| **Target Lock Reticle** | `src/components/__tests__/TargetLockBox.test.tsx` | 3 | 3 | 100% (3/3) | None (zero changes needed) |
| **Telemetry Inspector** | `src/components/__tests__/TelemetryInspector.test.tsx` | 3 | 3 | 100% (3/3) | None (zero changes needed) |
| **Math Challenge Suite** | `src/services/__tests__/adasMathChallenge.test.ts` | 36 | 36 | 100% (36/36) | Update 6 assertions from bug-affirming to hardened invariant |
| **Interactive Compliance** | `src/components/__tests__/interactiveCompliance.test.tsx` | 15 | 15 | 100% (15/15) | Update 2 assertions from bug-affirming to hardened invariant |
| **Grand Total** | **7 Suites** | **81** | **81** | **100% (81/81)** | **8 assertions upgraded, 0 tests deleted or relaxed** |

---

## 7. Next Steps for Implementation Team

1. Apply source code remediations:
   - `src/services/adasMath.ts`: lines 18 (150.0m), 56-61 (normalize weights), 73-74 (NaN guard in Kalman), 158 (clamp non-negative safe distance).
   - `src/services/audioAlert.ts`: lines 10-20 & 173-179 (store and remove `unlockListener`), line 76 (safe/muted short-circuit guard).
   - `src/App.tsx`: line 163 (editable element guard in `handleKeyDown`).
2. Update the 8 assertions in `adasMathChallenge.test.ts` and `interactiveCompliance.test.tsx` as detailed in Section 5.
3. Run `npm test` to verify all 81 tests pass cleanly.
4. Run `npm run build` to verify clean production build without TypeScript/CSS errors.
