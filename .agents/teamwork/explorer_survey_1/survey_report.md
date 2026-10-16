# Frontend Stack & Codebase Survey Report: DriveDeck xADAS HUD

**Date**: 2026-10-16  
**Investigator**: Explorer 1 (Frontend & Build Stack Explorer)  
**Target Repository**: `d:/K4-Track4-ProjectCapstone`  
**Reference Document**: `ORIGINAL_REQUEST.md`

---

## 1. Executive Summary

A comprehensive investigation of the project repository at `d:/K4-Track4-ProjectCapstone` was conducted. The project aims to implement **DriveDeck xADAS (Forward Collision Warning & Distance Estimation HUD)** with real-time AI vehicle detection, Dual-Pinhole fusion, Kalman filtering, and Web Audio API alerts.

### Key Discoveries:
1. **Core Scaffolding Exists**: The components and services required by R1–R5 have been written in `src/`, including `App.tsx` which integrates all HUD layers, background video, lane carpet, target lock box, BEV minimap, telemetry inspector, and director controls.
2. **Fatal Build Blockers (`npm run build` exits with code 1)**:
   - **TS1484 & Rolldown `[MISSING_EXPORT]`**: `tsconfig.app.json` has `"verbatimModuleSyntax": true`, and Vite 8 uses the Rolldown bundler engine. Rolldown strips TypeScript type declarations from `src/types/adas.ts`. When components import types as values (`import { AdasTelemetry } from './types/adas'`), Rolldown crashes with `[MISSING_EXPORT]` and `tsc` crashes with `TS1484`. Every file importing types MUST use `import type`.
   - **TS6133**: Unused variables/parameters (`screenH`, `modelLoadFailed`, `startTime`, `Eye`) trigger fatal errors due to `"noUnusedLocals": true` and `"noUnusedParameters": true`.
3. **Tailwind CSS v4 Integration**: The project uses **Tailwind CSS v4.3.3** via `@tailwindcss/vite` in `vite.config.ts` and `@import "tailwindcss";` in `src/index.css`. No legacy `tailwind.config.js` or `postcss.config.js` is needed or present.
4. **Testing Infrastructure Gap**: Currently **no test framework or test files exist** in the repository (0 test files, no `vitest` or `@testing-library/react` in `package.json`).

---

## 2. Stack & Configuration Audit

### 2.1 Dependencies & Scripts (`package.json`)
```json
{
  "name": "temp-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "lucide-react": "^1.58.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "tailwindcss": "^4.3.3"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "oxlint": "^1.81.0",
    "typescript": "~6.0.2",
    "vite": "^8.3.0"
  }
}
```
- **React**: `^19.2.8` (React 19).
- **Icons**: `lucide-react` `^1.58.0` is installed and provides all necessary HUD icons (`AlertCircle`, `CheckCircle2`, `ShieldAlert`, `Crosshair`, `Radio`, `Activity`, `Cpu`, `Sliders`, etc.).
- **Node & NPM**: Host environment runs Node v24.18.0 and npm 11.16.0.
- **Oxlint**: `^1.81.0` configured via `.oxlintrc.json`.

### 2.2 Vite & Bundler Configuration (`vite.config.ts`)
```typescript
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
})
```
- Uses modern Vite 8 with Rolldown bundling backend.
- Tailwind v4 is integrated as a native Vite plugin.

### 2.3 TypeScript Configuration (`tsconfig.app.json`)
The application is governed by strict modern compiler settings:
- `"target": "es2023"`, `"module": "esnext"`, `"moduleResolution": "bundler"`
- `"verbatimModuleSyntax": true`: Enforces that non-value types MUST be imported with `import type`. Failure to do so throws `error TS1484` and breaks Rolldown bundle resolution.
- `"erasableSyntaxOnly": true`: Disallows non-standard TypeScript-only syntax constructs (such as TypeScript `enum` or parameter properties). All types are defined as standard union types (`type AlertLevel = 'safe' | 'warning' | 'danger'`), which adheres strictly to this requirement.
- `"noUnusedLocals": true`, `"noUnusedParameters": true`: Any unused variable, parameter, or import causes build failure `TS6133`.

### 2.4 Styling & CSS Architecture (`src/index.css`)
- `@import "tailwindcss";` loads Tailwind v4.
- Custom animations defined:
  - `@keyframes dangerPulse` / `.danger-vignette`: Red pulse border and inner shadow for distance < 12m.
  - `@keyframes radarSweep`: Rotating scanning beam for BEV radar.
- Glassmorphism utility classes: `.glass-panel` and `.glass-panel-subtle` with backdrop blur and border alpha.
- Corner bracket styles: `.corner-bracket-tl`, `.corner-bracket-tr`, `.corner-bracket-bl`, `.corner-bracket-br`.

---

## 3. Existing Codebase & Component Inventory

