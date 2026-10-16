import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Cpu, Gauge, Sliders, Sparkles } from 'lucide-react';
import type {
  AdasTelemetry,
  CameraCalibration,
  DetectionModelType,
  FusionWeights,
} from '../types/adas';

interface TelemetryInspectorProps {
  telemetry: AdasTelemetry;
  calibration: CameraCalibration;
  onUpdateCalibration: (updates: Partial<CameraCalibration>) => void;
  weights: FusionWeights;
  onUpdateWeights: (updates: Partial<FusionWeights>) => void;
  onSelectModel: (model: DetectionModelType) => void;
}

export const TelemetryInspector: React.FC<TelemetryInspectorProps> = ({
  telemetry,
  calibration,
  onUpdateCalibration,
  weights,
  onUpdateWeights,
  onSelectModel,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'weights' | 'matrix'>('weights');

  const {
    detectionModel,
    confidence,
    inferenceMs,
    rawBBox,
    v_bottom,
    w_px,
    Z_y,
    Z_w,
    Z_raw,
    Z_kalman,
    uncertaintyM,
    TTC,
  } = telemetry;

  return (
    <div className="absolute top-5 right-5 z-30 select-none font-mono text-xs text-slate-200">
      <div className="relative glass-panel rounded-xl shadow-2xl border border-white/15 overflow-hidden transition-all duration-300 w-[330px] sm:w-[360px]">
        {/* Header bar with toggle */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900/80 cursor-pointer border-b border-white/10 hover:bg-slate-800/80 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="font-bold tracking-wider text-cyan-300 text-[11px] uppercase">
              CALCULATION WEIGHTS & TELEMETRY
            </span>
          </div>

          <button className="text-gray-400 hover:text-white transition-colors cursor-pointer">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {isExpanded && (
          <div className="p-3.5 flex flex-col gap-3.5 max-h-[calc(100vh-140px)] overflow-y-auto">
            {/* 1. [AI DETECTION ENGINE] */}
            <div className="rounded-lg bg-black/40 p-2.5 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-cyan-400 tracking-wider">
                  [1] AI DETECTION ENGINE
                </span>
                <span className="text-[10px] text-gray-400">
                  Inf: <span className="text-cyan-300 font-semibold">{inferenceMs} ms</span>
                </span>
              </div>

              {/* Model Selector buttons */}
              <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                <button
                  onClick={() => onSelectModel('YOLOv8n-KITTI')}
                  className={`px-2 py-1 text-[10px] rounded font-semibold transition-all cursor-pointer ${
                    detectionModel === 'YOLOv8n-KITTI'
                      ? 'bg-cyan-500/30 border border-cyan-400 text-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                      : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  YOLOv8n-KITTI
                </button>
                <button
                  onClick={() => onSelectModel('COCO-SSD')}
                  className={`px-2 py-1 text-[10px] rounded font-semibold transition-all cursor-pointer ${
                    detectionModel === 'COCO-SSD'
                      ? 'bg-cyan-500/30 border border-cyan-400 text-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                      : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  COCO-SSD (Browser)
                </button>
              </div>

              {/* Confidence Progress Bar */}
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-gray-400">Confidence (W_conf):</span>
                <span className="text-emerald-400 font-bold">{confidence.toFixed(2)}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mb-2">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, confidence * 100)}%` }}
                />
              </div>

              {/* Raw Bounding Box telemetry */}
              <div className="grid grid-cols-2 gap-2 text-[10px] pt-1.5 border-t border-white/5">
                <div>
                  <span className="text-gray-500">BBox Raw: </span>
                  <span className="text-gray-300">
                    [{rawBBox.x1}, {rawBBox.y1}, {rawBBox.x2}, {rawBBox.y2}]
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">v_bottom (y₂): </span>
                  <span className="text-cyan-300 font-semibold">{v_bottom} px</span>
                </div>
                <div>
                  <span className="text-gray-500">Vehicle w_px: </span>
                  <span className="text-cyan-300 font-semibold">{w_px} px</span>
                </div>
                <div>
                  <span className="text-gray-500">Status: </span>
                  <span className="text-emerald-400">TRACKING</span>
                </div>
              </div>
            </div>

            {/* Sub-Tabs: Fusion & Filter Weights vs Camera Calibration */}
            <div className="flex items-center gap-1 border-b border-white/10 pb-1 text-[11px]">
              <button
                onClick={() => setActiveTab('weights')}
                className={`px-2.5 py-1 rounded flex items-center gap-1 cursor-pointer transition-colors ${
                  activeTab === 'weights' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Sliders className="w-3 h-3" />
                Weights & Kalman
              </button>
              <button
                onClick={() => setActiveTab('matrix')}
                className={`px-2.5 py-1 rounded flex items-center gap-1 cursor-pointer transition-colors ${
                  activeTab === 'matrix' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Gauge className="w-3 h-3" />
                Calibration Matrix
              </button>
            </div>

            {/* 2. [FUSION & FILTER WEIGHTS TAB] */}
            {activeTab === 'weights' && (
              <div className="rounded-lg bg-black/40 p-2.5 border border-white/10 flex flex-col gap-2.5">
                <span className="text-[10px] font-bold text-amber-400 tracking-wider">
                  [2] FUSION & FILTER WEIGHTS (REAL-TIME SLIDERS)
                </span>

                {/* Ground Weight w_y slider */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-gray-300">Ground Weight (w_y):</span>
                    <span className="text-amber-300 font-bold">{weights.w_y.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weights.w_y}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      onUpdateWeights({ w_y: val, w_w: Number((1 - val).toFixed(2)) });
                    }}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
                  />
                  <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                    <span>w_w (Width) = {(1 - weights.w_y).toFixed(2)}</span>
                    <span>w_y = {weights.w_y.toFixed(2)}</span>
                  </div>
                </div>

                {/* Kalman Gain K_gain slider */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-gray-300">Kalman Gain (K_gain):</span>
                    <span className="text-amber-300 font-bold">{weights.K_gain.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={weights.K_gain}
                    onChange={(e) => onUpdateWeights({ K_gain: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
                  />
                  <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                    <span>0.05 (Đầm/Trễ)</span>
                    <span>1.0 (Nhạy/Nhiễu)</span>
                  </div>
                </div>

                {/* Auto Confidence Weighting Toggle */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px]">
                  <span className="text-gray-400">Thích ứng theo Confidence:</span>
                  <button
                    onClick={() => onUpdateWeights({ autoWeightByConf: !weights.autoWeightByConf })}
                    className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${
                      weights.autoWeightByConf ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-white/5 text-gray-400'
                    }`}
                  >
                    {weights.autoWeightByConf ? 'BẬT' : 'TẮT'}
                  </button>
                </div>
              </div>
            )}

            {/* 3. [CAMERA CALIBRATION MATRIX TAB] */}
            {activeTab === 'matrix' && (
              <div className="rounded-lg bg-black/40 p-2.5 border border-white/10 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-purple-400 tracking-wider">
                  [3] CAMERA INTRINSICS / EXTRINSICS
                </span>

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="bg-white/5 p-1.5 rounded">
                    <div className="text-gray-400">Tiêu cự f_y:</div>
                    <div className="text-purple-300 font-semibold">{calibration.f_y} px</div>
                  </div>
                  <div className="bg-white/5 p-1.5 rounded">
                    <div className="text-gray-400">Tâm quang học c_y:</div>
                    <div className="text-purple-300 font-semibold">{calibration.c_y} px</div>
                  </div>
                  <div className="bg-white/5 p-1.5 rounded">
                    <div className="text-gray-400">Chiều cao H_cam:</div>
                    <div className="text-purple-300 font-semibold">{calibration.H_cam} m</div>
                  </div>
                  <div className="bg-white/5 p-1.5 rounded">
                    <div className="text-gray-400">Góc nghiêng θ:</div>
                    <div className="text-purple-300 font-semibold">{calibration.pitch_deg}°</div>
                  </div>
                </div>

                {/* Quick sliders for live parameter testing */}
                <div className="pt-2 border-t border-white/5 flex flex-col gap-1.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-400">Chỉnh H_cam:</span>
                    <span className="text-purple-300">{calibration.H_cam.toFixed(2)}m</span>
                  </div>
                  <input
                    type="range"
                    min="1.2"
                    max="2.2"
                    step="0.05"
                    value={calibration.H_cam}
                    onChange={(e) => onUpdateCalibration({ H_cam: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-purple-400"
                  />
                </div>
              </div>
            )}

            {/* 4. [LIVE PIPELINE FORMULA OUTPUT] */}
            <div className="rounded-lg bg-gradient-to-br from-slate-900/90 to-black/90 p-2.5 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-cyan-300 tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  [4] LIVE PIPELINE FORMULA OUTPUT
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
                  60 FPS SYNC
                </span>
              </div>

              <div className="flex flex-col gap-1 font-mono text-[11px]">
                <div className="flex justify-between items-center py-0.5 border-b border-white/5">
                  <span className="text-gray-400">Z_y (Ground) :</span>
                  <span className="text-white font-semibold tabular-nums">{Z_y.toFixed(1)} m</span>
                </div>

                <div className="flex justify-between items-center py-0.5 border-b border-white/5">
                  <span className="text-gray-400">Z_w (Width)  :</span>
                  <span className="text-white font-semibold tabular-nums">{Z_w.toFixed(1)} m</span>
                </div>

                <div className="flex justify-between items-center py-0.5 border-b border-white/5">
                  <span className="text-gray-400">Z_raw (Fused):</span>
                  <span className="text-amber-300 font-semibold tabular-nums">{Z_raw.toFixed(1)} m</span>
                </div>

                <div className="flex justify-between items-center py-1 bg-cyan-950/40 px-1 rounded border border-cyan-500/20 mt-0.5">
                  <span className="text-cyan-300 font-bold">Z_kalman (HUD):</span>
                  <span className="text-cyan-200 font-bold text-xs tabular-nums">
                    {Z_kalman.toFixed(1)} m (± {uncertaintyM.toFixed(1)}m)
                  </span>
                </div>

                <div className="flex justify-between items-center py-0.5 mt-0.5">
                  <span className="text-gray-400">TTC (Collision):</span>
                  <span className={`font-bold tabular-nums ${TTC < 3.0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {TTC >= 99.0 ? 'SAFE (>10s)' : `${TTC.toFixed(1)} s`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
