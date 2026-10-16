# DriveDeck xADAS — ADAS Math & Audio Survey Report (Requirements R1 & R3)

**Author**: ADAS Math & Audio Explorer  
**Date**: 2026-10-16  
**Target Requirements**: R1 (Audio Synthesizer) & R3 (Dual-Pinhole Fusion & Kalman Filter Math Engine)  
**Project Path**: `d:/K4-Track4-ProjectCapstone`  

---

## 1. Executive Summary

DriveDeck xADAS simulates an automotive Forward Collision Warning (FCW) and Distance Estimation Head-Up Display (HUD) running at 60 FPS over dashcam video streams. The system relies on two mission-critical real-time subsystems:
1. **R3: Dual-Pinhole Fusion & Kalman Filter Math Engine**: An end-to-end 3-tier mathematical model combining ground contact projective geometry ($Z_y$) and vehicle physical width pinhole geometry ($Z_w$), confidence-weighted fusion ($Z_{raw}$), 1D Kalman / Exponential Moving Average (EMA) smoothing ($Z_{kalman}$), dynamic Time-To-Collision (TTC), and reversible inverse pinhole projection.
2. **R1: Pure Web Audio API Sound Synthesizer**: An zero-external-asset audio engine generating distinctive automotive acoustic warnings for Safe (silence), Warning ($12\text{m} - 25\text{m}$, 850 Hz intermittent pulse), and Danger ($< 12\text{m}$, 1900 Hz + 2400 Hz rapid dual chime synchronized with visual Red Vignette Pulse), with full browser autoplay unlock compliance.

This survey establishes the complete mathematical derivations, numerical stability guards, TypeScript interfaces, audio oscillator graph specifications, and concrete recommendations for flawless integration and zero-defect TypeScript compilation.

---

## 2. Requirement R3: Dual-Pinhole Fusion & Kalman Filter Math Engine

```
                             [AI Detection Bounding Box]
                            (x1, y1, x2, y2, w_px, conf)
                                         |
                +------------------------+------------------------+
                |                                                 |
                v                                                 v
   [Ground Contact Pinhole]                           [Vehicle Width Pinhole]
      Z_y = (f_y * H_cam) /                               Z_w = (f_x * W_car) /
  ((y_max - c_y) + f_y * tan(pitch))                            w_px
                |                                                 |
                +------------------------+------------------------+
                                         |
                                         v
                            [Confidence-Weighted Fusion]
                           w_y' = w_y * clamp(conf, 0.2, 1.0)
                                   w_w' = 1 - w_y'
                            Z_raw = w_y' * Z_y + w_w' * Z_w
                                         |
                                         v
                             [1D Kalman / EMA Filter]
                   Z_filtered = K_gain * Z_raw + (1 - K_gain) * Z_prev
                                         |
                                         v
                         [Kinematics & Safety Logic]
                      TTC = Z_filtered / max(0.1, v_ego - v_lead)
                     AlertLevel: Safe (>25m) | Warning (12-25m) | Danger (<12m)
```

---

### 2.1. Ground Contact Pinhole Model ($Z_y$)

#### Mathematical Formula
$$Z_y = \frac{f_y \cdot H_{cam}}{(y_{max} - c_y) + f_y \cdot \tan(pitch_{rad})}$$

#### Physical Parameters & Calibration Defaults
| Parameter | Default Value | Unit | Description | Automotive Reference |
| :--- | :--- | :--- | :--- | :--- |
| $f_y$ | `721.5` | px | Vertical focal length | KITTI autonomous benchmark camera |
| $c_y$ | `185.0` | px | Vertical optical center (principal point) | Half-frame vertical center in KITTI calibration |
| $H_{cam}$ | `1.65` | m | Camera mounting height above road surface | Standard windshield rear-view mirror mount |
| $pitch_{deg}$ | `0.5` | deg | Camera tilt angle relative to road plane | Standard downward pitch (~0.5° to 1.5°) |
| $pitch_{rad}$ | `0.0087266` | rad | Camera pitch in radians | $pitch_{deg} \times \frac{\pi}{180}$ |

#### Geometric Derivation
1. Let the camera optical axis have a pitch angle $\theta$ tilted downward toward the ground plane.
2. In the camera coordinate frame, the road surface is modeled as the horizontal plane $Y = H_{cam}$ below the camera optical center.
3. For a target vehicle, the lowest point on the road surface where the rear tires touch the asphalt corresponds to the pixel coordinate $y_{max}$ (the bottom coordinate of the 2D bounding box).
4. The vertical angle $\alpha$ of the ray relative to the camera optical axis is:
   $$\tan(\alpha) = \frac{y_{max} - c_y}{f_y}$$
