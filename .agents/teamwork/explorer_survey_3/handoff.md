# Handoff Report — Explorer Survey 3 (HUD & Vision Pipeline)

**Agent**: Explorer Survey 3 (`explorer_survey_3`)  
**Parent**: Orchestrator (`04a59318-25ee-4240-9fc7-a7b84ebe67c5`)  
**Scope**: HUD & Vision Pipeline (Requirements R1, R2, R4, R5)  
**Date**: 2026-10-16  

---

## 1. Observation

1. **Build Execution & Verbatim Compiler Errors**:
   - Running `npm run build` (`tsc -b && vite build`) produced 34 TypeScript errors with exit code 1.
   - Verbatim sample output:
     ```
     src/components/BackgroundVideo.tsx(2,10): error TS1484: 'VideoSource' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.
     src/components/BevMinimap.tsx(3,10): error TS1484: 'AdasTelemetry' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.
     src/components/DirectorControls.tsx(9,3): error TS2724: '"lucide-react"' has no exported member named 'FolderVideo'. Did you mean 'FileVideo'?
     src/components/DirectorControls.tsx(3,3): error TS6133: 'Car' is declared but its value is never read.
     src/components/TelemetryInspector.tsx(2,42): error TS6133: 'Eye' is declared but its value is never read.
     src/services/adasMath.ts(101,3): error TS6133: 'screenH' is declared but its value is never read.
     src/services/aiDetector.ts(14,11): error TS6133: 'modelLoadFailed' is declared but its value is never read.
     ```
   - `tsconfig.app.json` has `verbatimModuleSyntax: true`, `noUnusedLocals: true`, and `noUnusedParameters: true`.

2. **Existing Component Implementations**:
   - `src/components/BackgroundVideo.tsx` (109 lines): Implements YouTube IFrame embed with 3 preset URLs (`mU4PjQJ92Xo`, `e8dHQq_L_bY`, `_uOrkW4r2b8`), local MP4 `<video>` tag with `onVideoElementReady`, and danger pulse vignette.
   - `src/components/HudTelemetry.tsx` (127 lines): Implements glassmorphism card, Alert Badge with emerald/amber/red color thresholds, large distance readout with uncertainty `± 1.4 m`, and speed/2-second rule telemetry.
   - `src/components/LaneOverlay.tsx` (149 lines): Implements SVG 3D perspective trapezoid with glowing boundary lines, dynamic gradient, and grid pattern.
   - `src/components/TargetLockBox.tsx` (132 lines): Implements sci-fi corner brackets, reticle, undercarriage ground contact line at $y_2$, and floating target tag `Lead Car • [Z]m • TTC: [X.X]s`.
   - `src/components/BevMinimap.tsx` (229 lines): Implements 2D BEV radar with 10m/20m/40m rings, ego car, dynamic lead vehicle, and 15-second distance history sparkline.
   - `src/components/TelemetryInspector.tsx` (320 lines): Implements top-right collapsible glassmorphic panel with 4 sections updating at 60 FPS, with interactive sliders for $w_y, K_{gain}, H_{cam}$.
   - `src/components/DirectorControls.tsx` (419 lines): Implements bottom tray with 3 operating modes (Auto Sim, Scenarios, Manual), video picker, and collapsible lane horizon calibration tool.
   - `src/App.tsx` (123 lines): Contains the default Vite boilerplate counter and does NOT mount the HUD components.

3. **Coordinate System & Resolution Geometry**:
   - `src/types/adas.ts` line 20: `c_y: number; // Optical center Y in pixels (e.g. 185.0 / 360)`.
   - KITTI camera reference resolution is $1242 \times 375\text{ px}$. Optical center $c_y = 185\text{ px}$ corresponds to $49.3\%$ of height.
   - SVG lane carpet horizon default in `adas.ts` line 28 is `horizonY = 0.48` ($48\%$ of viewport height).
   - Direct pixel projection using nominal $c_y = 185\text{ px}$ without viewport scaling would place the lead vehicle in the top $19\%$ of a 1080p display, misaligned with the road carpet at $48\%$.

---

## 2. Logic Chain

1. **From Observation 1 (34 TypeScript Errors)**:
   - TypeScript compiler fails strictly due to syntax (`verbatimModuleSyntax` requiring `import type`), non-existent icon export `FolderVideo` from `lucide-react`, and unused variables.
   - Removing `FolderVideo`, converting imports to `import type { ... }`, and prefixing or removing unused variables will resolve all 34 errors without changing functional logic.

