import React, { useState } from 'react';
import {
  ChevronDown,
  Compass,
  Eye,
  Sliders,
  Upload,
  Video,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type {
  LaneCalibration,
  OperatingMode,
  ScenarioType,
  VideoSource,
} from '../types/adas';
import { PRESET_VIDEOS } from '../constants/presets';

interface DirectorControlsProps {
  isVisible: boolean;
  onToggleVisible: () => void;
  videoSource: VideoSource;
  onSelectVideo: (source: VideoSource) => void;
  operatingMode: OperatingMode;
  onChangeMode: (mode: OperatingMode) => void;
  onTriggerScenario: (scenario: ScenarioType) => void;
  manualDistance: number;
  onChangeManualDistance: (val: number) => void;
  manualOffset: number;
  onChangeManualOffset: (val: number) => void;
  egoSpeed: number;
  onChangeEgoSpeed: (speed: number) => void;
  laneCalibration: LaneCalibration;
  onUpdateLaneCalibration: (updates: Partial<LaneCalibration>) => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const DirectorControls: React.FC<DirectorControlsProps> = ({
  isVisible,
  onToggleVisible,
  videoSource,
  onSelectVideo,
  operatingMode,
  onChangeMode,
  onTriggerScenario,
  manualDistance,
  onChangeManualDistance,
  manualOffset,
  onChangeManualOffset,
  egoSpeed,
  onChangeEgoSpeed,
  laneCalibration,
  onUpdateLaneCalibration,
  isMuted,
  onToggleMute,
}) => {
  const [youtubeInput, setYoutubeInput] = useState('');
  const [showLaneSettings, setShowLaneSettings] = useState(false);

  const handleApplyYoutube = (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeInput.trim()) return;
    onSelectVideo({
      type: 'youtube',
      url: youtubeInput.trim(),
      title: 'Custom YouTube Feed',
    });
    setYoutubeInput('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      onSelectVideo({
        type: 'mp4',
        url,
        title: file.name,
      });
    }
  };

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 select-none">
        <button
          onClick={onToggleVisible}
          className="flex items-center gap-2 px-4 py-2 rounded-full glass-panel text-xs font-mono text-cyan-300 hover:text-white hover:bg-slate-800/80 transition-all cursor-pointer shadow-2xl border border-cyan-500/30"
          title="Bấm hoặc nhấn phím 'H' để mở Director Panel"
        >
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          <span>DIRECTOR PANEL (Phím H)</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-6xl select-none font-mono">
      <div className="glass-panel rounded-2xl p-4 shadow-2xl border border-white/15 backdrop-blur-xl">
        {/* Top Header: Title, Hotkey hint & Close button */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold tracking-wider">
              <Sliders className="w-4 h-4" />
              <span>DEMO DIRECTOR PANEL</span>
            </div>
            <span className="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded bg-white/10 text-gray-300">
              Nhấn phím <kbd className="px-1.5 py-0.5 bg-black/60 rounded text-cyan-300 font-bold">H</kbd> để ẩn bảng khi thuyết trình
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLaneSettings(!showLaneSettings)}
              className={`px-2.5 py-1 text-[11px] rounded flex items-center gap-1.5 cursor-pointer transition-colors border ${
                showLaneSettings
                  ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>Chỉnh góc Làn đường</span>
            </button>

            <button
              onClick={onToggleMute}
              className="p-1.5 rounded bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white border border-white/10 cursor-pointer"
              title="Bật/Tắt âm thanh"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            <button
              onClick={onToggleVisible}
              className="p-1 rounded bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white cursor-pointer"
              title="Thu gọn bảng (Phím H)"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Collapsible Lane Horizon Calibration Tool */}
        {showLaneSettings && (
          <div className="mb-3 p-3 rounded-xl bg-slate-900/90 border border-cyan-500/30 text-xs grid grid-cols-1 sm:grid-cols-4 gap-3 animate-in fade-in duration-200">
            <div>
              <div className="flex justify-between text-gray-300 mb-1">
                <span>Độ cao Chân trời (Horizon Y):</span>
                <span className="text-cyan-300 font-bold">{laneCalibration.horizonY.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.30"
                max="0.65"
                step="0.01"
                value={laneCalibration.horizonY}
                onChange={(e) => onUpdateLaneCalibration({ horizonY: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-gray-300 mb-1">
                <span>Bề rộng Đỉnh làn (Top Width):</span>
                <span className="text-cyan-300 font-bold">{laneCalibration.topWidth.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.25"
                step="0.01"
                value={laneCalibration.topWidth}
                onChange={(e) => onUpdateLaneCalibration({ topWidth: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-gray-300 mb-1">
                <span>Bề rộng Đáy làn (Bottom):</span>
                <span className="text-cyan-300 font-bold">{laneCalibration.bottomWidth.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="0.95"
                step="0.02"
                value={laneCalibration.bottomWidth}
                onChange={(e) => onUpdateLaneCalibration({ bottomWidth: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-gray-300 mb-1">
                <span>Tâm Làn đường (Center X):</span>
                <span className="text-cyan-300 font-bold">{laneCalibration.vanishX.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.35"
                max="0.65"
                step="0.01"
                value={laneCalibration.vanishX}
                onChange={(e) => onUpdateLaneCalibration({ vanishX: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-cyan-400"
              />
            </div>
          </div>
        )}

        {/* Main Grid: Video Inputs + 3 Operating Modes */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
          {/* Left Column: Video Controls (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5 text-gray-300 font-semibold">
              <Video className="w-3.5 h-3.5 text-cyan-400" />
              <span>Nguồn Video Dashcam</span>
              <span className="text-[10px] text-gray-500">({videoSource.type.toUpperCase()})</span>
            </div>

            {/* Preset Buttons */}
            <div className="grid grid-cols-3 gap-1.5">
              {PRESET_VIDEOS.map((preset, idx) => (
                <button
                  key={preset.id || idx}
                  onClick={() => onSelectVideo(preset)}
                  className={`p-1.5 rounded-lg text-[10px] text-left transition-all cursor-pointer border ${
                    videoSource.id === preset.id
                      ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <div className="font-bold truncate">{preset.title.split('(')[0]}</div>
                  <div className="text-[9px] text-gray-400 truncate">{preset.description}</div>
                </button>
              ))}
            </div>

            {/* Custom URL Input & MP4 Upload */}
            <div className="flex items-center gap-2">
              <form onSubmit={handleApplyYoutube} className="flex-1 flex gap-1.5">
                <input
                  type="text"
                  placeholder="Dán link YouTube (URL / ID)..."
                  value={youtubeInput}
                  onChange={(e) => setYoutubeInput(e.target.value)}
                  className="flex-1 bg-black/50 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  Tải
                </button>
              </form>

              <label className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg text-xs text-gray-200 cursor-pointer transition-colors whitespace-nowrap">
                <Upload className="w-3.5 h-3.5 text-cyan-400" />
                <span>Upload MP4</span>
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          </div>

          {/* Right Column: 3 Operating Modes (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-2.5 pl-0 lg:pl-3 lg:border-l border-white/10">
            {/* Mode Tabs */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-gray-300 font-semibold">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Chế độ Vận hành Dữ liệu</span>
              </div>

              <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10">
                <button
                  onClick={() => onChangeMode('auto')}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    operatingMode === 'auto'
                      ? 'bg-cyan-500 text-black shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  [1] Auto Sim
                </button>
                <button
                  onClick={() => onChangeMode('scenario')}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    operatingMode === 'scenario'
                      ? 'bg-cyan-500 text-black shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  [2] Kịch bản
                </button>
                <button
                  onClick={() => onChangeMode('manual')}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    operatingMode === 'manual'
                      ? 'bg-cyan-500 text-black shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  [3] Manual Live
                </button>
              </div>
            </div>

            {/* Mode-specific content */}
            {operatingMode === 'auto' && (
              <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5 text-gray-300">
                <div className="text-[11px]">
                  <span className="text-emerald-400 font-bold">Auto Simulation 60FPS:</span> Thuật toán Lerp + vi nhiễu động học tự động mô phỏng xe trước tăng tốc, giảm tốc, giữ khoảng cách tự nhiên.
                </div>
                <div className="flex items-center gap-2 pl-3">
                  <span className="text-gray-400 whitespace-nowrap">Vận tốc Ego:</span>
                  <input
                    type="range"
                    min="30"
                    max="120"
                    step="2"
                    value={egoSpeed}
                    onChange={(e) => onChangeEgoSpeed(parseInt(e.target.value))}
                    className="w-24 h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-400"
                  />
                  <span className="text-emerald-400 font-bold tabular-nums w-12 text-right">{egoSpeed}km/h</span>
                </div>
              </div>
            )}

            {operatingMode === 'scenario' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={() => onTriggerScenario('cruising')}
                  className="px-2.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-semibold text-[11px] transition-all cursor-pointer text-center"
                >
                  Cruising An toàn (40m)
                </button>
                <button
                  onClick={() => onTriggerScenario('hard_brake')}
                  className="px-2.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/35 border border-red-500/60 text-red-300 font-semibold text-[11px] transition-all cursor-pointer text-center animate-pulse"
                >
                  Phanh gấp (40m → 8m)
                </button>
                <button
                  onClick={() => onTriggerScenario('cut_in')}
                  className="px-2.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/60 text-amber-300 font-semibold text-[11px] transition-all cursor-pointer text-center"
                >
                  Xe cắt mặt (10m)
                </button>
                <button
                  onClick={() => onTriggerScenario('tailgate')}
                  className="px-2.5 py-2 rounded-xl bg-orange-500/20 hover:bg-orange-500/35 border border-orange-500/60 text-orange-300 font-semibold text-[11px] transition-all cursor-pointer text-center"
                >
                  Bám đuôi cao tốc (15m)
                </button>
              </div>
            )}

            {operatingMode === 'manual' && (
              <div className="flex flex-col gap-2 bg-black/40 p-2.5 rounded-xl border border-white/5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-[11px] text-gray-300 mb-1">
                      <span>Khoảng cách (Phím ↑ / ↓):</span>
                      <span className="text-cyan-300 font-bold tabular-nums">{manualDistance} m</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="70"
                      step="1"
                      value={manualDistance}
                      onChange={(e) => onChangeManualDistance(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-cyan-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-gray-300 mb-1">
                      <span>Lệch làn ngang (Phím ← / →):</span>
                      <span className="text-cyan-300 font-bold tabular-nums">{manualOffset.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="-0.8"
                      max="0.8"
                      step="0.05"
                      value={manualOffset}
                      onChange={(e) => onChangeManualOffset(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-cyan-400"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
