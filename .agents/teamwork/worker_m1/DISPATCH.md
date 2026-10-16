## 2026-10-16T08:16:52Z
You are the ADAS Core & HUD Engineer for DriveDeck xADAS.
Working directory: d:/K4-Track4-ProjectCapstone/.agents/teamwork/worker_m1/

MANDATORY: You MUST read the original requirements at:
d:/K4-Track4-ProjectCapstone/.agents/teamwork/ORIGINAL_REQUEST.md
Also read the project architecture at:
d:/K4-Track4-ProjectCapstone/.agents/teamwork/PROJECT.md
and the survey reports:
- d:/K4-Track4-ProjectCapstone/.agents/teamwork/explorer_survey_1/survey_report.md
- d:/K4-Track4-ProjectCapstone/.agents/teamwork/explorer_survey_2/survey_report.md
- d:/K4-Track4-ProjectCapstone/.agents/teamwork/explorer_survey_3/survey_report.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Scope & Task:
1. Environment & Test Tooling:
   - Install `vitest` and `@testing-library/react` and `jsdom` (e.g. `npm i -D vitest @testing-library/react jsdom`).
   - Add `"test": "vitest run"` to scripts in `package.json`.
2. TypeScript & Build Resolution:
   - Resolve all TS1484 (`verbatimModuleSyntax: true` requiring `import type`), TS6133 (unused locals/params), TS2724 (`FolderVideo` -> `FileVideo` in `lucide-react`), and Rolldown `[MISSING_EXPORT]` errors across:
     * `src/types/adas.ts`
     * `src/services/adasMath.ts`
     * `src/services/audioAlert.ts`
     * `src/services/aiDetector.ts`
     * `src/components/BackgroundVideo.tsx`
     * `src/components/HudTelemetry.tsx`
     * `src/components/LaneOverlay.tsx`
     * `src/components/TargetLockBox.tsx`
     * `src/components/BevMinimap.tsx`
     * `src/components/TelemetryInspector.tsx`
     * `src/components/DirectorControls.tsx`
     * `src/App.tsx`
3. Wire up `src/App.tsx`:
   - Replace the default Vite counter with the full DriveDeck xADAS HUD interface integrating all components.
   - Synchronize telemetry: ensure Left HUD distance is strictly identical to Right Inspector Box Z_kalman.
   - Connect the 60 FPS update loop, Web Audio synthesizer (with auto-unlock on user gesture and mute toggle), and keyboard shortcuts ('H' toggles Director Panel, Arrow keys for Manual control).
4. Run `npm run build` and confirm that it compiles with 0 errors and exits 0.
5. Document your implementation and build outputs in `d:/K4-Track4-ProjectCapstone/.agents/teamwork/worker_m1/handoff.md`.
6. Send a completion message back to the orchestrator.