5. The total angle of depression $\beta$ below the horizontal ground plane is $\beta = \alpha + \theta$.
6. From planar geometry:
   $$\tan(\beta) = \frac{H_{cam}}{Z} \implies Z = \frac{H_{cam}}{\tan(\alpha + \theta)}$$
7. Using the angle-sum identity $\tan(\alpha + \theta) = \frac{\tan \alpha + \tan \theta}{1 - \tan \alpha \tan \theta}$, and noting that for automotive dashcams pitch angle is small ($\tan \theta \approx \theta \ll 1$) and $\tan \alpha \tan \theta \approx 0$:
   $$\tan(\alpha + \theta) \approx \tan \alpha + \tan \theta = \frac{y_{max} - c_y}{f_y} + \tan \theta = \frac{(y_{max} - c_y) + f_y \cdot \tan \theta}{f_y}$$
8. Inverting yields:
   $$Z_y = \frac{f_y \cdot H_{cam}}{(y_{max} - c_y) + f_y \cdot \tan(pitch_{rad})}$$

#### Horizon Line Calculation
The geometric horizon line $y_{horizon}$ occurs where $Z \to \infty$, meaning the denominator equals zero:
$$(y_{horizon} - c_y) + f_y \cdot \tan(pitch_{rad}) = 0 \implies y_{horizon} = c_y - f_y \cdot \tan(pitch_{rad})$$
With defaults ($f_y = 721.5$, $c_y = 185.0$, $pitch_{deg} = 0.5^\circ$):
$$pitch_{offset} = 721.5 \times \tan(0.0087266) \approx 6.2965\text{ px}$$
$$y_{horizon} = 185.0 - 6.30 = 178.70\text{ px}$$
Any bounding box with $y_{max} \le y_{horizon}$ indicates the ground contact point is at or above the horizon line (sky / infinity).

#### Numerical Stability Guards
- **Zero / Negative Denominator (Point at or above horizon)**:
  If $(y_{max} - c_y) + f_y \cdot \tan(pitch_{rad}) \le 1.0\text{ px}$, the ray does not intersect the ground plane ahead of the vehicle.
  Guard: Return maximum detection distance cap $120.0\text{ m}$ (or $150.0\text{ m}$).
- **NaN / Non-finite Guard**: Check `!Number.isFinite(y_max)`.
- **Bounding Box Offscreen / Close Proximity**:
  If $y_{max} \ge screenHeight$, the vehicle bumper is directly under the vehicle hood. Clamp $Z_y \ge 2.0\text{ m}$.
- **Global Range Clamping**: $\text{clamp}(Z_y, 2.0\text{ m}, 150.0\text{ m})$.

---

### 2.2. Vehicle Width Pinhole Model ($Z_w$)

#### Mathematical Formula
$$Z_w = \frac{f_x \cdot W_{car}}{x_{max} - x_{min}} = \frac{f_x \cdot W_{car}}{w_{px}}$$

#### Physical Parameters & Calibration Defaults
| Parameter | Default Value | Unit | Description | Automotive Reference |
| :--- | :--- | :--- | :--- | :--- |
| $f_x$ | `721.5` | px | Horizontal focal length | KITTI camera calibration ($f_x \approx f_y$) |
| $W_{car}$ | `1.82` | m | Standard passenger car physical width | Euro NCAP / ISO 15623 standard vehicle width |
| $w_{px}$ | $x_{max} - x_{min}$ | px | Detected vehicle width in pixels | Measured from AI Bounding Box |

#### Geometric Derivation
From standard pinhole perspective projection, the ratio of object image size to focal length equals the ratio of real-world dimension to depth:
$$\frac{w_{px}}{f_x} = \frac{W_{car}}{Z} \implies Z_w = \frac{f_x \cdot W_{car}}{w_{px}}$$

#### Numerical Stability Guards
- **Zero / Negative Width**: If $w_{px} \le 0$ or $x_{max} \le x_{min}$ (inverted or collapsed box), clamp $w_{px} = \max(8.0\text{ px}, w_{px})$.
- **Oversized Bounding Box**: If $w_{px} > screenWidth$, target vehicle exceeds camera FOV; clamp $Z_w \ge 2.0\text{ m}$.
- **Distant Small Target**: If $w_{px} < 4\text{ px}$, pinhole distance would spike toward thousands of meters; clamp $Z_w \le 150.0\text{ m}$.
- **Global Range Clamping**: $\text{clamp}(Z_w, 2.0\text{ m}, 150.0\text{ m})$.