2. **From Observation 2 (Existing Component Suite vs Default `App.tsx`)**:
   - High-fidelity component implementations for R1, R2, R4, and R5 already exist in `src/components/`, matching all required styling, glassmorphism, and color specs.
   - Because `App.tsx` has not been wired, none of these components currently execute or interact.
   - Creating a centralized coordinator in `App.tsx` that manages state, a 60 FPS `requestAnimationFrame` loop, keyboard event listeners (`H`, Arrow keys), and the Web Audio synthesizer will immediately bring the entire DriveDeck xADAS HUD to life.

3. **From Observation 3 (Coordinate Mapping & Horizon Alignment)**:
   - To maintain both R4 compliance (displaying exact nominal values $f_y = 721.5\text{ px}, c_y = 185.0\text{ px}$) and R2 visual correctness (bounding box locking onto the road carpet at the horizon):
   - The projection engine must normalize reference frame coordinates ($1242 \times 375$) to the responsive viewport dimensions $(W_{screen}, H_{screen})$ using scale factor $S_y = H_{screen} / 375$ and $S_x = W_{screen} / 1242$.
   - This aligns the pinhole vanishing line ($c_y - f_y \tan(\theta)$) with the SVG lane carpet horizon ($H_{screen} \times \text{horizonY}$).

4. **From Observation 2 & R5 (Manual Control & Scenarios)**:
   - Manual mode requires keyboard listeners on `window` for Arrow Up/Down (distance) and Arrow Left/Right (lateral offset), with `e.preventDefault()` to avoid page scrolling.
   - Presets like "Phanh gấp (40m -> 8m)" require an animated interpolation curve over ~2.5 seconds to properly demonstrate the warning transition, audio beeps, and red vignette pulse.

---

## 3. Caveats

1. **YouTube IFrame Cross-Origin Security**:
   - Direct computer vision (reading pixels with canvas `drawImage`) cannot run on YouTube iframes due to browser CORS security. The smart vision fallback simulation is used when running YouTube feeds; real COCO-SSD object detection is active when running local MP4 video uploads.
2. **Web Audio User Gesture Requirement**:
   - Modern browsers block audio playback until user interaction. AudioContext resumes on the first click, keypress, or slider drag.
3. **No other caveats**.

---

## 4. Conclusion

The HUD and Vision Pipeline architecture for DriveDeck xADAS is fully surveyed, mapped, and mathematically defined:
1. All visual components (Video Layer, HUD Telemetry, Dynamic SVG Lane Carpet, Target Lock Reticle, BEV Radar, Sparkline, Telemetry Inspector, and Director Panel) have solid foundational code that needs type-safety cleanup and application wiring.
2. The 34 TypeScript errors are fully identified and have exact 1-to-1 solutions.
3. The coordinate system bridge between KITTI reference calibration ($f_y = 721.5, c_y = 185$) and responsive browser displays is formulated, ensuring pixel-perfect alignment.
4. The system is ready for Milestone 1-5 execution. Detailed survey findings and architectural specifications are recorded in `survey_report.md`.

---

## 5. Verification Method

To independently verify the survey observations and findings:

1. **Verify TypeScript Compilation Status**:
   ```powershell
   npm run build
   ```
   *Expected result currently*: 34 errors as documented in Section 1.
   *Verification after proposed type fixes*: Command must exit with code 0 (`tsc -b && vite build` passing).

2. **Verify Component Implementations**:
   - Inspect `src/components/BackgroundVideo.tsx` for preset links (`mU4PjQJ92Xo`, `e8dHQq_L_bY`, `_uOrkW4r2b8`).
   - Inspect `src/components/HudTelemetry.tsx` for alert colors (`#10B981`, `#F59E0B`, `#EF4444`).
   - Inspect `src/components/TelemetryInspector.tsx` for the 4 sections and live formula output.
   - Inspect `src/components/DirectorControls.tsx` for modes (Auto, Scenario, Manual) and 'H' hotkey.

3. **Verify Survey Artifacts**:
   - Inspect `d:/K4-Track4-ProjectCapstone/.agents/teamwork/explorer_survey_3/survey_report.md`.
   - Inspect `d:/K4-Track4-ProjectCapstone/.agents/teamwork/explorer_survey_3/handoff.md`.

4. **Invalidation Conditions**:
   - If `npm run build` succeeds right now without fixing type imports, this observation is invalidated.
   - If `FolderVideo` exists in `lucide-react` version `1.58.0`, the error observation is invalidated.
