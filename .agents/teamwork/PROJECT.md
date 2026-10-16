# Project: DriveDeck xADAS (Forward Collision Warning & Distance Estimation HUD)

## Architecture
DriveDeck xADAS is a modern, high-precision web-based Advanced Driver Assistance System (ADAS) Head-Up Display (HUD) simulation built with React 19, TypeScript 6, Vite 8, and Tailwind CSS v4.

The architecture comprises 4 decoupled layers:
1. **Perception & Input Layer**:
   - `BackgroundVideo`: Dual-source video player supporting YouTube IFrames (with 3 curated presets) and HTML5 `<video>` for local MP4 files.
   - `aiDetector`: Hybrid detector running client-side COCO-SSD object detection on MP4 canvases with high-precision kinematic fallback simulation for YouTube streams.
2. **ADAS Mathematical Core**:
   - `adasMath`: Implements the 3-tier mathematical model:
     - Ground Contact Pinhole ($Z_y$) with camera pitch compensation.
     - Vehicle Width Pinhole ($Z_w$) with standard car width reference (1.82m).
     - Confidence-weighted sensor fusion ($Z_{raw} = w_y Z_y + w_w Z_w$).
     - 1D Kalman / Exponential Moving Average ($Z_{filtered}$).
     - Time-To-Collision ($TTC$) and 2-second safe braking distance rule.
     - Inverse pinhole projection for screen target reticle lock.
   - `audioAlert`: Pure Web Audio API tone synthesizer (no external audio files) generating 3-tier acoustic alerts (Safe silence, 850 Hz intermittent caution, 1900/2400 Hz continuous double-chime).
3. **DriveDeck xADAS Glassmorphic HUD Layer**:
   - `HudTelemetry`: Top-left telemetry HUD featuring 3-tier color-coded alert badge, large tabular distance readout with uncertainty margin ($\pm 1.4\text{ m}$), and speed / 2-second rule indicator.
   - `LaneOverlay`: 3D perspective dynamic SVG lane carpet with road horizon calibration and distance-coupled chromatic transitions.
   - `TargetLockBox`: Sci-fi target lock bounding box locked to the lead vehicle chassis with real-time HUD tag (`Lead Car • [Z]m • TTC: [X.X]s`).
   - `BevMinimap`: Top-down 2D Bird's-Eye View radar with 10m/20m/40m rings and a 15-second real-time distance history sparkline.
4. **Supervisory & Inspector Control Layer**:
   - `TelemetryInspector`: Top-right collapsible 4-zone glassmorphic panel detailing AI detections, camera calibration matrix ($f_y=721.5, c_y=185.0$), interactive weights sliders, and live formula pipeline outputs.
   - `DirectorControls`: Bottom dock controller supporting 3 operating modes (Auto Simulation, 4 Scenarios: Cruising, Hard Braking, Cut-in, Tailgating, and Manual Arrow Key Live Control) with 'H' hotkey toggle.
   - `App.tsx`: Central coordinator managing the 60 FPS animation loop, audio context lifecycle, keyboard dispatch, and synchronization.

---

