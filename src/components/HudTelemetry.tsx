import React from 'react';
import { AlertCircle, CheckCircle2, ShieldAlert, Volume2, VolumeX, Zap } from 'lucide-react';
import type { AdasTelemetry } from '../types/adas';
import { ALERT_COLORS } from '../services/adasMath';

interface HudTelemetryProps {
  telemetry: AdasTelemetry;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const HudTelemetry: React.FC<HudTelemetryProps> = ({
  telemetry,
  isMuted,
  onToggleMute,
}) => {
  const { alertLevel, Z_kalman, uncertaintyM, egoSpeedKmh, minSafeDistanceM } = telemetry;
  const currentConfig = ALERT_COLORS[alertLevel];

  // Render Alert Badge icon & text
  const renderAlertBadge = () => {
    switch (alertLevel) {
      case 'danger':
        return (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/25 border border-red-500 text-red-400 font-bold text-xs uppercase tracking-wider animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400 animate-bounce" />
            <span>{currentConfig.badgeText}</span>
          </div>
        );
      case 'warning':
        return (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/80 text-amber-300 font-medium text-xs uppercase tracking-wider shadow-[0_0_10px_rgba(245,158,11,0.3)]">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>{currentConfig.badgeText}</span>
          </div>
        );
      case 'safe':
      default:
        return (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/50 text-emerald-400 font-medium text-xs uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{currentConfig.badgeText}</span>
          </div>
        );
    }
  };

  return (
    <div className="absolute top-5 left-5 z-30 select-none">
      <div className="relative overflow-hidden rounded-2xl glass-panel p-5 min-w-[280px] sm:min-w-[320px] transition-all duration-300">
        {/* Subtle decorative glow line at top border matching alert color */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] transition-colors duration-500"
          style={{ backgroundColor: currentConfig.hex, boxShadow: `0 0 10px ${currentConfig.hex}` }}
        />

        {/* Top Header Row: DriveDeck branding & Audio button */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse" />
            <span className="font-mono text-[11px] font-bold tracking-widest text-cyan-300 uppercase">
              DriveDeck xADAS
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono">
              HUD v2.4
            </span>
          </div>

          <button
            onClick={onToggleMute}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition-colors cursor-pointer border border-white/10"
            title={isMuted ? 'Bật âm thanh cảnh báo' : 'Tắt tiếng cảnh báo'}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
          </button>
        </div>

        {/* Alert Status Badge */}
        <div className="mb-2">
          {renderAlertBadge()}
        </div>

        {/* Big Distance Numerical Display */}
        <div className="flex items-baseline gap-2 my-1">
          <span
            className="text-6xl sm:text-7xl font-black tabular-nums tracking-tighter transition-colors duration-300 drop-shadow-md"
            style={{ color: currentConfig.hex }}
          >
            {Math.round(Z_kalman)}
          </span>

          <div className="flex flex-col">
            <span
              className="text-2xl font-bold tracking-normal transition-colors duration-300"
              style={{ color: currentConfig.hex }}
            >
              m
            </span>
            <span className="text-xs font-mono text-gray-400 tabular-nums">
              ± {uncertaintyM.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Speed & Minimum Safe Distance Telemetry (2-second rule) */}
        <div className="pt-2.5 mt-2 border-t border-white/10 flex items-center justify-between text-xs text-gray-300">
          <div className="flex items-center gap-1.5 font-medium">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-white tabular-nums">{egoSpeedKmh}</span>
            <span className="text-gray-400">km/h</span>
          </div>

          <div className="flex items-center gap-1 text-gray-400 font-mono text-[11px]">
            <span>Tối thiểu:</span>
            <span className="text-white font-semibold tabular-nums">{minSafeDistanceM} m</span>
            <span className="text-[10px] text-gray-500">(2s)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
