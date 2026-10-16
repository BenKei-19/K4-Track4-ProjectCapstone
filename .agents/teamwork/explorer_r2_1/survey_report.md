# ADAS Math Engine Refinement Survey Report

**Author**: Explorer R2-1 (Math Engine Refinement Explorer)  
**Target Milestone**: M2 Math Engine Refinement  
**Target Worker**: Worker M2  
**Date**: 2026-10-16  

---

## 1. Executive Summary

Following Challenger 1's adversarial stress testing and verification report (`challenger_1/handoff.md`), 4 mathematical edge cases were identified in `src/services/adasMath.ts`. While the primary mathematical models (Ground Pinhole $Z_y$, Vehicle Width Pinhole $Z_w$, 1D Kalman Filter, and Time-To-Collision) operate correctly under nominal conditions, these 4 edge cases create potential discontinuities, state corruption, or numerical distortion:

1. **Horizon Singularity Discontinuity**: At or above the horizon line ($denominator \le 1.0$), `calculateGroundPinholeDistance` returns `120.0m`, whereas values just above threshold saturate at `150.0m`, creating an abrupt $30.0m$ backward jump and sensor discrepancy against $Z_w$ ($150.0m$).
2. **Permanent Kalman NaN Poisoning**: In `applyKalman1D`, if an unhandled `NaN` measurement enters `Z_raw`, the filter permanently traps `state.prevKalman` in `NaN`, rendering HUD telemetry unrecoverable without a browser reload.
3. **Unnormalized Fusion Weights in Pure Service**: When `autoWeightByConf` is `false`, `fuseDistances` performs $Z_{raw} = w_y Z_y + w_w Z_w$ without enforcing $\sum w_i = 1.0$. Unnormalized slider values or config parameters inflate or deflate $Z_{raw}$ arbitrarily.
4. **Negative Safe Following Distance**: `calculateMinSafeDistance` computes $d_{min} = v_{ego} \times 2s$ without bounding $v_{ego} \ge 0$, yielding negative distance values (e.g. $-10m$) when the vehicle is in reverse gear.

This report details the mathematical proofs, exact drop-in code implementations for `src/services/adasMath.ts`, and the required updates for the oracle test suite `src/services/__tests__/adasMathChallenge.test.ts`.

---

## 2. In-Depth Root Cause & Mathematical Analysis

### 2.1. Horizon Singularity Discontinuity (`adasMath.ts:18`)

#### Observation & Mathematical Proof:
The projective ground contact formula with camera pitch correction is:
$$Z_y = \frac{f_y \cdot H_{cam}}{(y_{max} - c_y) + f_y \tan(\theta_{pitch})} = \frac{f_y \cdot H_{cam}}{denominator}$$
For KITTI calibration ($f_y = 721.5\text{px}$, $H_{cam} = 1.65\text{m}$, $c_y = 185.0\text{px}$, $\theta_{pitch} = 0.5^\circ$), the numerator is $721.5 \times 1.65 = 1190.475\text{ m}\cdot\text{px}$.
The theoretical horizon line is:
$$y_{horizon} = c_y - f_y \tan(\theta_{pitch}) \approx 185.0 - 6.296 = 178.704\text{ px}$$

- As $y_{max} \to y_{horizon}^+$ from below, $denominator \to 0^+$ and $Z_y \to +\infty$.
- The ceiling clamp in line 22 is $Z_{max} = 150.0\text{ m}$.
- For any $1.0 < denominator \le \frac{1190.475}{150.0} \approx 7.9365\text{ px}$, $Z_y$ is clamped to $150.0\text{ m}$.
- In the existing code at line 17-19:
  ```typescript
  if (denominator <= 1.0) {
    return 120.0; // Distant horizon default (meters)
  }
  ```
- **The Discontinuity**: When $y_{max}$ crosses $denominator = 1.0$, the reported distance drops instantly from $150.0\text{ m}$ to $120.0\text{ m}$ (a $-30\text{m}$ step). Concurrently, $Z_w$ for distant vehicles saturates at $150.0\text{ m}$, inducing an artificial $30.0\text{m}$ sensor disagreement and spiking calculated uncertainty $U$ from $0.5\text{m}$ to $4.5\text{m}$.