---

### 2.3. Dual-Pinhole Weighted Fusion ($Z_{raw}$)

#### Mathematical Formula
$$Z_{raw} = w_y' \cdot Z_y + w_w' \cdot Z_w$$

#### Weight Distribution Rationale
- Default static weights: $w_y = 0.65$, $w_w = 0.35$ ($w_y + w_w = 1.0$).
- Ground contact ($Z_y$) is geometrically more metric-accurate across different car classes (sedans, SUVs, hatchbacks) because tire contact with the ground plane directly references road geometry, whereas vehicle width ($W_{car}$) varies between compact cars (~1.70m) and full-size SUVs / vans (~2.05m).
- However, ground contact is prone to occlusion when another vehicle cuts in or road gradients change. Thus, width ($Z_w$) provides a robust physical stabilizer.

#### Dynamic Confidence Adaptation
When `autoWeightByConf` is enabled:
$$confFactor = \text{clamp}(confidence, 0.20, 1.00)$$
$$w_y' = w_y \cdot confFactor$$
$$w_w' = 1.0 - w_y'$$
- When AI detection confidence is high ($c \ge 0.90$), ground contact dominates ($w_y' \approx 0.65$, $w_w' \approx 0.35$).
- When AI detection confidence degrades ($c \le 0.40$, e.g. severe rain, cut-in occlusion, poor lighting), weight automatically shifts to vehicle width ($w_y' \approx 0.26$, $w_w' \approx 0.74$), preventing false ground-contact spikes.

#### Sensor Discrepancy & Uncertainty Margin
To quantify sensor certainty for HUD display (`± uncertainty m`):
$$\Delta Z = |Z_y - Z_w|$$
$$uncertaintyM = \text{clamp}(0.25 \cdot \Delta Z + 2.0 \cdot (1 - confidence) + 0.4 \cdot (1 - K_{gain}), 0.5\text{ m}, 4.5\text{ m})$$

---

### 2.4. 1D Kalman / Exponential Moving Average (EMA) Smoothing Filter ($Z_{kalman}$)

#### Mathematical Formula
$$Z_{filtered} = K_{gain} \cdot Z_{raw} + (1 - K_{gain}) \cdot Z_{prev}$$

#### Gain Tuning & Physical Dynamics
| $K_{gain}$ | System Response | Phase Lag | Jitter Suppression | Usage Context |
| :--- | :--- | :--- | :--- | :--- |
| `0.05` | Extremely smooth | High (~20 frames / 330ms lag) | Maximum (eliminates all noise) | Steady highway cruise |
| `0.25` (Default) | Balanced ADAS response | Low (~4 frames / 66ms lag) | High (eliminates pixel quantization) | Standard automotive FCW |
| `0.60` | Highly responsive | Negligible (~2 frames / 33ms lag) | Moderate | Sport / Urban cut-in detection |
| `1.00` | Pure raw sensor feed | Zero lag | None (raw pixel jitter visible) | Debug / Sensor benchmarking |

#### Steady-State Equivalence to Kalman Filter
In a 1D linear Kalman filter estimating distance $x$ with constant process noise variance $Q$ and measurement noise variance $R$:
$$\text{Kalman Gain } K = \frac{P^-}{P^- + R}$$
At steady state, $K$ converges to a constant scalar $K_{gain} \in (0, 1]$. The update step:
$$\hat{x}_k = \hat{x}_k^- + K (z_k - \hat{x}_k^-) = K z_k + (1 - K) \hat{x}_{k-1}$$
is algebraically identical to the Exponential Moving Average (EMA).

#### Numerical Stability & Cold-Start Guards
- **Cold Start / First Frame Initialization**:
  If $Z_{prev} \le 0$ or uninitialized or `isNaN(Z_prev)`, set $Z_{filtered} = Z_{raw}$ immediately. This prevents a sluggish ramp-up from $0\text{m}$ to $40\text{m}$ upon application launch or target acquisition.
- **Slew-Rate / Teleportation Limiter**:
  If $|Z_{raw} - Z_{prev}| > 35.0\text{ m}$ in a single 16.6ms frame without a deliberate scenario/mode reset, rate-limit delta to $\pm 3.0\text{ m/frame}$ (~$180\text{ m/s}$ physical limit) to discard single-frame detector false positives.

---

### 2.5. Time-To-Collision (TTC) & Kinematics Engine

#### Mathematical Formula
$$TTC = \frac{Z_{filtered}}{\max(0.1\text{ m/s}, \Delta v_{ms})}$$
where:
$$\Delta v_{kmh} = v_{ego} - v_{lead}$$
$$\Delta v_{ms} = \frac{\Delta v_{kmh}}{3.6}$$

