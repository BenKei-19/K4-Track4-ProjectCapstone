import { useCallback, useEffect, useRef, useState } from 'react';
import type { Calib, Delegate, Frame, Sidecar, Status, VideoState } from './types.ts';
import { CALIB_DEFAULT, CONFIG, DEMO_CALIB } from './config.ts';
import { resolveStatus } from './geometry.ts';
import { alertLevel, requiredMinDistance, sigmaM } from './alert.ts';
import { createDetector } from './detector.ts';
import Viewport from './Viewport.tsx';
import { DemoStrip, Hud, TopBar, type Demo } from './ui/parts.tsx';
import { CalibrationPanel, CalibrationSheet } from './ui/CalibrationPanel.tsx';
import type { ObjectDetector } from '@mediapipe/tasks-vision';

type DetState =
  | { status: 'loading' }
  | { status: 'ready'; detector: ObjectDetector; delegate: Delegate }
  | { status: 'error'; message: string };

const CALIB_KEY = 'safelens.calib';
const BASE = import.meta.env.BASE_URL;
const NO_VIDEO: VideoState = { hasVideo: false, playing: false, width: 0, height: 0 };

const inLimits = (v: unknown, [lo, hi]: readonly [number, number]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function loadCalib(): Calib {
  try {
    const c = JSON.parse(localStorage.getItem(CALIB_KEY) ?? 'null');
    const L = CONFIG.CALIB_LIMITS;
    if (c && inLimits(c.heightM, L.heightM) && inLimits(c.vfovDeg, L.vfovDeg) && inLimits(c.horizonY, L.horizonY) && typeof c.confirmed === 'boolean') {
      return { heightM: c.heightM, vfovDeg: c.vfovDeg, horizonY: c.horizonY, confirmed: c.confirmed };
    }
  } catch { /* storage unavailable or corrupt → default */ }
  return CALIB_DEFAULT;
}

export default function App() {
  const [det, setDet] = useState<DetState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [demos, setDemos] = useState<Demo[]>([]);
  const [src, setSrc] = useState<string | null>(null);
  const [sidecarUrl, setSidecarUrl] = useState<string | null>(null);
  const [sidecar, setSidecar] = useState<Sidecar | null>(null);
  const [calib, setCalib] = useState<Calib>(loadCalib);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [video, setVideo] = useState<VideoState>(NO_VIDEO);
  const [playing, setPlaying] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [manualKmh, setManualKmh] = useState(0);
  const srcRef = useRef<string | null>(null);
  const goodRef = useRef<string | null>(null);   // last source that actually played; kept until a new one works
  const wasPlaying = useRef(false);

  // Detector lifecycle (retry = bump `attempt`).
  useEffect(() => {
    let cancelled = false;
    let opened: ObjectDetector | null = null;
    createDetector().then(
      ({ detector, delegate }) => {
        if (cancelled) { detector.close(); return; }
        opened = detector;
        setDet({ status: 'ready', detector, delegate });
      },
      (e: unknown) => { if (!cancelled) setDet({ status: 'error', message: e instanceof Error ? e.message : String(e) }); },
    );
    return () => { cancelled = true; opened?.close(); };
  }, [attempt]);

  const revoke = (u: string | null) => { if (u?.startsWith('blob:')) URL.revokeObjectURL(u); };
  const changeSrc = (next: string | null, json: string | null = null) => {
    srcRef.current = next;
    setSrc(next);
    setSidecarUrl(json);
    setFrame(null);
    setVideo(NO_VIDEO);
    wasPlaying.current = false;
    setPlaying(next !== null);
  };
  const pickDemo = (d: Demo) => changeSrc(BASE + d.mp4, BASE + (d.json ?? d.mp4.replace(/\.mp4$/, '.json')));

  // Danh sách clip demo (KITTI) → tự phát clip đầu tiên.
  useEffect(() => {
    fetch(`${BASE}demo/index.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Demo[]) => {
        if (!Array.isArray(list)) return;
        setDemos(list);
        if (list[0] && srcRef.current === null) pickDemo(list[0]);
      })
      .catch(() => { /* chưa có demo */ });
  }, []);

  // Sidecar dataset: tốc độ OXTS, ground truth LiDAR và calib gốc của dataset.
  useEffect(() => {
    setSidecar(null);
    if (!sidecarUrl) return;
    let cancelled = false;
    fetch(sidecarUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Sidecar | null) => {
        if (cancelled || !j || !Array.isArray(j.frames) || !j.frames.length || !(j.fps > 0)) return;
        setSidecar(j);
        setCalib({ ...j.calib, confirmed: true });
      })
      .catch(() => { /* không có sidecar → nhập tay */ });
    return () => { cancelled = true; };
  }, [sidecarUrl]);

  useEffect(() => { try { localStorage.setItem(CALIB_KEY, JSON.stringify(calib)); } catch { /* ignore */ } }, [calib]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => () => { revoke(srcRef.current); revoke(goodRef.current); }, []);

  const onVideoState = useCallback((s: VideoState) => {
    setVideo(s);
    if (s.hasVideo && srcRef.current !== goodRef.current) { // new source works → release the old one
      revoke(goodRef.current);
      goodRef.current = srcRef.current;
    }
    // Only follow a real true→false edge (pause/ended); a stale "not playing yet" event must not undo the autoplay request.
    if (wasPlaying.current && !s.playing) setPlaying(false);
    wasPlaying.current = s.playing;
  }, []);
  const onVideoError = useCallback(() => {
    const bad = srcRef.current;
    if (bad !== goodRef.current) revoke(bad);
    changeSrc(goodRef.current);
    setPlaying(false);
    setToast('Không phát được video này — thử MP4 H.264');
  }, []);
  const onDetectorError = useCallback((message: string) => setDet({ status: 'error', message }), []);
  const onHorizonChange = useCallback((y: number) => {
    const [lo, hi] = CONFIG.CALIB_LIMITS.horizonY;
    setCalib((c) => ({ ...c, horizonY: Math.round(Math.min(hi, Math.max(lo, y)) * 1000) / 1000 }));
  }, []);

  const ready = det.status === 'ready';
  const pre = (hasVideo: boolean): Status =>
    resolveStatus({ ready, error: det.status === 'error', hasVideo, calib, dets: [], lead: null, rawDistance: null, imgH: 0, imgW: 0 });
  const status: Status = !ready || !video.hasVideo ? pre(video.hasVideo) : !calib.confirmed ? 'uncalibrated' : (frame?.status ?? pre(true));
  const sideFrame = sidecar && frame ? sidecar.frames[Math.min(sidecar.frames.length - 1, Math.max(0, Math.floor(frame.videoTime * sidecar.fps)))] : null;
  const speedKmh = sidecar ? (sideFrame?.speedKmh ?? 0) : manualKmh;
  const dist = status === 'ok' && frame ? frame.distanceM : null;
  const minM = speedKmh > 0 ? requiredMinDistance(speedKmh) : null;
  const sigma = dist !== null ? sigmaM(dist, calib, video.width, video.height) : 0;
  const level = alertLevel(status, dist, sigma, minM);
  const patchCalib = (p: Partial<Calib>) => setCalib((c) => ({ ...c, ...p }));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col px-4 pb-2 landscape:h-dvh">
      <TopBar delegate={det.status === 'ready' ? det.delegate : null} ready={ready} onCalib={() => setSheetOpen(true)}
        onFile={(f) => changeSrc(URL.createObjectURL(f))} />
      <main className="grid min-h-0 flex-1 gap-3 landscape:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
        <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-black [&_canvas]:block [&_canvas]:h-auto [&_canvas]:max-h-full [&_canvas]:w-auto [&_canvas]:max-w-full">
          {src ? (
            <Viewport src={src} detector={det.status === 'ready' ? det.detector : null} calib={calib} playing={playing}
              onFrame={setFrame} onVideoState={onVideoState} onVideoError={onVideoError}
              onDetectorError={onDetectorError} onHorizonChange={onHorizonChange} />
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 p-4 text-center">
              <p className="text-lg font-semibold">Chưa có video</p>
              <p className="text-sm text-muted">Chọn clip KITTI bên dưới hoặc bấm ⬆</p>
            </div>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto">
          <Hud status={status} frame={frame} error={det.status === 'error' ? det.message : null}
            onRetry={() => { setDet({ status: 'loading' }); setAttempt((a) => a + 1); }}
            speedKmh={speedKmh} speedSource={sidecar ? 'GPS/IMU thật · KITTI OXTS' : null} onSpeed={setManualKmh}
            level={level} minM={minM} d={dist} sigma={sigma} gtM={sidecar ? (sideFrame?.gtRearM ?? null) : undefined} />
        </div>
      </main>
      <DemoStrip demos={demos} current={src} playing={playing} hasVideo={video.hasVideo} onPick={pickDemo} onToggle={() => setPlaying((p) => !p)} />
      {sheetOpen && (
        <CalibrationSheet onClose={() => setSheetOpen(false)}>
          {(closeRef) => (
            <CalibrationPanel calib={calib} onChange={patchCalib} onClose={() => setSheetOpen(false)} closeRef={closeRef}
              onApply={() => { patchCalib({ confirmed: true }); setSheetOpen(false); }}
              onReset={() => setCalib(CALIB_DEFAULT)}
              onPreset={() => DEMO_CALIB && setCalib(DEMO_CALIB)} />
          )}
        </CalibrationSheet>
      )}
      {toast && <div role="status" className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-md rounded-lg border border-danger bg-surface px-4 py-3 text-sm">{toast}</div>}
    </div>
  );
}
