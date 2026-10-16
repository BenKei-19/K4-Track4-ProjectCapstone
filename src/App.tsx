import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Calib, Delegate, Frame, Sidecar, Status, VideoState } from './types.ts';
import { CALIB_DEFAULT, CONFIG, DEMO_CALIB } from './config.ts';
import { resolveStatus } from './geometry.ts';
import { createDetector } from './detector.ts';
import Viewport from './Viewport.tsx';
import { AlertCard, DistanceCard, MetricsRow, SourceBar, TopBar } from './ui/parts.tsx';
import { alertLevel, requiredMinDistance, sigmaM } from './alert.ts';
import { CalibrationPanel, CalibrationSheet } from './ui/CalibrationPanel.tsx';
import type { ObjectDetector } from '@mediapipe/tasks-vision';

type DetState =
  | { status: 'loading' }
  | { status: 'ready'; detector: ObjectDetector; delegate: Delegate }
  | { status: 'error'; message: string };

const CALIB_KEY = 'safelens.calib';
const NO_VIDEO: VideoState = { hasVideo: false, playing: false, width: 0, height: 0 };
const DEMOS = [
  { label: 'KITTI (tốc độ + LiDAR thật)', url: `${import.meta.env.BASE_URL}demo/kitti.mp4` },
  { label: 'Đường phố (drive)', url: `${import.meta.env.BASE_URL}demo/drive.mp4` },
  { label: 'Xe đứng yên (static)', url: `${import.meta.env.BASE_URL}demo/static.mp4` },
];

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

const desktopMq = '(min-width: 1024px)';
const subscribeDesktop = (cb: () => void) => {
  const mq = window.matchMedia(desktopMq);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

export default function App() {
  const [det, setDet] = useState<DetState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [calib, setCalib] = useState<Calib>(loadCalib);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [video, setVideo] = useState<VideoState>(NO_VIDEO);
  const [playing, setPlaying] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [manualKmh, setManualKmh] = useState(0);
  const [sidecar, setSidecar] = useState<Sidecar | null>(null);

  // Clip dataset có file .json cùng tên → dùng tốc độ OXTS, ground truth LiDAR và calib gốc của dataset.
  useEffect(() => {
    setSidecar(null);
    if (!src || src.startsWith('blob:')) return;
    let cancelled = false;
    fetch(src.replace(/\.mp4$/, '.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Sidecar | null) => {
        if (cancelled || !j || !Array.isArray(j.frames) || !j.frames.length || !(j.fps > 0)) return;
        setSidecar(j);
        setCalib({ ...j.calib, confirmed: true });
      })
      .catch(() => { /* không có sidecar → nhập tay */ });
    return () => { cancelled = true; };
  }, [src]);
  const sideFrame = sidecar && frame ? sidecar.frames[Math.min(sidecar.frames.length - 1, Math.max(0, Math.floor(frame.videoTime * sidecar.fps)))] : null;
  const speedKmh = sidecar ? (sideFrame?.speedKmh ?? 0) : manualKmh;
  const isDesktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(desktopMq).matches, () => false);
  const srcRef = useRef<string | null>(null);
  const goodRef = useRef<string | null>(null);   // last source that actually played; kept until a new one works
  const wasPlaying = useRef(false);
  const calibBtnRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => { try { localStorage.setItem(CALIB_KEY, JSON.stringify(calib)); } catch { /* ignore */ } }, [calib]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const revoke = (u: string | null) => { if (u?.startsWith('blob:')) URL.revokeObjectURL(u); };
  useEffect(() => () => { revoke(srcRef.current); revoke(goodRef.current); }, []);

  const changeSrc = (next: string | null) => {
    srcRef.current = next;
    setSrc(next);
    setFrame(null);
    setVideo(NO_VIDEO);
    wasPlaying.current = false;
    setPlaying(next !== null);
  };
  const onFile = (f: File) => changeSrc(URL.createObjectURL(f));

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

  if (isDesktop && sheetOpen) setSheetOpen(false); // else the sheet would reopen on resize back to mobile

  const ready = det.status === 'ready';
  const pre = (hasVideo: boolean): Status =>
    resolveStatus({ ready, error: det.status === 'error', hasVideo, calib, dets: [], lead: null, rawDistance: null, imgH: 0, imgW: 0 });
  const status: Status = !ready || !video.hasVideo ? pre(video.hasVideo) : !calib.confirmed ? 'uncalibrated' : (frame?.status ?? pre(true));
  const dist = status === 'ok' && frame ? frame.distanceM : null;
  const minM = speedKmh > 0 ? requiredMinDistance(speedKmh) : null;
  const sigma = dist !== null ? sigmaM(dist, calib, video.width, video.height) : 0;
  const level = alertLevel(status, dist, sigma, minM);
  const patchCalib = (p: Partial<Calib>) => setCalib((c) => ({ ...c, ...p }));
  const panel = (onClose?: () => void, closeRef?: React.RefObject<HTMLButtonElement | null>) => (
    <CalibrationPanel calib={calib} onChange={patchCalib} onClose={onClose} closeRef={closeRef}
      onApply={() => { patchCalib({ confirmed: true }); onClose?.(); }}
      onReset={() => setCalib(CALIB_DEFAULT)}
      onPreset={() => DEMO_CALIB && setCalib(DEMO_CALIB)} />
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-8">
      <TopBar delegate={det.status === 'ready' ? det.delegate : null} ready={ready} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        <div className="grid min-w-0 gap-3">
          {src ? (
            <div className="overflow-hidden rounded-xl border border-border bg-black [&_canvas]:block [&_canvas]:h-auto [&_canvas]:w-full">
              <Viewport src={src} detector={det.status === 'ready' ? det.detector : null} calib={calib} playing={playing}
                onFrame={setFrame} onVideoState={onVideoState} onVideoError={onVideoError}
                onDetectorError={onDetectorError} onHorizonChange={onHorizonChange} />
            </div>
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface p-4 text-center">
              <p className="text-lg font-semibold">Chưa có video</p>
              <p className="text-sm text-muted">Tải lên MP4 hoặc chọn clip mẫu</p>
            </div>
          )}
          <DistanceCard status={status} frame={frame} error={det.status === 'error' ? det.message : null} onRetry={() => { setDet({ status: 'loading' }); setAttempt((a) => a + 1); }} />
          <AlertCard level={level} speedKmh={speedKmh} minM={minM} d={dist} sigma={sigma} onSpeed={setManualKmh}
            dataset={sidecar ? { name: 'OXTS GPS/IMU · KITTI', gtM: sideFrame?.gtRearM ?? null } : null} />
        </div>
        <div className="grid min-w-0 gap-3">
          <MetricsRow frame={frame} video={video} />
          <SourceBar src={src} demos={DEMOS} playing={playing} hasVideo={video.hasVideo} onFile={onFile} onDemo={changeSrc}
            onToggle={() => setPlaying((p) => !p)} onOpenCalib={() => setSheetOpen(true)} calibBtnRef={calibBtnRef} />
          {isDesktop && <section aria-label="Hiệu chuẩn" className="rounded-xl border border-border bg-surface p-4">{panel()}</section>}
        </div>
      </div>
      {!isDesktop && sheetOpen && (
        <CalibrationSheet onClose={() => setSheetOpen(false)}>{(closeRef) => panel(() => setSheetOpen(false), closeRef)}</CalibrationSheet>
      )}
      {toast && <div role="status" className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-md rounded-lg border border-danger bg-surface px-4 py-3 text-sm">{toast}</div>}
    </div>
  );
}
