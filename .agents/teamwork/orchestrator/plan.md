# Orchestrator Plan: DriveDeck xADAS HUD

## Objective
Build, review, and verify the DriveDeck xADAS (Forward Collision Warning & Distance Estimation HUD) web application using React + TypeScript + Vite + Tailwind CSS + Lucide Icons according to all requirements in `ORIGINAL_REQUEST.md`.

## Workflow Phases

### Phase 0: Survey & Technical Baseline
- Dispatch 3 parallel Explorers:
  - Explorer 1 (Frontend & Build Stack): Examine `package.json`, Vite configuration, Tailwind CSS, Lucide Icons, existing components.
  - Explorer 2 (Math Engine & Audio Synthesis): Analyze Dual-Pinhole, Kalman filter formulas, TTC calculation, and Web Audio API synthesizer requirements.
  - Explorer 3 (Detection, HUD, and Director Controls): Analyze YouTube embed/MP4 pipeline, vehicle detection, HUD layout (Glassmorphism, SVG lane carpet, BEV radar, sparkline, telemetry box, hotkeys).
- Aggregate reports into `PROJECT.md` (Feature Inventory, Architecture, Code Layout, Interfaces).

### Phase 1: Dual-Track Setup
- Track A: E2E Testing Suite (4 tiers of comprehensive tests based on requirements).
- Track B: Implementation Milestones:
  - **Milestone 1 (M1)**: Core Math Engine (`math/dualPinhole.ts`, `math/kalman.ts`, `math/ttc.ts`) + Web Audio Synthesizer (`audio/warningSound.ts`).
  - **Milestone 2 (M2)**: Background Video Layer & AI Detection Pipeline (`components/video/`, `services/detection.ts`).
  - **Milestone 3 (M3)**: HUD Visual Layer (`components/hud/`: AlertBadge, DistanceReadout, DynamicLaneCarpet, TargetLock, BEVRadar, Sparkline).
  - **Milestone 4 (M4)**: Telemetry Inspector Box (`components/inspector/`) & Director Panel (`components/director/`) with 3 Operating Modes & 'H' shortcut.
  - **Milestone 5 (M5)**: Application Integration & E2E Verification (`App.tsx`, complete wiring, 100% tests passing, clean build).

### Phase 2: Milestone Iteration Loops
For each milestone:
1. Dispatch Explorer for targeted design and verification criteria.
2. Dispatch Worker for implementation with strict no-cheating policy.
3. Dispatch Reviewers (2) for code quality, design fidelity, and build checks.
4. Dispatch Challengers (2) for empirical edge-case testing.
5. Dispatch Auditor for integrity forensics.
6. Gate evaluation: Pass or Loop back with failure evidence.

### Phase 3: Final Acceptance & Victory Audit
- Run full build and test suite verification (`npm run build`).
- Verify manual and automated acceptance criteria.
- Trigger Victory Audit / send victory claim to Sentinel (`ccdd3409-0fad-42bd-ad49-1a7d89157563`).