#### Corrective Action:
Change the return value in the horizon clamp branch from `120.0` to `150.0`. This ensures monotonic continuity up to the sensor ceiling:
$$\lim_{denominator \to 1.0^+} Z_y(denominator) = 150.0\text{ m} = \lim_{denominator \to 1.0^-} Z_y(denominator)$$

---

### 2.2. Permanent Kalman NaN Poisoning (`adasMath.ts:68-75`)

#### Observation & Mathematical Proof:
The 1D Kalman / Exponential Moving Average recurrence relation is:
$$Z_{k} = K_{gain} \cdot Z_{raw, k} + (1 - K_{gain}) \cdot Z_{k-1}$$
In JavaScript IEEE-754 floating point arithmetic:
$$\text{NaN} \times c = \text{NaN}, \quad x + \text{NaN} = \text{NaN}$$
If an upstream perception frame delivers an occluded or invalid box yielding $Z_{raw} = \text{NaN}$:
1. Frame $k$: $Z_{k} = K_{gain} \cdot \text{NaN} + (1 - K_{gain}) \cdot Z_{k-1} = \text{NaN}$.
2. In `App.tsx:299`: `state.prevKalman = Z_kalman` sets `prevKalman` to `NaN`.
3. Frame $k+1$: Even if a pristine measurement $Z_{raw, k+1} = 30.0\text{ m}$ arrives:
   $$Z_{k+1} = K_{gain} \cdot 30.0 + (1 - K_{gain}) \cdot \text{NaN} = \text{NaN}$$
4. The filter is trapped in an absorbing NaN sink and can never recover.

#### Corrective Action:
Harden `applyKalman1D` with strict finite-number guards:
1. If $Z_{raw}$ is non-finite (`NaN` or `Infinity`), hold previous state $Z_{prev}$.
2. If $Z_{prev}$ is non-finite (e.g. uninitialized or cold start), initialize with $Z_{raw}$.
3. If both are non-finite, fallback to nominal cruising distance ($40.0\text{ m}$).
4. Clamp $K_{gain}$ cleanly to $[0.02, 1.0]$ with finite check.

---

### 2.3. Unnormalized Fusion Weights (`adasMath.ts:43-62`)

#### Observation & Mathematical Proof:
Convex sensor fusion assumes partition of unity:
$$\sum_{i} w_i = 1.0 \implies Z_{raw} = w_y Z_y + w_w Z_w$$
If $\sum w_i = 1.0$ and $Z_y = Z_w = Z^*$, then:
$$Z_{raw} = w_y Z^* + (1 - w_y) Z^* = Z^*$$
When `autoWeightByConf: false`, the existing code executes:
```typescript
let eff_wy = weights.w_y;
let eff_ww = weights.w_w;
...
const Z_raw = eff_wy * Z_y + eff_ww * Z_w;
```
If an operator or test inputs $w_y = 0.8, w_w = 0.8$ (sum = 1.6) and $Z_y = Z_w = 50.0\text{ m}$:
$$Z_{raw} = 0.8 \times 50.0 + 0.8 \times 50.0 = 80.0\text{ m} \quad (\text{error: } +30.0\text{ m, } 160\% \text{ scaling})$$

#### Corrective Action:
When `autoWeightByConf` is false, divide both weights by their sum $S = w_y + w_w$:
$$eff\_w_y = \frac{w_y}{w_y + w_w}, \quad eff\_w_w = \frac{w_w}{w_y + w_w}$$
With fallback to equal weighting ($0.5 / 0.5$) if $S \le 0$ or non-finite.

---

### 2.4. Negative Safe Following Distance (`adasMath.ts:156-159`)

