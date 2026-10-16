import React from 'react';
import { Crosshair } from 'lucide-react';
import type { AdasTelemetry } from '../types/adas';
import { ALERT_COLORS } from '../services/adasMath';

interface TargetLockBoxProps {
  telemetry: AdasTelemetry;
}

export const TargetLockBox: React.FC<TargetLockBoxProps> = ({ telemetry }) => {
  const { rawBBox, alertLevel, Z_kalman, TTC, confidence, detectionModel } = telemetry;
  const currentConfig = ALERT_COLORS[alertLevel];

  // Bounding box dimensions
  const left = rawBBox.x1;
  const top = rawBBox.y1;
  const width = rawBBox.width;
  const height = rawBBox.height;

  // Bracket line length based on box size
  const cornerSize = Math.max(8, Math.min(24, Math.round(width * 0.18)));

  return (
    <div
      className="absolute pointer-events-none select-none z-20 transition-all duration-75"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      {/* Sci-fi Corner Brackets */}
      {/* Top Left */}
      <div
        className="absolute top-0 left-0 transition-colors duration-300"
        style={{
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
          borderTop: `2.5px solid ${currentConfig.hex}`,
          borderLeft: `2.5px solid ${currentConfig.hex}`,
          filter: `drop-shadow(0 0 4px ${currentConfig.hex})`,
        }}
      />
      {/* Top Right */}
      <div
        className="absolute top-0 right-0 transition-colors duration-300"
        style={{
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
          borderTop: `2.5px solid ${currentConfig.hex}`,
          borderRight: `2.5px solid ${currentConfig.hex}`,
          filter: `drop-shadow(0 0 4px ${currentConfig.hex})`,
        }}
      />
      {/* Bottom Left */}
      <div
        className="absolute bottom-0 left-0 transition-colors duration-300"
        style={{
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
          borderBottom: `2.5px solid ${currentConfig.hex}`,
          borderLeft: `2.5px solid ${currentConfig.hex}`,
          filter: `drop-shadow(0 0 4px ${currentConfig.hex})`,
        }}
      />
      {/* Bottom Right */}
      <div
        className="absolute bottom-0 right-0 transition-colors duration-300"
        style={{
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
          borderBottom: `2.5px solid ${currentConfig.hex}`,
          borderRight: `2.5px solid ${currentConfig.hex}`,
          filter: `drop-shadow(0 0 4px ${currentConfig.hex})`,
        }}
      />

      {/* Subtle tinted bounding fill */}
      <div
        className="w-full h-full transition-colors duration-300"
        style={{
          backgroundColor: currentConfig.subtleBg,
          border: `1px dashed ${currentConfig.hex}40`,
        }}
      />

      {/* Center Target Reticle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-70">
        <Crosshair
          className="w-4 h-4 transition-colors duration-300"
          style={{ color: currentConfig.hex }}
        />
      </div>

      {/* Ground Contact Bar (Tire-ground contact line for Z_y measurement) */}
      <div
        className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-full transition-all duration-300"
        style={{
          backgroundColor: currentConfig.hex,
          boxShadow: `0 0 10px ${currentConfig.hex}`,
        }}
      />
      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-cyan-300/80 bg-black/80 px-1 py-0.2 rounded whitespace-nowrap">
        Ground Contact y₂={rawBBox.y2}px
      </span>

      {/* Attached Floating ADAS Target Tag */}
      <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded-md glass-panel-subtle text-[11px] font-mono text-white whitespace-nowrap shadow-lg border border-white/15">
        <span
          className="w-1.5 h-1.5 rounded-full animate-ping"
          style={{ backgroundColor: currentConfig.hex }}
        />
        <span className="font-semibold text-gray-200">Lead Car</span>
        <span className="text-gray-400">•</span>
        <span className="font-bold tabular-nums" style={{ color: currentConfig.hex }}>
          {Z_kalman.toFixed(1)}m
        </span>
        <span className="text-gray-400">•</span>
        <span className="text-cyan-300 font-semibold tabular-nums">
          TTC: {TTC >= 99.0 ? 'SAFE' : `${TTC.toFixed(1)}s`}
        </span>
      </div>

      {/* Top right model confidence badge */}
      <div className="absolute -top-6 -right-2 text-[9px] font-mono text-gray-400 bg-black/75 px-1 py-0.2 rounded">
        {detectionModel === 'YOLOv8n-KITTI' ? 'YOLOv8' : 'COCO'} {(confidence * 100).toFixed(0)}%
      </div>
    </div>
  );
};