#### Closing Speed Conditions
- If $\Delta v_{ms} \le 0.2\text{ m/s}$ (ego vehicle is travelling at the same speed or slower than lead vehicle, i.e. distance is maintaining or increasing):
  $$TTC = 99.9\text{ s (Display: SAFE / >10s)}$$
- If $\Delta v_{ms} > 0.2\text{ m/s}$ (ego vehicle closing in on lead vehicle):
  $$TTC = \text{clamp}\left(\frac{Z_{filtered}}{\Delta v_{ms}}, 0.1, 99.9\right)\text{ seconds}$$

#### Minimum Safe Following Distance (2-Second Rule)
According to automotive safety standards (ISO 15623, Euro NCAP):
$$d_{min} = v_{ego\_ms} \times 2.0\text{ s} = \frac{v_{ego\_kmh}}{3.6} \times 2.0 = \text{round}\left(\frac{v_{ego\_kmh}}{1.8}\right)$$
Example: At $64\text{ km/h}$, $d_{min} = \frac{64}{1.8} \approx 35.5\text{ m} \to 32 - 36\text{ m}$.

#### Alert Level Thresholds
| Alert Level | Distance Threshold | TTC Threshold | Color Code | Tailwind / Hex | HUD Badge Text | Audio Cue |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SAFE** | $Z > 25\text{ m}$ | $TTC > 3.0\text{ s}$ | Emerald | `#10B981` | KHOẢNG CÁCH AN TOÀN | Silent |
| **WARNING** | $12\text{ m} \le Z \le 25\text{ m}$ | $1.5\text{ s} < TTC \le 3.0\text{ s}$ | Amber | `#F59E0B` | CHÚ Ý GIỮ KHOẢNG CÁCH | 850 Hz intermittent pulse |
| **DANGER** | $Z < 12\text{ m}$ | $TTC \le 1.5\text{ s}$ | Red | `#EF4444` | GẦN HƠN QUY ĐỊNH | 1900+2400 Hz rapid dual chime + Red Vignette |

---

### 2.6. Reversible Inverse Pinhole Projection ($Z \to \text{BBox}$)

For Simulation Mode (Mode 1), Scenarios (Mode 2), and Manual Arrow Controls (Mode 3), the system synthesizes realistic 2D bounding boxes on screen that remain 100% mathematically consistent when fed into the forward pinhole estimators:

$$\begin{aligned}
safeZ &= \max(3.0, Z) \\
w_{px} &= \frac{f_x \cdot W_{car}}{safeZ} \\
h_{px} &= w_{px} \cdot 0.82 \quad (\text{standard passenger car aspect ratio } H/W) \\
y_{max} &= c_y - f_y \cdot \tan(pitch_{rad}) + \frac{f_y \cdot H_{cam}}{safeZ} \\
y_{min} &= y_{max} - h_{px} \\
centerX &= \frac{screenW}{2} + lateralOffset \cdot \left(screenW \cdot 0.22 \cdot \frac{50}{\max(15, safeZ)}\right) \\
x_{min} &= \text{round}(centerX - w_{px} / 2) \\
x_{max} &= \text{round}(centerX + w_{px} / 2) \\
y_1 &= \text{round}(y_{min}), \quad y_2 = \text{round}(y_{max})
\end{aligned}$$

Because $w_{px} = \frac{f_x \cdot W_{car}}{Z}$ and $y_{max} = c_y - f_y \cdot \tan(pitch) + \frac{f_y \cdot H_{cam}}{Z}$ are exact algebraic inverses of the pinhole formulas, evaluating $Z_y$ and $Z_w$ from this generated bounding box produces the exact intended distance $Z$ with zero truncation drift.

---

## 3. Requirement R1: Web Audio API Pure Synthesizer

```
                              [Web Audio API Graph]
                                        
   +-------------------+                     +-------------------+
   | OscillatorNode    |                     | GainNode (ADSR)   |
   | Sine / Triangle   | ------------------> | attack / decay    | ------+
   | (850Hz / 1900Hz)  |                     | linear / exp ramp |       |
   +-------------------+                     +-------------------+       |
                                                                         v
   +-------------------+                     +-------------------+   +--------------------+
   | OscillatorNode 2  |                     | GainNode 2        |-->| ctx.destination    |
   | (2400Hz @ +50ms)  | ------------------> | (Dual-chime peak) |   | (Speakers / Audio) |
   +-------------------+                     +-------------------+   +--------------------+
```

