# Challenger 1 (ADAS Math & Boundary Challenger) — Handoff Report

## 1. Observation

### Test Execution & Build Verification
1. **Existing Test Suite**: Executed `npm test`. Result:
   ```text
   Test Files  5 passed (5)
   Tests       30 passed (30)
   ```
2. **Challenge Oracle Suite**: Created `src/services/__tests__/adasMathChallenge.test.ts` (36 empirical test cases) and executed `npx vitest run src/services/__tests__/adasMathChallenge.test.ts`. Result:
   ```text
   Test Files  1 passed (1)
   Tests       36 passed (36)
   ```
3. **Full Suite Integration**: Ran full `npm test`. Result:
   ```text
   Test Files  7 passed (7)
   Tests       81 passed (81)
   ```
4. **Clean Build**: Executed `npm run build`. Result:
   ```text
   ✓ built in 278ms with 0 TypeScript and 0 CSS errors.
   ```

### Code Inspections & Empirical Anomalies
1. **Horizon Singularity Discontinuity**:
   - Location: `src/services/adasMath.ts:14-23`
   ```typescript
   const denominator = (y_max - c_y) + pitch_offset;

   // Prevent division by zero or negative projection below horizon
   if (denominator <= 1.0) {
     return 120.0; // Distant horizon default (meters)
   }

   const Z_y = (f_y * H_cam) / denominator;
   return Math.min(150.0, Math.max(2.0, Z_y));
   ```
   - Direct Observation:
     - For $y_{max}$ yielding $denominator = 1.001$: $Z_y = (721.5 \times 1.65) / 1.001 = 1189.28m$, which is clamped to `150.0m`.
     - For $y_{max}$ yielding $denominator = 0.999$: $denominator \le 1.0$ is triggered, returning `120.0m`.
     - There is an abrupt $30.0m$ backward discontinuity ($150m \to 120m$) at the horizon boundary, and a persistent $30m$ discrepancy with $Z_w$ (which returns $150m$).

2. **Permanent Kalman NaN Poisoning**:
   - Location: `src/services/adasMath.ts:68-75` and `src/App.tsx:298-299`
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
   - Direct Observation:
     - When `Z_raw = NaN`, `applyKalman1D(NaN, 30.0, 0.25)` returns `NaN`.
     - In `App.tsx:299`, `state.prevKalman` is set to `NaN`.
     - On the next frame, even when a clean measurement `Z_raw = 30.0` is provided, `applyKalman1D(30.0, NaN, 0.25)` evaluates to `NaN`.
     - The Kalman filter state is permanently poisoned and unrecoverable without page refresh.

3. **Unnormalized Fusion Weights in Pure Service**:
   - Location: `src/services/adasMath.ts:43-62`
   ```typescript
   export function fuseDistances(
     Z_y: number,
     Z_w: number,
     weights: FusionWeights,
     confidence: number
   ): { Z_raw: number; eff_wy: number; eff_ww: number } {
     let eff_wy = weights.w_y;
     let eff_ww = weights.w_w;
     ...
     const Z_raw = eff_wy * Z_y + eff_ww * Z_w;
     return { Z_raw, eff_wy, eff_ww };
   }
   ```
   - Direct Observation:
     - When `autoWeightByConf: false` and weights do not sum to 1.0 (e.g. $w_y = 0.8, w_w = 0.8$), `Z_raw = 0.8 \times 50 + 0.8 \times 50 = 80m` (scaled by $1.6\times$). While the UI slider pairs $w_w = 1 - w_y$, the math service function itself does not normalize weights when $w_y + w_w \ne 1.0$.

4. **Negative Safe Following Distance in Reverse**:
   - Location: `src/services/adasMath.ts:156-159`
   ```typescript
   export function calculateMinSafeDistance(egoSpeedKmh: number): number {
     const speedMs = egoSpeedKmh / 3.6;
     return Math.round(speedMs * 2.0);
   }
   ```
   - Direct Observation:
     - For $egoSpeedKmh = -18\text{ km/h}$, `speedMs = -5\text{ m/s}`, returning `-10m`.

---

## 2. Logic Chain

1. **Step 1 (Ground Pinhole Continuity)**:
   - In projective geometry, as a ground contact point approaches the horizon line from below ($y_{max} \to y_{horizon}^+$), $Z_y \to +\infty$.
   - The sensor ceiling is explicitly clamped to $150.0m$ via `Math.min(150.0, ...)`.
   - However, when $denominator \le 1.0$, the function returns `120.0m`.
   - Therefore, a target moving away will read $148m \to 150m$, and then instantaneously jump to $120m$ as it crosses $denominator = 1.0$. This violates monotonicity and creates a phantom $30m$ sensor divergence against $Z_w$ (which saturates at $150m$).
   - Fixing the fallback to `150.0m` (or clamping the denominator from below to $(f_y H_{cam}) / 150$) ensures continuous, monotonic projection.