| File Path | Role / Module | Requirements Mapped | Current Status & Findings |
|---|---|---|---|
| `src/main.tsx` | Entry point | Core | Mounts `<App />` with `StrictMode`. Ready. |
| `src/App.tsx` | Main Application Coordinator | R1, R2, R3, R4, R5 | Fully wired with 60FPS animation loop, keyboard shortcuts (`H`, arrows), telemetry state, and all 7 HUD layers. Contains type-import issues to fix. |
| `src/types/adas.ts` | Data Models & Interfaces | R1–R5 | Contains all types (`AlertLevel`, `VideoSource`, `CameraCalibration`, `LaneCalibration`, `FusionWeights`, `BoundingBox`, `AdasTelemetry`, `SparklinePoint`). Clean and complete. |
| `src/services/adasMath.ts` | Mathematical Engine | R3 | Implements Ground Contact Pinhole ($Z_y$), Vehicle Width Pinhole ($Z_w$), Weighted Fusion ($Z_{raw}$), 1D Kalman ($Z_{kalman}$), Uncertainty ($\pm m$), Inverse Pinhole Projection, TTC, 2-sec safe distance, and alert color maps. Has 1 unused parameter (`screenH`) and type import issues. |
| `src/services/aiDetector.ts` | Vision & Detection Service | R4, R5 | Wraps dynamic CDN loader for TensorFlow.js COCO-SSD with bounding-box scaling and provides high-speed realistic simulation fallback for YouTube and YOLOv8n-KITTI. Has 3 unused vars (`modelLoadFailed`, `screenH`, `startTime`) and type import issues. |
| `src/services/audioAlert.ts` | Web Audio API Synthesizer | R1 | Pure Web Audio synthesizer without external files. 850Hz intermittent chime for warning, dual 1900Hz/2400Hz urgent chime for danger. Has type import issues. |
| `src/components/BackgroundVideo.tsx` | Background Video Feed | R1 | YouTube iframe with loop/mute/no-controls + MP4 file upload support. Includes 3 presets. Exports `PRESET_VIDEOS` in component file (violates React Fast Refresh). Has type import issues. |
| `src/components/HudTelemetry.tsx` | Top-Left Glassmorphism HUD | R2 | Alert Badge (Safe/Green, Warning/Amber, Danger/Red), large tabular distance font (`text-6xl/7xl`), uncertainty readout, speed & 2-sec min distance, mute button. Has type import issues. |
| `src/components/LaneOverlay.tsx` | Dynamic SVG Lane Carpet | R2 | 3D perspective trapezoid with glowing gradient, boundary lines with Gaussian blur glow, horizon line, dashed center line. Has type import issues. |
| `src/components/TargetLockBox.tsx` | Bounding Box Lock | R2 | Sci-fi corner brackets, tire ground-contact marker, floating target tag with distance and TTC, confidence badge. Has type import issues. |
| `src/components/BevMinimap.tsx` | Radar & Sparkline | R2 | 2D Bird's-Eye View radar with 10m/20m/40m range circles, sweeping scanline, and 15s history distance sparkline. Has type import issues. |
| `src/components/TelemetryInspector.tsx` | Top-Right Inspector Box | R4 | 4 collapsible tabs: AI Detection Engine, Camera Intrinsics/Extrinsics, Fusion & Filter Weights (real-time sliders for $w_y$ and $K_{gain}$), Live Pipeline Formula Output. Has unused import `Eye` and type import issues. |
| `src/components/DirectorControls.tsx` | Bottom Director Dock | R5 | Collapsible via `H`, preset selection, custom YouTube input, MP4 upload, 3 modes (Auto Sim, 4 Scenario Presets, Manual Live with arrows), lane horizon calibration controls. Has unused imports (`Car`, `Play`, etc.) and type import issues. |

---

## 4. Root Cause Analysis: Current Build & Lint Diagnostics

### 4.1 TypeScript Compiler Errors (`tsc -b`)
Running `npm run build` currently produces 24 fatal errors:

1. **`error TS1484: '...' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled`**:
   - `src/components/BackgroundVideo.tsx:2`: `VideoSource`
   - `src/components/BevMinimap.tsx:3`: `AdasTelemetry`, `SparklinePoint`
   - `src/components/HudTelemetry.tsx:3`: `AdasTelemetry`
   - `src/components/LaneOverlay.tsx:2`: `AlertLevel`, `LaneCalibration`
   - `src/components/TargetLockBox.tsx:3`: `AdasTelemetry`
   - `src/components/TelemetryInspector.tsx:4-7`: `AdasTelemetry`, `CameraCalibration`, `DetectionModelType`, `FusionWeights`
   - `src/components/DirectorControls.tsx:21-24`: `LaneCalibration`, `OperatingMode`, `ScenarioType`, `VideoSource`
   - `src/App.tsx:2-12`: `AdasTelemetry`, `CameraCalibration`, `DetectionModelType`, `FusionWeights`, `LaneCalibration`, `OperatingMode`, `ScenarioType`, `SparklinePoint`, `VideoSource`
   - `src/services/adasMath.ts:1`: `AlertLevel`, `BoundingBox`, `CameraCalibration`, `FusionWeights`
   - `src/services/aiDetector.ts:1`: `BoundingBox`, `CameraCalibration`, `DetectionModelType`
   - `src/services/audioAlert.ts:1`: `AlertLevel`