## Code Layout
- `src/types/adas.ts` — Data contracts, camera calibration, bounding box, telemetry state, operating modes.
- `src/services/adasMath.ts` — Mathematical pinhole formulas, fusion, Kalman filtering, TTC calculation.
- `src/services/audioAlert.ts` — Web Audio API tone synthesizer and audio context manager.
- `src/services/aiDetector.ts` — Video canvas detector and kinematic fallback simulator.
- `src/components/BackgroundVideo.tsx` — Video background layer with YouTube & MP4 support and danger vignette.
- `src/components/HudTelemetry.tsx` — Glassmorphism primary telemetry HUD card.
- `src/components/LaneOverlay.tsx` — SVG 3D perspective dynamic lane carpet.
- `src/components/TargetLockBox.tsx` — Lead vehicle target lock reticle and floating tag.
- `src/components/BevMinimap.tsx` — 2D BEV radar and 15-second history sparkline.
- `src/components/TelemetryInspector.tsx` — 4-section inspector telemetry box with interactive sliders.
- `src/components/DirectorControls.tsx` — Mode switcher, scenario runner, video controls, hotkey 'H'.
- `src/App.tsx` — Main application root and 60 FPS update orchestrator.
- `src/__tests__/` — Vitest unit and integration test suite.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | YouTube Video Embed | Embed YouTube video by URL / Video ID, loop, default muted, hide controls | M2 | R1 |
| F02 | Local MP4 Upload | Local MP4 file upload and playback via HTML5 video | M2 | R1 |
| F03 | 3 YouTube Presets | Highway Day, Urban, Night/Rain dashcam presets | M2 | R1 |
| F04 | Pure Web Audio Synthesizer | Tone synthesizer using browser Web Audio API, no external assets | M1 | R1 |
| F05 | Intermittent Caution Beep | Gentle 850 Hz beep pulsing when distance is between 12m and 25m | M1 | R1 |
| F06 | Critical Danger Double-Beep | Rapid 1900/2400 Hz dual-frequency tone when distance < 12m | M1 | R1 |
| F07 | Red Vignette Pulse | Pulsing red vignette border visual effect when distance < 12m | M2 | R1 |
| F08 | Audio Mute Toggle | Master mute button with auto-unlock on user interaction | M1 | R1 |
| F09 | Glassmorphic Telemetry HUD | Top-left translucent glassmorphism container | M3 | R2 |
| F10 | 3-Tier Alert Badge | Safe (>25m #10B981), Caution (12-25m #F59E0B), Danger (<12m #EF4444) | M3 | R2 |
| F11 | Large Tabular Distance Readout | Text-6xl/7xl tabular-nums font with error margin `± 1.4 m`, smooth color shift | M3 | R2 |
| F12 | Speed & 2-Second Rule | Indicator showing ego velocity and required 2s braking distance | M3 | R2 |
| F13 | Dynamic SVG Lane Carpet | 3D perspective glowing trapezoid lane carpet with horizon/width tuning | M3 | R2 |
| F14 | Lead Vehicle Target Lock | Sci-fi bounding box reticle locked to chassis via inverse pinhole projection | M3 | R2 |
| F15 | Floating Target Tag | HUD tag `Lead Car • [Z]m • TTC: [X.X]s` tracking the target box | M3 | R2 |
| F16 | 2D BEV Radar | Bird's-Eye View radar with 10m, 20m, 40m distance rings | M3 | R2 |
| F17 | 15s Sparkline History | Real-time distance variation graph covering the past 15 seconds | M3 | R2 |
| F18 | Ground Contact Pinhole | Z_y = (f_y * H_cam) / ((y_max - c_y) + f_y * tan(pitch_rad)) | M1 | R3 |
| F19 | Vehicle Width Pinhole | Z_w = (f_x * W_car) / (x_max - x_min) with W_car = 1.82m | M1 | R3 |
| F20 | Weighted Pinhole Fusion | Z_raw = w_y * Z_y + w_w * Z_w with confidence adaptation | M1 | R3 |
| F21 | 1D Kalman / EMA Smoothing | Z_filtered = K_gain * Z_raw + (1 - K_gain) * Z_prev | M1 | R3 |
| F22 | Time-To-Collision (TTC) | TTC = Z_filtered / max(0.1, v_ego - v_lead) | M1 | R3 |
| F23 | Collapsible Inspector Panel | Top-right glassmorphic panel updating at 60 FPS | M4 | R4 |
| F24 | AI Detection Engine Zone | Model selector, confidence bar, bbox coords, ground contact, width | M4 | R4 |
| F25 | Calibration Matrix Zone | Exact parameters: f_y=721.5, c_y=185.0, H_cam=1.65m, pitch=0.5deg, W_car=1.82m | M4 | R4 |
| F26 | Interactive Weights Sliders | Real-time sliders for w_y, K_gain, f_y, H_cam directly updating HUD | M4 | R4 |
| F27 | Live Pipeline Formula Output | Real-time calculation steps: Z_y, Z_w, Z_raw, Z_kalman, TTC | M4 | R4 |
| F28 | Director Panel Dock | Bottom control tray with hotkey 'H' toggle | M4 | R5 |
| F29 | Mode 1: Auto Simulation | Smooth 60 FPS trajectory with realistic dynamic noise | M4 | R5 |
| F30 | Mode 2: Scenario Presets | 4 presets: Cruising (40m), Hard Braking (40m->8m), Cut-in (10m), Tailgating (15m) | M4 | R5 |
| F31 | Mode 3: Manual Live Control | Keyboard Arrow Up/Down for distance, Left/Right for lane offset | M4 | R5 |
| F32 | AI Vision & Fallback Sim | Canvas detection on MP4 video, smooth fallback simulation on YouTube | M2 | R5 |
| F33 | Clean Build Compilation | `npm run build` succeeds cleanly with 0 TypeScript and 0 CSS errors | M5 | Acceptance |
| F34 | HUD & Telemetry Synchronicity | Left HUD distance strictly equals right Telemetry Box Z_kalman | M5 | Acceptance |
| F35 | Automated Test Suite | Comprehensive tests covering math formulas, audio states, and UI flows | M5 | Acceptance |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Math Engine & Audio Synthesizer | `src/types/adas.ts`, `src/services/adasMath.ts`, `src/services/audioAlert.ts`, add Vitest and unit tests for math/audio (F04-F06, F08, F18-F22) | none | PLANNED |
| M2 | Video Layer & Vision Pipeline | `src/components/BackgroundVideo.tsx`, `src/services/aiDetector.ts` (F01-F03, F07, F32) | M1 | PLANNED |
| M3 | HUD Visual Layer & Lane Overlay | `src/components/HudTelemetry.tsx`, `src/components/LaneOverlay.tsx`, `src/components/TargetLockBox.tsx`, `src/components/BevMinimap.tsx` (F09-F17) | M1 | PLANNED |
| M4 | Telemetry Inspector & Director Panel | `src/components/TelemetryInspector.tsx`, `src/components/DirectorControls.tsx` (F23-F31) | M1, M2, M3 | PLANNED |
| M5 | Full Integration & E2E Verification | `src/App.tsx`, build verification (`npm run build`), dual-track E2E test pass (F33-F35) | M1, M2, M3, M4 | PLANNED |

---

## Interface Contracts

### adasMath ↔ Components
```typescript
export interface CameraCalibration {
  f_y: number; // 721.5 px
  f_x: number; // 721.5 px
  c_y: number; // 185.0 px
  c_x: number; // 621.0 px
  H_cam: number; // 1.65 m
  pitch_deg: number; // 0.5 deg
  W_car: number; // 1.82 m
}

export interface FusionWeights {
  w_y: number; // default 0.65
  w_w: number; // default 0.35
  k_gain: number; // default 0.25
}

export interface AdasTelemetry {
  z_y: number;
  z_w: number;
  z_raw: number;
  z_kalman: number;
  ttc: number;
  v_ego: number;
  v_lead: number;
  min_safe_dist: number;
  alert_level: AlertLevel; // 'safe' | 'warning' | 'danger'
  confidence: number;
  uncertainty: number;
  bbox: BoundingBox;
}
```

### audioAlert ↔ App
```typescript
export class AudioAlertSynthesizer {
  setAlertLevel(level: AlertLevel): void;
  setMuted(muted: boolean): void;
  unlockAudio(): Promise<boolean>;
  destroy(): void;
}
```