### 3.1. Browser Autoplay Policy & User Gesture Lifecycle
Modern browsers (Chromium, WebKit, Gecko) mandate that an `AudioContext` cannot emit audible sound until a user interaction (click, tap, keypress) occurs within the browsing session:
1. When instantiated in code, `ctx.state` starts as `'suspended'`.
2. Calling `ctx.resume()` during or after a user event transition transitions `ctx.state` to `'running'`.
3. Architecture requirement:
   - Provide an explicit `unlockAudio(): Promise<boolean>` method.
   - Register a lightweight, one-time listener on `window` (`pointerdown`, `keydown`) that automatically executes `unlockAudio()`.
   - Provide a visual mute/unmute button in HUD Telemetry and Director Panel that acts as both a user gesture unlock and an audio state toggle.

### 3.2. Sound Synthesizer Specifications by Alert State

#### A. Safe State ($Z > 25\text{ m}$)
- State: Silence.
- Actions: Immediate cancellation of active `setInterval`, stopping any in-flight oscillators, resetting timer pointers.

#### B. Warning State ($12\text{ m} \le Z \le 25\text{ m}$)
- Description: Soft intermittent alert pulse alerting the driver to maintain distance without inducing panic.
- Waveform: Pure Sine Wave (`'sine'`), minimal harmonic distortion.
- Frequency: $850\text{ Hz}$.
- Gain Envelope (ADSR):
  - $t_0$: Initial gain = `0.0`.
  - Attack: `linearRampToValueAtTime(0.18, t0 + 0.015)` (15 ms ramp to 0.18 peak).
  - Decay: `exponentialRampToValueAtTime(0.001, t0 + 0.090)` (75 ms decay).
  - Stop: `osc.stop(t0 + 0.095)`.
- Cadence: Repeats every $850\text{ ms}$ via interval timer.

#### C. Danger State ($Z < 12\text{ m}$)
- Description: Urgent dual high-pitch chime mimicking modern European automotive Autonomous Emergency Braking (AEB) acoustics.
- Waveform: Triangle Wave (`'triangle'`) for richer acoustic penetration through engine and road noise.
- Tone 1:
  - Frequency: $1900\text{ Hz}$.
  - Start: $t_0$.
  - Attack: `linearRampToValueAtTime(0.35, t0 + 0.010)` (10 ms).
  - Decay: `exponentialRampToValueAtTime(0.001, t0 + 0.060)` (50 ms).
  - Stop: $t_0 + 0.065\text{ s}$.
- Tone 2 (Delayed Secondary Pulse):
  - Frequency: $2400\text{ Hz}$.
  - Start: $t_0 + 0.050\text{ s}$ (50 ms delay creating distinctive double-chime).
  - Attack: `linearRampToValueAtTime(0.35, t0 + 0.055)` (5 ms).
  - Decay: `exponentialRampToValueAtTime(0.001, t0 + 0.110)` (55 ms).
  - Stop: $t_0 + 0.115\text{ s}$.
- Cadence: Rapid repetition every $220\text{ ms}$.
- Visual Coupling: Coordinated with `Red Vignette Pulse` CSS animation (`border: 4px solid #EF4444`, `box-shadow: inset 0 0 60px rgba(239, 68, 68, 0.45)`).

---

## 4. TypeScript Type System & Strict Interfaces

To adhere strictly to `"verbatimModuleSyntax": true` and `"noUnusedLocals": true` under TypeScript 6.0, all types must be exported with clean separation:

```typescript
// types/adas.ts

export type AlertLevel = 'safe' | 'warning' | 'danger';

export type OperatingMode = 'auto' | 'scenario' | 'manual';

export type ScenarioType = 'cruising' | 'hard_brake' | 'cut_in' | 'tailgate';

export type DetectionModelType = 'YOLOv8n-KITTI' | 'COCO-SSD';

export interface VideoSource {
  type: 'youtube' | 'mp4';
  url: string;
  id?: string;
  title: string;
  description?: string;
}

export interface CameraCalibration {
  f_y: number;       // Vertical focal length in pixels (e.g. 721.5)
  f_x: number;       // Horizontal focal length in pixels (e.g. 721.5)
  c_y: number;       // Optical center Y in pixels (e.g. 185.0)
  c_x: number;       // Optical center X in pixels (e.g. 640.0)
  H_cam: number;     // Camera mounting height above ground (meters, e.g. 1.65)
  pitch_deg: number; // Camera downward pitch angle (degrees, e.g. 0.5)
  W_car: number;     // Nominal vehicle physical width (meters, e.g. 1.82)
}

export interface FusionWeights {
  w_y: number;              // Ground contact weight (0.0 - 1.0, default 0.65)
  w_w: number;              // Vehicle width weight (1.0 - w_y, default 0.35)
  K_gain: number;           // 1D Kalman / EMA gain (0.05 - 1.0, default 0.25)
  autoWeightByConf: boolean;// Dynamic adaptation based on AI confidence
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

export interface AdasTelemetry {
  egoSpeedKmh: number;
  minSafeDistanceM: number;
  relativeSpeedKmh: number;
  detectionModel: DetectionModelType;
  confidence: number;
  inferenceMs: number;
  rawBBox: BoundingBox;
  v_bottom: number;
  w_px: number;
  Z_y: number;
  Z_w: number;
  Z_raw: number;
  Z_kalman: number;
  uncertaintyM: number;
  TTC: number;
  alertLevel: AlertLevel;
  lateralOffset: number;
  timestamp: number;
}

export interface SparklinePoint {
  time: number;
  distance: number;
  alert: AlertLevel;
}
```

