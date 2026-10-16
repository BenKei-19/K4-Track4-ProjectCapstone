import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AdasTelemetry,
  CameraCalibration,
  DetectionModelType,
  FusionWeights,
  LaneCalibration,
  OperatingMode,
  ScenarioType,
  SparklinePoint,
  VideoSource,
} from './types/adas';
import {
  applyKalman1D,
  calculateGroundPinholeDistance,
  calculateMinSafeDistance,
  calculateTTC,
  calculateUncertainty,
  calculateWidthPinholeDistance,
  determineAlertLevel,
  fuseDistances,
  projectDistanceToBBox,
} from './services/adasMath';
import { audioAlert } from './services/audioAlert';
import { vehicleDetector } from './services/aiDetector';
import { BackgroundVideo } from './components/BackgroundVideo';
import { PRESET_VIDEOS } from './constants/presets';
import { HudTelemetry } from './components/HudTelemetry';
import { LaneOverlay } from './components/LaneOverlay';
import { TargetLockBox } from './components/TargetLockBox';
import { BevMinimap } from './components/BevMinimap';
import { TelemetryInspector } from './components/TelemetryInspector';
import { DirectorControls } from './components/DirectorControls';

export const App: React.FC = () => {
  // Screen Dimensions
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Video Source (default: highway cruise preset)
  const [videoSource, setVideoSource] = useState<VideoSource>(PRESET_VIDEOS[0]);
  const activeVideoElRef = useRef<HTMLVideoElement | null>(null);

  // Audio State
  const [isMuted, setIsMuted] = useState(false);

  // Director Panel Visibility
  const [isDirectorVisible, setIsDirectorVisible] = useState(true);

  // Operating Mode
  const [operatingMode, setOperatingMode] = useState<OperatingMode>('auto');

  // Manual Control State
  const [manualDistance, setManualDistance] = useState(38);
  const [manualOffset, setManualOffset] = useState(0.0);

  // Vehicle Kinematics
  const [egoSpeed, setEgoSpeed] = useState(68); // km/h

  // Camera Calibration Matrix (Default: KITTI P2 / Modern iPhone setup)
  const [calibration, setCalibration] = useState<CameraCalibration>({
    f_y: 721.5,
    f_x: 721.5,
    c_y: 185.0,
    c_x: 640.0,
    H_cam: 1.65,
    pitch_deg: 0.5,
    W_car: 1.82,
  });

  // Lane Carpet Horizon Calibration
  const [laneCalibration, setLaneCalibration] = useState<LaneCalibration>({
    horizonY: 0.48,
    topWidth: 0.12,
    bottomWidth: 0.72,
    vanishX: 0.5,
  });

  // Fusion & Filter Weights
  const [weights, setWeights] = useState<FusionWeights>({
    w_y: 0.65,
    w_w: 0.35,
    K_gain: 0.25,
    autoWeightByConf: true,
  });

  // Detection Model
  const [detectionModel, setDetectionModel] = useState<DetectionModelType>('YOLOv8n-KITTI');

  // Sparkline 15-second History
  const [history, setHistory] = useState<SparklinePoint[]>([]);

  // Simulation internal states
  const simStateRef = useRef({
    distanceTarget: 38,
    simDistance: 38,
    simOffset: 0.0,
    targetOffset: 0.0,
    scenarioTime: 0,
    activeScenario: null as ScenarioType | null,
    prevKalman: 38,
    lastHistoryTick: 0,
    prevTimestamp: 0,
  });

  // Audio Toggle
  const handleToggleMute = useCallback(() => {
    const newMuted = audioAlert.toggleMute();
    setIsMuted(newMuted);
  }, []);

  // Live Telemetry State (Synced with HUD & Inspector)
  const [telemetry, setTelemetry] = useState<AdasTelemetry>(() => {
    const initBBox = projectDistanceToBBox(38, 0, calibration, dimensions.width, dimensions.height);
    const Z_y = calculateGroundPinholeDistance(initBBox.y2, calibration);
    const Z_w = calculateWidthPinholeDistance(initBBox.width, calibration);
    const { Z_raw } = fuseDistances(Z_y, Z_w, weights, 0.94);
    const Z_kalman = applyKalman1D(Z_raw, 38, weights.K_gain);

    return {
      egoSpeedKmh: 68,
      minSafeDistanceM: calculateMinSafeDistance(68),
      relativeSpeedKmh: 0,
      detectionModel: 'YOLOv8n-KITTI',
      confidence: 0.94,
      inferenceMs: 12.4,
      rawBBox: initBBox,
      v_bottom: initBBox.y2,
      w_px: initBBox.width,
      Z_y,
      Z_w,
      Z_raw,
      Z_kalman,
      uncertaintyM: 1.4,
      TTC: 99.9,
      alertLevel: 'safe',
      lateralOffset: 0,
      timestamp: Date.now(),
    };
  });

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setCalibration((prev) => ({
        ...prev,
        c_x: window.innerWidth / 2,
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard shortcut listeners (H to hide director panel, arrows for manual control)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard against hijacking keystrokes while user is typing in form controls
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Toggle Director Panel
      if (e.key === 'h' || e.key === 'H') {
        setIsDirectorVisible((prev) => !prev);
      }
      // Toggle Mute
      if (e.key === 'm' || e.key === 'M') {
        handleToggleMute();
      }

      // Manual control arrow keys
      if (operatingMode === 'manual') {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setManualDistance((prev) => Math.min(75, prev + 2));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setManualDistance((prev) => Math.max(5, prev - 2));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setManualOffset((prev) => Math.max(-0.7, prev - 0.05));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setManualOffset((prev) => Math.min(0.7, prev + 0.05));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [operatingMode, handleToggleMute]);

  // Trigger Scenario Preset
  const handleTriggerScenario = useCallback((scenario: ScenarioType) => {
    setOperatingMode('scenario');
    simStateRef.current.activeScenario = scenario;
    simStateRef.current.scenarioTime = performance.now();

    switch (scenario) {
      case 'cruising':
        simStateRef.current.distanceTarget = 40;
        simStateRef.current.targetOffset = 0.0;
        break;
      case 'hard_brake':
        // Start high, brake abruptly
        simStateRef.current.distanceTarget = 8.2;
        break;
      case 'cut_in':
        // Sudden vehicle cutting in at 10m from the right
        simStateRef.current.simDistance = 12.0;
        simStateRef.current.distanceTarget = 10.0;
        simStateRef.current.simOffset = 0.65;
        simStateRef.current.targetOffset = 0.05;
        break;
      case 'tailgate':
        simStateRef.current.distanceTarget = 14.5;
        simStateRef.current.targetOffset = 0.0;
        break;
    }
  }, []);

  // Main 60 FPS ADAS Calculation & Animation Loop
  useEffect(() => {
    let animId: number;

    const tick = (now: number) => {
      const state = simStateRef.current;
      if (!state.prevTimestamp) {
        state.prevTimestamp = now;
      }
      const dt = Math.min(0.1, (now - state.prevTimestamp) / 1000);
      state.prevTimestamp = now;

      // 1. Determine Target Distance & Offset according to Operating Mode
      if (operatingMode === 'auto') {
        // Natural highway cruising: gentle undulating sine waves + perlin-like disturbance
        const t = now / 1000;
        const base = 36;
        const wave1 = Math.sin(t * 0.4) * 11;
        const wave2 = Math.cos(t * 0.15) * 6;
        const microJitter = (Math.sin(t * 3.5) * 0.5);

        // Auto mode target
        state.distanceTarget = Math.max(9, base + wave1 + wave2 + microJitter);
        // Small lane wandering
        state.targetOffset = Math.sin(t * 0.25) * 0.15;
      } else if (operatingMode === 'scenario') {
        const elapsedSec = (now - state.scenarioTime) / 1000;
        if (state.activeScenario === 'hard_brake') {
          // Rapid deceleration curve
          if (elapsedSec < 2.5) {
            state.distanceTarget = Math.max(7.5, 40 - elapsedSec * 13);
          } else if (elapsedSec < 5.0) {
            state.distanceTarget = 8.0;
          } else {
            // Recover back to safe distance
            state.distanceTarget = 36;
          }
        } else if (state.activeScenario === 'cut_in') {
          if (elapsedSec < 3.0) {
            state.distanceTarget = 10.2;
          } else {
            state.distanceTarget = 32;
          }
        }
      } else if (operatingMode === 'manual') {
        state.distanceTarget = manualDistance;
        state.targetOffset = manualOffset;
      }

      // 2. Smooth Lerp towards target (simulating vehicle inertia)
      const lerpSpeed = operatingMode === 'scenario' && state.activeScenario === 'hard_brake' ? 4.5 : 2.5;
      state.simDistance += (state.distanceTarget - state.simDistance) * Math.min(1, dt * lerpSpeed);
      state.simOffset += (state.targetOffset - state.simOffset) * Math.min(1, dt * 3.0);

      // 3. AI Vehicle Detection / Inverse Projection
      const detection = vehicleDetector.simulateDetection(
        state.simDistance,
        state.simOffset,
        calibration,
        detectionModel,
        dimensions.width,
        dimensions.height
      );

      const rawBBox = detection.bbox;
      const v_bottom = rawBBox.y2;
      const w_px = rawBBox.width;

      // 4. Mathematical Pipeline (Pinhole Ground, Pinhole Width, Weighted Fusion, Kalman 1D)
      const Z_y = calculateGroundPinholeDistance(v_bottom, calibration);
      const Z_w = calculateWidthPinholeDistance(w_px, calibration);

      const { Z_raw } = fuseDistances(Z_y, Z_w, weights, detection.confidence);

      // Apply Kalman Filter (1D EMA)
      const Z_kalman = applyKalman1D(Z_raw, state.prevKalman, weights.K_gain);
      state.prevKalman = Z_kalman;

      // Uncertainty margin
      const uncertaintyM = calculateUncertainty(Z_y, Z_w, detection.confidence, weights.K_gain);

      // Lead vehicle velocity estimate from distance delta
      const leadSpeedKmh = egoSpeed - ((state.simDistance - Z_kalman) / (dt || 0.016)) * 3.6;
      const relSpeedKmh = egoSpeed - leadSpeedKmh;

      // Time-To-Collision (TTC)
      const TTC = calculateTTC(Z_kalman, egoSpeed, leadSpeedKmh);

      // Alert level
      const alertLevel = determineAlertLevel(Z_kalman);

      // 5. Update Audio Alert Synthesizer
      audioAlert.updateAlert(alertLevel);

      // 6. Update History Sparkline every 250ms
      if (now - state.lastHistoryTick > 250) {
        state.lastHistoryTick = now;
        setHistory((prev) => {
          const next = [...prev, { time: now, distance: Z_kalman, alert: alertLevel }];
          return next.slice(-60); // Keep last 15 seconds (60 * 250ms)
        });
      }

      // 7. Update Telemetry State
      setTelemetry({
        egoSpeedKmh: egoSpeed,
        minSafeDistanceM: calculateMinSafeDistance(egoSpeed),
        relativeSpeedKmh: Number(relSpeedKmh.toFixed(1)),
        detectionModel,
        confidence: detection.confidence,
        inferenceMs: detection.inferenceMs,
        rawBBox,
        v_bottom,
        w_px,
        Z_y,
        Z_w,
        Z_raw,
        Z_kalman,
        uncertaintyM,
        TTC,
        alertLevel,
        lateralOffset: state.simOffset,
        timestamp: now,
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
      audioAlert.stopBeeps();
    };
  }, [
    dimensions,
    calibration,
    weights,
    detectionModel,
    operatingMode,
    manualDistance,
    manualOffset,
    egoSpeed,
  ]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none">
      {/* 1. Background Video Layer (YouTube Iframe or MP4 Video) */}
      <BackgroundVideo
        source={videoSource}
        onVideoElementReady={(el) => {
          activeVideoElRef.current = el;
        }}
        isDanger={telemetry.alertLevel === 'danger'}
      />

      {/* 2. 3D Perspective Dynamic SVG Lane Carpet */}
      <LaneOverlay
        laneCalibration={laneCalibration}
        alertLevel={telemetry.alertLevel}
        screenWidth={dimensions.width}
        screenHeight={dimensions.height}
      />

      {/* 3. Lead Vehicle Target Lock Bracket */}
      <TargetLockBox telemetry={telemetry} />

      {/* 4. DriveDeck xADAS Telemetry HUD Card (Top Left) */}
      <HudTelemetry
        telemetry={telemetry}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
      />

      {/* 5. Calculation Weights & Telemetry Box (Top Right Inspector) */}
      <TelemetryInspector
        telemetry={telemetry}
        calibration={calibration}
        onUpdateCalibration={(updates) => setCalibration((prev) => ({ ...prev, ...updates }))}
        weights={weights}
        onUpdateWeights={(updates) => setWeights((prev) => ({ ...prev, ...updates }))}
        onSelectModel={setDetectionModel}
      />

      {/* 6. Mini BEV Radar & 15-second History Sparkline (Bottom Right above Director Panel) */}
      <div className={`absolute right-5 z-25 transition-all duration-300 ${isDirectorVisible ? 'bottom-48 sm:bottom-44' : 'bottom-6'}`}>
        <BevMinimap telemetry={telemetry} history={history} />
      </div>

      {/* 7. Demo Director Panel (Docked at Bottom, Collapsible with 'H') */}
      <DirectorControls
        isVisible={isDirectorVisible}
        onToggleVisible={() => setIsDirectorVisible((prev) => !prev)}
        videoSource={videoSource}
        onSelectVideo={setVideoSource}
        operatingMode={operatingMode}
        onChangeMode={setOperatingMode}
        onTriggerScenario={handleTriggerScenario}
        manualDistance={manualDistance}
        onChangeManualDistance={setManualDistance}
        manualOffset={manualOffset}
        onChangeManualOffset={setManualOffset}
        egoSpeed={egoSpeed}
        onChangeEgoSpeed={setEgoSpeed}
        laneCalibration={laneCalibration}
        onUpdateLaneCalibration={(updates) => setLaneCalibration((prev) => ({ ...prev, ...updates }))}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
      />
    </div>
  );
};

export default App;