#### Observation & Mathematical Proof:
The Vietnamese Highway Code 2-second safe following distance rule is:
$$d_{min} = v_{ego} (\text{m/s}) \times 2\text{ s}$$
In reverse gear, $v_{ego} < 0$ (e.g., $-18\text{ km/h} = -5\text{ m/s}$).
The existing function returns:
$$\text{round}(-5.0 \times 2) = -10\text{ m}$$
A negative safe following distance is physically nonsensical on an automotive HUD.

#### Corrective Action:
Clamp effective ego speed from below at $0\text{ km/h}$ via `Math.max(0, ...)`:
$$v_{safe} = \max(0, v_{ego})$$

---

## 3. Drop-in Implementation Code for Worker M2

Target file: `src/services/adasMath.ts`

### 3.1. Fix for `calculateGroundPinholeDistance` (Lines 7-23)

#### Before:
```typescript
export function calculateGroundPinholeDistance(
  y_max: number,
  calibration: CameraCalibration
): number {
  const { f_y, H_cam, c_y, pitch_deg } = calibration;
  const pitch_rad = (pitch_deg * Math.PI) / 180;
  const pitch_offset = f_y * Math.tan(pitch_rad);
  const denominator = (y_max - c_y) + pitch_offset;

  // Prevent division by zero or negative projection below horizon
  if (denominator <= 1.0) {
    return 120.0; // Distant horizon default (meters)
  }

  const Z_y = (f_y * H_cam) / denominator;
  return Math.min(150.0, Math.max(2.0, Z_y));
}
```

#### After:
```typescript
export function calculateGroundPinholeDistance(
  y_max: number,
  calibration: CameraCalibration
): number {
  const { f_y, H_cam, c_y, pitch_deg } = calibration;
  const pitch_rad = (pitch_deg * Math.PI) / 180;
  const pitch_offset = f_y * Math.tan(pitch_rad);
  const denominator = (y_max - c_y) + pitch_offset;

  // Prevent division by zero or negative projection at or above horizon
  if (denominator <= 1.0) {
    return 150.0; // Distant horizon maximum range (meters)
  }

  const Z_y = (f_y * H_cam) / denominator;
  return Math.min(150.0, Math.max(2.0, Z_y));
}
```

---

### 3.2. Fix for `fuseDistances` (Lines 43-62)

#### Before:
```typescript
export function fuseDistances(
  Z_y: number,
  Z_w: number,
  weights: FusionWeights,
  confidence: number
): { Z_raw: number; eff_wy: number; eff_ww: number } {
  let eff_wy = weights.w_y;
  let eff_ww = weights.w_w;

  if (weights.autoWeightByConf) {
    // When confidence is very high, ground contact is reliable
    // If confidence drops (e.g., occlusion/cut-in), shift weight towards vehicle width
    const confFactor = Math.max(0.2, Math.min(1.0, confidence));
    eff_wy = weights.w_y * confFactor;
    eff_ww = 1.0 - eff_wy;
  }

  const Z_raw = eff_wy * Z_y + eff_ww * Z_w;
  return { Z_raw, eff_wy, eff_ww };
}
```

#### After:
```typescript
export function fuseDistances(
  Z_y: number,
  Z_w: number,
  weights: FusionWeights,
  confidence: number
): { Z_raw: number; eff_wy: number; eff_ww: number } {
  let eff_wy = weights.w_y;
  let eff_ww = weights.w_w;

  if (weights.autoWeightByConf) {
    // When confidence is very high, ground contact is reliable
    // If confidence drops (e.g., occlusion/cut-in), shift weight towards vehicle width
    const confFactor = Math.max(0.2, Math.min(1.0, confidence));
    eff_wy = weights.w_y * confFactor;
    eff_ww = 1.0 - eff_wy;
  } else {
    // Normalize weights so eff_wy + eff_ww === 1.0 even if input weights do not sum to 1.0
    const sum = weights.w_y + weights.w_w;
    if (sum > 0 && Number.isFinite(sum)) {
      eff_wy = weights.w_y / sum;
      eff_ww = weights.w_w / sum;
    } else {
      eff_wy = 0.5;
      eff_ww = 0.5;
    }
  }

  const Z_raw = eff_wy * Z_y + eff_ww * Z_w;
  return { Z_raw, eff_wy, eff_ww };
}
```