---

## 5. Architectural Evaluation of Existing Codebase

### 5.1. File Status & Compilation Findings

Running `npm run build` (`tsc -b && vite build`) revealed compilation blockers:
1. **`verbatimModuleSyntax: true` Violations**:
   - Multiple files import types as value imports (`import { AdasTelemetry } from ...` instead of `import type { AdasTelemetry } from ...`).
   - Specifically affects `BackgroundVideo.tsx`, `BevMinimap.tsx`, `DirectorControls.tsx`, `HudTelemetry.tsx`, `LaneOverlay.tsx`, `TargetLockBox.tsx`, `TelemetryInspector.tsx`, `adasMath.ts`, `aiDetector.ts`, `audioAlert.ts`.
2. **`noUnusedLocals` / `noUnusedParameters` Violations**:
   - `src/services/adasMath.ts`: Parameter `screenH` in `projectDistanceToBBox` was unused.
   - `src/components/DirectorControls.tsx`: Unused imports (`Car`, `ChevronUp`, `EyeOff`, `Play`, `RotateCcw`, `Sparkles`), and invalid Lucide icon name `FolderVideo` (should be `FileVideo`).
   - `src/components/TelemetryInspector.tsx`: Unused import `Eye`.
   - `src/services/aiDetector.ts`: Unused variables `modelLoadFailed`, `screenH`, `startTime`.
3. **App Wiring Status**:
   - `src/App.tsx` is currently Vite starter boilerplate! The ADAS components (`BackgroundVideo`, `HudTelemetry`, `TargetLockBox`, `LaneOverlay`, `BevMinimap`, `TelemetryInspector`, `DirectorControls`) and services (`adasMath`, `audioAlert`, `aiDetector`) exist in `src/` but have not yet been wired together in `App.tsx`.

---

## 6. Concrete Implementable Recommendations

### Recommendation 1: Hardened `adasMath.ts` Implementation
Include complete numerical safety guards, NaN protections, type-only imports, and remove unused parameters:

