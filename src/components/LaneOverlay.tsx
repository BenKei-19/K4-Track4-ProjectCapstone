import React from 'react';
import type { AlertLevel, LaneCalibration } from '../types/adas';
import { ALERT_COLORS } from '../services/adasMath';

interface LaneOverlayProps {
  laneCalibration: LaneCalibration;
  alertLevel: AlertLevel;
  screenWidth: number;
  screenHeight: number;
  showGuides?: boolean;
}

export const LaneOverlay: React.FC<LaneOverlayProps> = ({
  laneCalibration,
  alertLevel,
  screenWidth,
  screenHeight,
  showGuides = true,
}) => {
  const { horizonY, topWidth, bottomWidth, vanishX } = laneCalibration;
  const currentConfig = ALERT_COLORS[alertLevel];

  // Coordinates calculation
  const hy = screenHeight * horizonY; // Horizon pixel Y
  const by = screenHeight; // Bottom bumper pixel Y
  const vx = screenWidth * vanishX; // Vanishing point pixel X

  // Lane edges at horizon
  const topHalfW = (screenWidth * topWidth) / 2;
  const topLeftX = vx - topHalfW;
  const topRightX = vx + topHalfW;

  // Lane edges at bottom bumper
  const botHalfW = (screenWidth * bottomWidth) / 2;
  const botLeftX = vx - botHalfW;
  const botRightX = vx + botHalfW;

  // Trapezoid polygon points
  const polygonPoints = `${topLeftX},${hy} ${topRightX},${hy} ${botRightX},${by} ${botLeftX},${by}`;

  // Center dashed path
  const centerTopX = vx;
  const centerTopY = hy;
  const centerBotX = vx;
  const centerBotY = by;

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none select-none z-15">
      <svg
        className="w-full h-full"
        viewBox={`0 0 ${screenWidth} ${screenHeight}`}
        preserveAspectRatio="none"
      >
        <defs>
          {/* Gradient for Lane Carpet */}
          <linearGradient id="laneGradient" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={currentConfig.hex} stopOpacity="0.32" />
            <stop offset="45%" stopColor={currentConfig.hex} stopOpacity="0.18" />
            <stop offset="85%" stopColor={currentConfig.hex} stopOpacity="0.05" />
            <stop offset="100%" stopColor={currentConfig.hex} stopOpacity="0.0" />
          </linearGradient>

          {/* Glow filter for boundary lines */}
          <filter id="laneGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Pattern for lane speed stripes */}
          <pattern id="laneGrid" width="100" height="40" patternUnits="userSpaceOnUse">
            <line x1="0" y1="39" x2="100" y2="39" stroke={currentConfig.hex} strokeOpacity="0.12" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Lane Carpet Fill Polygon */}
        <polygon
          points={polygonPoints}
          fill="url(#laneGradient)"
          className="transition-all duration-300"
        />

        {/* Textured Grid Overlay on Lane Carpet */}
        <polygon
          points={polygonPoints}
          fill="url(#laneGrid)"
          className="transition-all duration-300"
        />

        {/* Left Glowing Boundary Line */}
        <line
          x1={botLeftX}
          y1={by}
          x2={topLeftX}
          y2={hy}
          stroke={currentConfig.hex}
          strokeWidth="3.5"
          filter="url(#laneGlow)"
          strokeLinecap="round"
          className="transition-all duration-300"
        />

        {/* Right Glowing Boundary Line */}
        <line
          x1={botRightX}
          y1={by}
          x2={topRightX}
          y2={hy}
          stroke={currentConfig.hex}
          strokeWidth="3.5"
          filter="url(#laneGlow)"
          strokeLinecap="round"
          className="transition-all duration-300"
        />

        {/* Center Guidance Dashed Line */}
        {showGuides && (
          <line
            x1={centerBotX}
            y1={centerBotY}
            x2={centerTopX}
            y2={centerTopY}
            stroke={currentConfig.hex}
            strokeWidth="2"
            strokeDasharray="16 14"
            strokeOpacity="0.65"
            className="transition-all duration-300"
          />
        )}

        {/* Horizon Calibration Line (subtle dashed) */}
        {showGuides && (
          <line
            x1="0"
            y1={hy}
            x2={screenWidth}
            y2={hy}
            stroke="rgba(255, 255, 255, 0.12)"
            strokeDasharray="4 6"
            strokeWidth="1"
          />
        )}
      </svg>
    </div>
  );
};