2. **Step 2 (Kalman Filter Robustness)**:
   - Real-world AI computer vision pipelines frequently experience dropped frames, occluded bounding boxes, or NaN values.
   - `applyKalman1D` directly performs arithmetic with `Z_raw` and `Z_prev`. Since `NaN * x = NaN` and `x + NaN = NaN`, any NaN input produces NaN.
   - Because `state.prevKalman` stores the output for the next step, a single NaN corrupts all future iterations indefinitely.
   - Adding a fallback guard:
     ```typescript
     if (Number.isNaN(Z_raw) || !Number.isFinite(Z_raw)) return Z_prev;
     if (Number.isNaN(Z_prev) || !Number.isFinite(Z_prev)) return Z_raw;
     ```
     renders the filter resilient against transient sensor drops.

3. **Step 3 (Fusion Weight Invariance)**:
   - Convex sensor fusion assumes $\sum w_i = 1.0$.
   - While `autoWeightByConf: true` computes $eff\_ww = 1.0 - eff\_wy$, `autoWeightByConf: false` blindly takes raw slider or parameter values.
   - Normalizing by `const sum = eff_wy + eff_ww; if (sum > 0) { eff_wy /= sum; eff_ww /= sum; }` guarantees mathematical closure.

4. **Step 4 (Kinematic Bounds)**:
   - Minimum safe braking distance is non-negative: $d_{min} \ge 0$.
   - Adding `Math.max(0, Math.round(speedMs * 2.0))` prevents negative distance displays.

---

## 3. Caveats

- **Pixel Quantization**: At long distances ($Z \ge 80m$), integer pixel rasterization of bounding box coordinates produces up to $\approx 2.8m$ difference between forward and inverse projection. This is an unavoidable consequence of perspective compression on discrete display resolutions ($dZ/dy \approx Z^2 / (f_y H) \approx 5.38m/\text{pixel}$ at $80m$) rather than a bug in the projection formula.
- **COCO-SSD Browser Model**: In automated testing environments (JSDOM / headless Vitest), browser WebGL and dynamic external script injection are mocked or bypass to fallback simulation mode. Fallback simulation was verified to generate mathematically identical bounding boxes.

---

## 4. Conclusion & Verdict

**Verdict: REQUEST_CHANGES**

### Summary of Verdict:
The core ADAS mathematical models (Ground contact pinhole, Width pinhole, 1D Kalman smoothing, TTC relative speed, and inverse pinhole projection) are correctly formulated and verified by 81 automated tests and clean TypeScript compilation. However, 4 actionable mathematical anomalies/edge cases must be addressed by the implementation team to ensure automotive-grade robustness:

1. **Fix Horizon Discontinuity**: In `src/services/adasMath.ts:17-19`, change the return value from `120.0` to `150.0` so that distance saturates smoothly at the $150m$ maximum range rather than jumping backward by $30m$.
2. **Harden Kalman Filter against NaN**: In `src/services/adasMath.ts:applyKalman1D`, guard against non-finite values so that temporary detector dropouts do not permanently lock `prevKalman` into `NaN`.
3. **Normalize Fusion Weights**: In `src/services/adasMath.ts:fuseDistances`, normalize `eff_wy` and `eff_ww` when `autoWeightByConf` is false so that unnormalized weights do not artificially distort $Z_{raw}$.
4. **Non-negative Min Safe Distance**: In `src/services/adasMath.ts:calculateMinSafeDistance`, clamp result with `Math.max(0, ...)`.

---

## 5. Verification Method

1. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   All 81 tests in 7 suites must pass cleanly.
2. **Run Dedicated Challenger Suite**:
   ```bash
   npx vitest run src/services/__tests__/adasMathChallenge.test.ts
   ```
   Inspect all 36 empirical oracles covering horizon singularities, zero/negative box widths, Kalman gains, and closed-loop inverse projections.
3. **Verify Build**:
   ```bash
   npm run build
   ```
   Verifies zero TypeScript and CSS errors.
4. **Invalidation Conditions**:
   - Any test failure in `npm test`.
   - If $denominator \le 1.0$ continues to return $120.0m$ instead of $150.0m$.
   - If passing `NaN` to `applyKalman1D` causes consecutive outputs to remain `NaN`.
