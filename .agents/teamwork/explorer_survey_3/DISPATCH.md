# Dispatch for Explorer Survey 3
Investigate HUD visual layers, video layers (YouTube + MP4), AI detection pipeline, Glassmorphism Telemetry box, and Director panel.

## 2026-10-16T08:09:06Z
Sender: 04a59318-25ee-4240-9fc7-a7b84ebe67c5
Priority: MESSAGE_PRIORITY_HIGH
Content:
You are the HUD & Vision Pipeline Explorer for DriveDeck xADAS.
Working directory: d:/K4-Track4-ProjectCapstone/.agents/teamwork/explorer_survey_3/
MANDATORY: You MUST read the original requirements at:
d:/K4-Track4-ProjectCapstone/.agents/teamwork/ORIGINAL_REQUEST.md

Task:
1. Read d:/K4-Track4-ProjectCapstone/.agents/teamwork/ORIGINAL_REQUEST.md.
2. Focus on Requirements R1 (Video Layer), R2 (HUD Visual Layer), R4 (Inspector Telemetry Box), and R5 (Director Panel & Operating Modes):
   - Background Video: YouTube IFrame player with 3 preset dashcam URLs, loop, mute default, hide controls; local MP4 file upload support.
   - HUD Visual Layer (DriveDeck xADAS Glassmorphism):
     * Telemetry HUD (top-left): Alert badge (Safe >25m #10B981, Caution 12-25m #F59E0B, Critical <12m blinking #EF4444), large distance readout with uncertainty (+/- 1.4m), speed & 2-second rule ("64 km/h * Toi thieu 32 m").
     * Dynamic SVG Lane Carpet: 3D perspective glowing trapezoid, dynamic color changes, adjustable Horizon Y and Lane Width.
     * Lead Vehicle Target Lock: Bounding box tracking lead car undercarriage, dynamic scaling & Y position via inverse pinhole from Z, tag: "Lead Car * [Z]m * TTC: [X.X]s".
     * BEV Radar (2D top-down with 10m/20m/40m rings) & Distance History 15s Sparkline.
     * Red Vignette Pulse visual effect when <12m.
   - Inspector Telemetry Box (top-right, collapsible glassmorphic): 4 sections updating 60 FPS (AI Detection Engine, Camera Calibration Matrix, Fusion & Filter Weights with interactive sliders, Live Pipeline Formula Output).
   - Director Panel (bottom tray, toggle with 'H' key): 3 operating modes (Auto Simulation, Scenario Presets: Cruising 40m, Hard Braking 40m->8m, Cut-in 10m, Tailgating 15m; Manual Live Control with Up/Down distance, Left/Right lane offset).
   - AI Detection with fallback simulation.
3. Detail component architecture, state management flow, layout coordinate systems, and event handling.
4. Write your detailed survey report to d:/K4-Track4-ProjectCapstone/.agents/teamwork/explorer_survey_3/survey_report.md.
5. Also write handoff.md in your working directory with Observation, Logic Chain, Caveats, Conclusion, Verification Method.
6. Send a brief completion message back to the orchestrator when finished.