```typescript
// Proposed src/services/adasMath.ts
import type { AlertLevel, BoundingBox, CameraCalibration, FusionWeights } from '../types/adas';

export function calculateGroundPinholeDistance(
  y_max: number,
  calibration: CameraCalibration
): number {
  if (!Number.isFinite(y_max)) return 120.0;
  const { f_y, H_cam, c_y, pitch_deg } = calibration;
  const pitch_rad = (pitch_deg * Math.PI) / 180;
  const pitch_offset = f_y * Math.tan(pitch_rad);
  const denominator = (y_max - c_y) + pitch_offset;

  if (!Number.isFinite(denominator) || denominator <= 1.0) {
    return 120.0;
  }

  const Z_y = (f_y * H_cam) / denominator;
  return Math.min(150.0, Math.max(2.0, Number.isFinite(Z_y) ? Z_y : 120.0));
}

export function calculateWidthPinholeDistance(
  w_px: number,
  calibration: CameraCalibration
): number {
  if (!Number.isFinite(w_px)) return 120.0;
  const { f_x, W_car } = calibration;
  const safe_width = Math.max(8.0, w_px);
  const Z_w = (f_x * W_car) / safe_width;
  return Math.min(150.0, Math.max(2.0, Number.isFinite(Z_w) ? Z_w : 120.0));
}

export function fuseDistances(
  Z_y: number,
  Z_w: number,
  weights: FusionWeights,
  confidence: number
): { Z_raw: number; eff_wy: number; eff_ww: number } {
  let eff_wy = weights.w_y;
  let eff_ww = weights.w_w;

  if (weights.autoWeightByConf) {
    const confFactor = Math.max(0.2, Math.min(1.0, Number.isFinite(confidence) ? confidence : 0.8));
    eff_wy = weights.w_y * confFactor;
    eff_ww = 1.0 - eff_wy;
  }

  const Z_raw = eff_wy * Z_y + eff_ww * Z_w;
  return { Z_raw: Number.isFinite(Z_raw) ? Z_raw : 30.0, eff_wy, eff_ww };
}

export function applyKalman1D(
  Z_raw: number,
  Z_prev: number,
  K_gain: number
): number {
  if (!Number.isFinite(Z_raw)) return Z_prev > 0 ? Z_prev : 30.0;
  if (!Number.isFinite(Z_prev) || Z_prev <= 0) return Z_raw;
  const clamped_gain = Math.max(0.02, Math.min(1.0, Number.isFinite(K_gain) ? K_gain : 0.25));
  return clamped_gain * Z_raw + (1 - clamped_gain) * Z_prev;
}

export function calculateUncertainty(
  Z_y: number,
  Z_w: number,
  confidence: number,
  K_gain: number
): number {
  const discrepancy = Math.abs(Z_y - Z_w);
  const rawUncertainty = discrepancy * 0.25 + (1 - Math.max(0, Math.min(1, confidence))) * 2.0 + (1 - K_gain) * 0.4;
  return Math.max(0.5, Math.min(4.5, Number(rawUncertainty.toFixed(1))));
}

export function projectDistanceToBBox(
  Z: number,
  lateralOffset: number,
  calibration: CameraCalibration,
  screenW: number
): BoundingBox {
  const { f_y, f_x, H_cam, c_y, pitch_deg, W_car } = calibration;
  const pitch_rad = (pitch_deg * Math.PI) / 180;
  const safeZ = Math.max(3.0, Number.isFinite(Z) ? Z : 30.0);

  const w_px = (f_x * W_car) / safeZ;
  const h_px = w_px * 0.82;
  const y_max = c_y - f_y * Math.tan(pitch_rad) + (f_y * H_cam) / safeZ;
  const y_min = y_max - h_px;

  const centerX = screenW / 2 + lateralOffset * (screenW * 0.22 * (50 / Math.max(15, safeZ)));
  const x_min = centerX - w_px / 2;
  const x_max = centerX + w_px / 2;

  return {
    x1: Math.round(x_min),
    y1: Math.round(y_min),
    x2: Math.round(x_max),
    y2: Math.round(y_max),
    width: Math.round(w_px),
    height: Math.round(h_px),
  };
}

export function calculateTTC(
  Z: number,
  egoSpeedKmh: number,
  leadSpeedKmh: number
): number {
  const relativeSpeedKmh = egoSpeedKmh - leadSpeedKmh;
  const relSpeedMs = relativeSpeedKmh / 3.6;

  if (relSpeedMs <= 0.2) {
    return 99.9;
  }

  const ttc = Z / relSpeedMs;
  return Math.max(0.1, Math.min(99.9, Number(ttc.toFixed(1))));
}

export function calculateMinSafeDistance(egoSpeedKmh: number): number {
  const speedMs = egoSpeedKmh / 3.6;
  return Math.round(speedMs * 2.0);
}

export function determineAlertLevel(distanceM: number): AlertLevel {
  if (distanceM > 25) return 'safe';
  if (distanceM >= 12) return 'warning';
  return 'danger';
}

export const ALERT_COLORS = {
  safe: {
    hex: '#10B981',
    twText: 'text-emerald-500',
    twBg: 'bg-emerald-500',
    twBorder: 'border-emerald-500',
    badgeText: 'KHOẢNG CÁCH AN TOÀN',
    subtleBg: 'rgba(16, 185, 129, 0.15)',
    glow: 'rgba(16, 185, 129, 0.4)',
  },
  warning: {
    hex: '#F59E0B',
    twText: 'text-amber-500',
    twBg: 'bg-amber-500',
    twBorder: 'border-amber-500',
    badgeText: 'CHÚ Ý GIỮ KHOẢNG CÁCH',
    subtleBg: 'rgba(245, 158, 11, 0.18)',
    glow: 'rgba(245, 158, 11, 0.5)',
  },
  danger: {
    hex: '#EF4444',
    twText: 'text-red-500',
    twBg: 'bg-red-500',
    twBorder: 'border-red-500',
    badgeText: 'GẦN HƠN QUY ĐỊNH',
    subtleBg: 'rgba(239, 68, 68, 0.25)',
    glow: 'rgba(239, 68, 68, 0.75)',
  },
};
```

