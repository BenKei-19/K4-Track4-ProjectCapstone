# E2E Test Infra: DriveDeck xADAS HUD

## Test Philosophy
- Opaque-box, requirement-driven, deterministic testing derived from `ORIGINAL_REQUEST.md`.
- Testing architecture: Vitest + TypeScript running headless in Node/JSDOM.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Scenarios.

## Feature Inventory Mapping
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 |
|---|---------|--------|:------:|:------:|:------:|
| 1 | Ground Contact Pinhole (Z_y) | R3 §1 | 5 | 5 | ✓ |
| 2 | Vehicle Width Pinhole (Z_w) | R3 §2 | 5 | 5 | ✓ |
| 3 | Weighted Fusion (Z_raw) | R3 §3 | 5 | 5 | ✓ |
| 4 | 1D Kalman / EMA Filter (Z_kalman) | R3 §4 | 5 | 5 | ✓ |
| 5 | Time-To-Collision (TTC) | R3 §5 | 5 | 5 | ✓ |
| 6 | Alert Badge Thresholds (Safe/Warn/Danger) | R2 §1 | 5 | 5 | ✓ |
| 7 | Speed & 2-Second Rule | R2 §1 | 5 | 5 | ✓ |
| 8 | Audio Alert State & Synthesizer Logic | R1 §3 | 5 | 5 | ✓ |
| 9 | Target Lock & Inverse Projection | R2 §3 | 5 | 5 | ✓ |
| 10 | Telemetry Synchronization Contract | R4 §4 | 5 | 5 | ✓ |
| 11 | Director Modes & Keyboard Handlers | R5 §1 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Vitest (`npx vitest run`)
- Pass/Fail semantics: All tests pass with exit code 0.
- Test suites:
  - `src/__tests__/math_pinhole.test.ts` (Tiers 1 & 2: Pinhole formulas, extreme boundaries, horizon singularity guards)
  - `src/__tests__/math_fusion_kalman.test.ts` (Tiers 1 & 2: Fusion weights, confidence adaptation, Kalman gain convergence)
  - `src/__tests__/audio_synthesizer.test.ts` (Tiers 1 & 2: 3-tier acoustic states, frequencies, mute handling, auto-unlock)
  - `src/__tests__/hud_telemetry_sync.test.ts` (Tier 3: Pairwise synchronization between HUD readout, alert badge, Z_kalman, TTC, and 2s distance)
  - `src/__tests__/scenarios_workload.test.ts` (Tier 4: End-to-end driving scenarios: Cruising, Hard Braking, Cut-in, Tailgating)

## Coverage Thresholds
- Tier 1: ≥5 per feature
- Tier 2: ≥5 boundary & corner cases per feature (singularity at horizon, zero bounding box, negative dims, division-by-zero guards)
- Tier 3: Pairwise cross-feature interactions (e.g. distance drop triggers both alert badge, color transition, and audio state shift)
- Tier 4: Real-world driving scenarios matching R5 presets
