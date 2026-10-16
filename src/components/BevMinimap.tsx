import React from 'react';
import { Activity, Radio } from 'lucide-react';
import type { AdasTelemetry, SparklinePoint } from '../types/adas';
import { ALERT_COLORS } from '../services/adasMath';

interface BevMinimapProps {
  telemetry: AdasTelemetry;
  history: SparklinePoint[];
}

export const BevMinimap: React.FC<BevMinimapProps> = ({ telemetry, history }) => {
  const { Z_kalman, lateralOffset, alertLevel } = telemetry;
  const currentConfig = ALERT_COLORS[alertLevel];

  // Radar dimensions
  const radarH = 140;
  const radarW = 120;
  const maxDistance = 65; // Max range shown on BEV radar in meters

  // Ego position (bottom center)
  const egoX = radarW / 2;
  const egoY = radarH - 18;

  // Lead vehicle position calculation
  // clamped distance 3m to 65m
  const clampedZ = Math.max(3, Math.min(maxDistance, Z_kalman));
  const leadY = egoY - (clampedZ / maxDistance) * (radarH - 35);
  const leadX = egoX + lateralOffset * 32;

  // Distance range rings positions (10m, 20m, 40m)
  const r10Y = egoY - (10 / maxDistance) * (radarH - 35);
  const r20Y = egoY - (20 / maxDistance) * (radarH - 35);
  const r40Y = egoY - (40 / maxDistance) * (radarH - 35);

  // Sparkline calculations (15 seconds history)
  const sparklineW = 160;
  const sparklineH = 50;
  const maxPlotZ = 60;
  const minPlotZ = 0;

  const pointsString = history
    .map((pt, idx) => {
      const x = (idx / Math.max(1, history.length - 1)) * sparklineW;
      const normalizedY = 1 - Math.min(1, Math.max(0, (pt.distance - minPlotZ) / (maxPlotZ - minPlotZ)));
      const y = 8 + normalizedY * (sparklineH - 16);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Danger threshold line Y (12m)
  const dangerY = 8 + (1 - 12 / maxPlotZ) * (sparklineH - 16);
  // Warning threshold line Y (25m)
  const warningY = 8 + (1 - 25 / maxPlotZ) * (sparklineH - 16);

  return (
    <div className="flex flex-col gap-2 pointer-events-auto select-none">
      {/* 2D Bird's-Eye View (BEV) Radar */}
      <div className="relative overflow-hidden rounded-xl glass-panel p-3 w-[150px] shadow-xl">
        <div className="flex items-center justify-between mb-1.5 text-[10px] font-mono text-gray-300">
          <div className="flex items-center gap-1 text-cyan-400 font-bold">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>BEV RADAR</span>
          </div>
          <span className="text-gray-400">65m MAX</span>
        </div>

        {/* Radar Screen SVG */}
        <div className="relative w-full h-[140px] bg-slate-950/70 rounded-lg overflow-hidden border border-white/10">
          {/* Radial grid circles & scanlines */}
          <svg className="w-full h-full" viewBox={`0 0 ${radarW} ${radarH}`}>
            {/* Range Arc 40m */}
            <path
              d={`M 15 ${r40Y} Q ${egoX} ${r40Y - 8} ${radarW - 15} ${r40Y}`}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeDasharray="2 3"
            />
            <text x="6" y={r40Y + 3} fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="monospace">
              40m
            </text>

            {/* Range Arc 20m */}
            <path
              d={`M 22 ${r20Y} Q ${egoX} ${r20Y - 6} ${radarW - 22} ${r20Y}`}
              fill="none"
              stroke="rgba(245,158,11,0.25)"
              strokeDasharray="2 3"
            />
            <text x="6" y={r20Y + 3} fill="rgba(245,158,11,0.5)" fontSize="8" fontFamily="monospace">
              20m
            </text>

            {/* Range Arc 10m (Danger Zone) */}
            <path
              d={`M 28 ${r10Y} Q ${egoX} ${r10Y - 5} ${radarW - 28} ${r10Y}`}
              fill="none"
              stroke="rgba(239,68,68,0.4)"
            />
            <text x="6" y={r10Y + 3} fill="rgba(239,68,68,0.7)" fontSize="8" fontFamily="monospace">
              10m
            </text>

            {/* Lane corridor guides */}
            <line x1={egoX - 22} y1={egoY} x2={egoX - 12} y2="10" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
            <line x1={egoX + 22} y1={egoY} x2={egoX + 12} y2="10" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />

            {/* Ego Vehicle (Blue Marker) */}
            <rect
              x={egoX - 7}
              y={egoY - 10}
              width="14"
              height="18"
              rx="2.5"
              fill="#0284c7"
              stroke="#38bdf8"
              strokeWidth="1.2"
            />
            <text x={egoX} y={egoY + 4} fill="#e0f2fe" fontSize="7" fontWeight="bold" textAnchor="middle">
              EGO
            </text>

            {/* Lead Vehicle (Dynamic Marker with glow) */}
            <g className="transition-all duration-75">
              <rect
                x={leadX - 8}
                y={leadY - 6}
                width="16"
                height="12"
                rx="2"
                fill={currentConfig.hex}
                stroke="#ffffff"
                strokeWidth="1"
                filter="drop-shadow(0 0 4px rgba(255,255,255,0.5))"
              />
              {/* Target distance label in radar */}
              <text
                x={leadX}
                y={leadY - 9}
                fill={currentConfig.hex}
                fontSize="8"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {Math.round(Z_kalman)}m
              </text>
            </g>
          </svg>

          {/* Radar Scanning Line Animation */}
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[110px] h-[110px] rounded-full pointer-events-none opacity-20 border border-cyan-400/40"
            style={{
              background: 'conic-gradient(from 0deg at 50% 50%, rgba(34,211,238,0.25) 0deg, transparent 70deg)',
              animation: 'radarSweep 2.8s linear infinite',
            }}
          />
        </div>
      </div>

      {/* 15-Second Distance History Sparkline */}
      <div className="relative overflow-hidden rounded-xl glass-panel p-3 w-[184px] shadow-xl">
        <div className="flex items-center justify-between mb-1 text-[10px] font-mono text-gray-300">
          <div className="flex items-center gap-1 text-emerald-400 font-semibold">
            <Activity className="w-3 h-3" />
            <span>DISTANCE 15s</span>
          </div>
          <span className="text-gray-400 tabular-nums">{Z_kalman.toFixed(1)}m</span>
        </div>

        <div className="relative w-full h-[52px] bg-slate-950/70 rounded-lg overflow-hidden border border-white/10 p-0.5">
          <svg className="w-full h-full" viewBox={`0 0 ${sparklineW} ${sparklineH}`} preserveAspectRatio="none">
            {/* Warning line (25m) */}
            <line
              x1="0"
              y1={warningY}
              x2={sparklineW}
              y2={warningY}
              stroke="rgba(245,158,11,0.3)"
              strokeDasharray="2 3"
              strokeWidth="0.8"
            />
            {/* Danger line (12m) */}
            <line
              x1="0"
              y1={dangerY}
              x2={sparklineW}
              y2={dangerY}
              stroke="rgba(239,68,68,0.4)"
              strokeDasharray="2 3"
              strokeWidth="0.8"
            />

            {/* Sparkline curve */}
            {pointsString && (
              <polyline
                fill="none"
                stroke={currentConfig.hex}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pointsString}
                className="transition-all duration-150"
              />
            )}

            {/* Latest point dot */}
            {history.length > 0 && (
              <circle
                cx={sparklineW}
                cy={8 + (1 - Math.min(1, Math.max(0, Z_kalman / maxPlotZ))) * (sparklineH - 16)}
                r="3"
                fill={currentConfig.hex}
                stroke="#ffffff"
                strokeWidth="1"
              />
            )}
          </svg>

          {/* Sparkline Y-axis indicators */}
          <div className="absolute top-0.5 left-1 text-[7px] font-mono text-gray-500">60m</div>
          <div className="absolute top-[18px] right-1 text-[7px] font-mono text-amber-500/80">25m</div>
          <div className="absolute top-[32px] right-1 text-[7px] font-mono text-red-500/80">12m</div>
        </div>
      </div>
    </div>
  );
};