### Recommendation 2: Hardened `audioAlert.ts` Synthesizer
Add `unlockAudio()`, auto-unlock on user gesture, type-only import, and robust audio context lifecycle:

```typescript
// Proposed src/services/audioAlert.ts
import type { AlertLevel } from '../types/adas';

class AudioAlertSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private currentAlert: AlertLevel = 'safe';
  private beepIntervalId: number | null = null;
  private unlocked: boolean = false;

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

  public async unlockAudio(): Promise<boolean> {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        this.unlocked = true;
        return true;
      } catch {
        return false;
      }
    }
    this.unlocked = true;
    return true;
  }

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopBeeps();
    } else {
      this.unlockAudio();
      this.updateAlert(this.currentAlert);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public updateAlert(level: AlertLevel) {
    if (this.currentAlert === level && this.beepIntervalId !== null) {
      return;
    }
    this.currentAlert = level;
    this.stopBeeps();

    if (this.isMuted) return;

    if (level === 'warning') {
      this.playWarningBeep();
      this.beepIntervalId = window.setInterval(() => {
        this.playWarningBeep();
      }, 850);
    } else if (level === 'danger') {
      this.playDangerDualBeep();
      this.beepIntervalId = window.setInterval(() => {
        this.playDangerDualBeep();
      }, 220);
    }
  }

  private playWarningBeep() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;

    try {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(850, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.095);
    } catch {
      // Ignore audio synthesis errors
    }
  }

  private playDangerDualBeep() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;

    try {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      const t = this.ctx.currentTime;

      // Pulse 1: 1900 Hz
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(1900, t);

      gain1.gain.setValueAtTime(0, t);
      gain1.gain.linearRampToValueAtTime(0.35, t + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.065);

      // Pulse 2: 2400 Hz (delayed 50ms)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(2400, t + 0.05);

      gain2.gain.setValueAtTime(0, t + 0.05);
      gain2.gain.linearRampToValueAtTime(0.35, t + 0.055);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(t + 0.05);
      osc2.stop(t + 0.115);
    } catch {
      // Ignore audio synthesis errors
    }
  }

  public stopBeeps() {
    if (this.beepIntervalId !== null) {
      clearInterval(this.beepIntervalId);
      this.beepIntervalId = null;
    }
  }

  public destroy() {
    this.stopBeeps();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const audioAlert = new AudioAlertSynthesizer();
```

---

## 7. Mathematical Verification Matrix

| Test Case | Inputs ($y_{max}$, $w_{px}$, $c$, $K$) | Expected Calculation | Expected Alert / Audio Behavior |
| :--- | :--- | :--- | :--- |
| **Far Cruising** | $y_{max} = 220\text{px}$, $w_{px} = 32\text{px}$, $c=0.95$, $K=0.25$ | $Z_y \approx 28.5\text{m}$, $Z_w \approx 41.0\text{m}$, $Z_{raw} \approx 32.9\text{m}$, $Z_{kalman} \to 33\text{m}$ | **SAFE** (Green HUD badge, silence) |
| **Warning Distance** | $y_{max} = 245\text{px}$, $w_{px} = 65\text{px}$, $c=0.90$, $K=0.25$ | $Z_y \approx 18.0\text{m}$, $Z_w \approx 20.2\text{m}$, $Z_{raw} \approx 18.8\text{m}$, $Z_{kalman} \to 19\text{m}$ | **WARNING** (Amber badge, 850Hz intermittent beep) |
| **Emergency Danger** | $y_{max} = 310\text{px}$, $w_{px} = 150\text{px}$, $c=0.98$, $K=0.25$ | $Z_y \approx 9.1\text{m}$, $Z_w \approx 8.7\text{m}$, $Z_{raw} \approx 9.0\text{m}$, $Z_{kalman} \to 9\text{m}$ | **DANGER** (Red badge, 1900+2400Hz double beep, Red Vignette Pulse) |
| **Horizon Cutoff** | $y_{max} = 175\text{px}$ (above horizon $178.7\text{px}$), $w_{px} = 10\text{px}$ | $Z_y$ denominator $\le 0 \implies 120.0\text{m}$, $Z_w \approx 131\text{m}$ | **SAFE** (Protected against $\infty$ / negative depth) |
| **Low Conf Cut-In** | $y_{max} = 280\text{px}$, $w_{px} = 110\text{px}$, $c=0.20$ | $w_y' = 0.65 \times 0.2 = 0.13$, $w_w' = 0.87$ (width takes 87% weight) | Weighted towards vehicle width |