---

### 3.3. Fix for `applyKalman1D` (Lines 68-75)

#### Before:
```typescript
export function applyKalman1D(
  Z_raw: number,
  Z_prev: number,
  K_gain: number
): number {
  const clamped_gain = Math.max(0.02, Math.min(1.0, K_gain));
  return clamped_gain * Z_raw + (1 - clamped_gain) * Z_prev;
}
```

#### After:
```typescript
export function applyKalman1D(
  Z_raw: number,
  Z_prev: number,
  K_gain: number
): number {
  const clamped_gain = Number.isFinite(K_gain)
    ? Math.max(0.02, Math.min(1.0, K_gain))
    : 0.25;

  const rawValid = Number.isFinite(Z_raw);
  const prevValid = Number.isFinite(Z_prev);

  // If both inputs are non-finite, fallback to safe nominal cruising distance (40.0m)
  if (!rawValid && !prevValid) {
    return 40.0;
  }

  // If raw measurement is corrupted, hold previous filtered distance
  if (!rawValid) {
    return Z_prev;
  }

  // If previous filter state is invalid/uninitialized, initialize with raw measurement
  if (!prevValid) {
    return Z_raw;
  }

  return clamped_gain * Z_raw + (1 - clamped_gain) * Z_prev;
}
```

---

### 3.4. Fix for `calculateMinSafeDistance` (Lines 156-159)

#### Before:
```typescript
export function calculateMinSafeDistance(egoSpeedKmh: number): number {
  const speedMs = egoSpeedKmh / 3.6;
  return Math.round(speedMs * 2.0);
}
```

#### After:
```typescript
export function calculateMinSafeDistance(egoSpeedKmh: number): number {
  const safeSpeedKmh = Number.isFinite(egoSpeedKmh) ? Math.max(0, egoSpeedKmh) : 0;
  const speedMs = safeSpeedKmh / 3.6;
  return Math.round(speedMs * 2.0);
}
```

---

## 4. Test Suite Alignment Specification

Target file: `src/services/__tests__/adasMathChallenge.test.ts`

When Challenger 1 authored `adasMathChallenge.test.ts`, tests were written to verify the *existence* of the anomalies (e.g. asserting `toBe(120.0)`, `toBe(80.0)`, `toBe(-10)`, and `expect(Number.isNaN(state)).toBe(true)`). Once Worker M2 implements the fixes, these 5 specific tests must be updated to assert the *corrected, resilient behavior*.

### 4.1. Horizon Tests (Lines 36-52 & 54-70)

#### Before:
```typescript
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
```

#### After:
```typescript
    it('empirical oracle: y_max exactly at theoretical horizon does not throw or return NaN/Infinity', () => {
      const zHorizon = calculateGroundPinholeDistance(theoreticalHorizonY, kittiCalibration);
      expect(Number.isFinite(zHorizon)).toBe(true);
      expect(zHorizon).toBeGreaterThanOrEqual(2.0);
      expect(zHorizon).toBeLessThanOrEqual(150.0);
      // Denominator is 0.0, so denominator <= 1.0 branch triggers -> returns 150.0m maximum range
      expect(zHorizon).toBe(150.0);
    });

    it('empirical oracle: y_max well above horizon (sky / negative coordinates) returns bounded fallback', () => {
      const skyValues = [-1000, -100, 0, 50, 100, 150, theoreticalHorizonY - 10];
      for (const y of skyValues) {
        const dist = calculateGroundPinholeDistance(y, kittiCalibration);
        expect(Number.isFinite(dist)).toBe(true);
        expect(dist).toBe(150.0);
      }
    });

    it('empirical oracle: continuous monotonic saturation at 150m without discontinuity at denominator = 1.0', () => {
      const yThreshold = theoreticalHorizonY + 1.0;

      const zBelow = calculateGroundPinholeDistance(yThreshold - 0.01, kittiCalibration);
      const zAbove = calculateGroundPinholeDistance(yThreshold + 0.01, kittiCalibration);

      // Both below and above threshold cleanly clamp to 150.0m without jump
      expect(zBelow).toBe(150.0);
      expect(zAbove).toBe(150.0);
      expect(zAbove - zBelow).toBe(0.0);
    });
```