2. **Rolldown Bundler `[MISSING_EXPORT]`**:
   - Because `src/types/adas.ts` contains only TypeScript `type` and `interface` declarations, when imported without `type`, Rolldown attempts to resolve them as runtime JavaScript variables, fails, and aborts bundling.
   - **Resolution**: Convert all type imports to `import type { ... }` or inline `type ...`.

3. **`error TS6133: '...' is declared but its value is never read`**:
   - `src/components/TelemetryInspector.tsx:2`: `'Eye'`
   - `src/services/adasMath.ts:101`: `'screenH'` in `projectDistanceToBBox`
   - `src/services/aiDetector.ts:14`: `'modelLoadFailed'`
   - `src/services/aiDetector.ts:146`: `'screenH'` in `simulateDetection`
   - `src/services/aiDetector.ts:148`: `'startTime'` in `simulateDetection`

### 4.2 Oxlint Linting Diagnostics (`oxlint`)
Running `npm run lint` identifies 14 warnings:
- `react(only-export-components)` in `BackgroundVideo.tsx`: `PRESET_VIDEOS` exported together with component. Move `PRESET_VIDEOS` to `src/constants/presets.ts`.
- `react(set-state-in-effect)` in `BackgroundVideo.tsx`: Avoid calling `setLoadError(false)` synchronously inside `useEffect`.
- `eslint(no-unused-vars)` in `DirectorControls.tsx`: Unused imports `Car`, `ChevronUp`, `EyeOff`, `FolderVideo`, `Play`, `RotateCcw`, `Sparkles`.
- `react(immutability)` & `react-hooks(exhaustive-deps)` in `App.tsx`: `handleKeyDown` calls `handleToggleMute` before definition; memoization and dependency array order can be restructured cleanly.

---

## 5. Testing & Verification Infrastructure

### 5.1 Current Status
- **Test Runner**: None installed.
- **Unit Tests**: None present.
- **E2E Tests**: None present.

### 5.2 Required Tooling for Phase 1 Track A
To establish automated test verification:
1. Install **Vitest**:
   ```bash
   npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
   ```
2. Add test script to `package.json`:
   ```json
   "scripts": {
     "test": "vitest run",
     "test:watch": "vitest"
   }
   ```
3. Test Suite Matrix needed:
   - **Math Engine Tests** (`tests/adasMath.test.ts`):
     - Pinhole Ground Distance ($Z_y$) against known ground contact coordinates.
     - Pinhole Width Distance ($Z_w$) with vehicle width $1.82m$.
     - Fusion function weights ($w_y + w_w = 1.0$) and adaptive confidence shifting.
     - 1D Kalman Filter noise smoothing and step response across varying $K_{gain}$.
     - TTC calculation for positive closing speed and safety clamp for zero/negative delta.
     - 2-second safe distance calculation rule.
     - 3-tier alert thresholds ($>25m \to \text{safe}$, $12-25m \to \text{warning}$, $<12m \to \text{danger}$).
   - **Audio Synthesizer Tests** (`tests/audioAlert.test.ts`):
     - Web Audio context instantiation and frequency selection per alert level.
   - **HUD Component Tests** (`tests/HudTelemetry.test.tsx`, `tests/TargetLockBox.test.tsx`):
     - Proper rendering of numerical readouts, glassmorphism badge colors, and hotkey listeners.

---

## 6. Implementation & Remediation Roadmap

1. **Fix Type Imports & Rolldown compatibility**:
   - Change all interface/type imports across `src/App.tsx`, `src/components/*.tsx`, and `src/services/*.ts` to use `import type { ... }`.
2. **Clean up unused variables & imports**:
   - Prefix unused function parameters with `_` or remove them to clear `TS6133`.
   - Remove unused Lucide icon imports (`Eye`, `Car`, `ChevronUp`, `EyeOff`, `FolderVideo`, `Play`, `RotateCcw`, `Sparkles`).
3. **Extract Constants**:
   - Move `PRESET_VIDEOS` into a dedicated `src/constants/presets.ts` file to satisfy Fast Refresh.
4. **HTML & Metadata Polish**:
   - Update `index.html` title from `"temp-app"` to `"DriveDeck xADAS — Forward Collision Warning & Distance HUD"`.
   - Update `package.json` name from `"temp-app"` to `"drivedeck-xadas"`.
5. **Install Vitest & Author Unit Test Suites**:
   - Integrate Vitest into Vite configuration.
   - Write comprehensive unit tests for mathematical formulas and alert logic.
6. **Verify Clean Build**:
   - Verify `npm run build` succeeds with zero errors and clean output in `dist/`.