---

### 4.2. Fusion Weight Normalization Test (Lines 246-253)

#### Before:
```typescript
    it('empirical challenge finding: unnormalized weights distort Z_raw when autoWeightByConf is false', () => {
      // If someone configures weights that do not sum to 1.0 (e.g. w_y = 0.8, w_w = 0.8)
      // Z_raw becomes 0.8*50 + 0.8*50 = 80m instead of 50m!
      const unnormalizedWeights: FusionWeights = { w_y: 0.8, w_w: 0.8, K_gain: 0.25, autoWeightByConf: false };
      const { Z_raw } = fuseDistances(50.0, 50.0, unnormalizedWeights, 0.9);
      expect(Z_raw).toBe(80.0); // Demonstrates unnormalized sum vulnerability
    });
```

#### After:
```typescript
    it('empirical oracle: unnormalized weights are automatically normalized when autoWeightByConf is false', () => {
      // If someone configures weights that do not sum to 1.0 (e.g. w_y = 0.8, w_w = 0.8)
      // eff_wy and eff_ww normalize to 0.5 and 0.5, ensuring Z_raw remains strictly 50m!
      const unnormalizedWeights: FusionWeights = { w_y: 0.8, w_w: 0.8, K_gain: 0.25, autoWeightByConf: false };
      const { Z_raw, eff_wy, eff_ww } = fuseDistances(50.0, 50.0, unnormalizedWeights, 0.9);
      expect(eff_wy).toBe(0.5);
      expect(eff_ww).toBe(0.5);
      expect(Z_raw).toBe(50.0);
    });
```

---

### 4.3. Safe Following Distance Negative Clamp Test (Lines 318-323)

#### Before:
```typescript
    it('empirical challenge finding: negative ego speed produces negative safe distance', () => {
      // In reverse (-18 km/h = -5 m/s):
      const dMin = calculateMinSafeDistance(-18);
      expect(dMin).toBe(-10); // Demonstrates lack of Math.max(0, ...) clamp
    });
```

#### After:
```typescript
    it('empirical oracle: negative ego speed is clamped to 0m safe distance', () => {
      // In reverse (-18 km/h = -5 m/s):
      const dMin = calculateMinSafeDistance(-18);
      expect(dMin).toBe(0); // Clamped with Math.max(0, ...)
    });
```

---

### 4.4. Kalman Filter NaN Resilience Test (Lines 365-377)

#### Before:
```typescript
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
```

#### After:
```typescript
    it('empirical oracle: Kalman filter resists NaN and recovers gracefully without permanent state corruption', () => {
      // Initial state is valid: 30m
      let state = 30.0;
      // Corrupt frame arrives: Z_raw = NaN
      state = applyKalman1D(NaN, state, 0.25);
      // Filter holds previous healthy state instead of poisoning state to NaN
      expect(state).toBe(30.0);

      // Next frame recovers: valid Z_raw = 30.0m arrives
      state = applyKalman1D(30.0, state, 0.25);
      expect(state).toBe(30.0);
      expect(Number.isFinite(state)).toBe(true);
    });
```

---

## 5. Verification Checklist for Worker M2

Worker M2 should perform the following steps:
1. Apply the 4 edits to `src/services/adasMath.ts`.
2. Apply the matching test updates to `src/services/__tests__/adasMathChallenge.test.ts`.
3. Run `npx vitest run src/services/__tests__/adasMathChallenge.test.ts` (All 36 tests must pass).
4. Run `npm test` (All 7 test suites, 81 tests must pass).
5. Run `npm run build` (`tsc -b && vite build` must pass cleanly with 0 TypeScript and 0 CSS errors).
