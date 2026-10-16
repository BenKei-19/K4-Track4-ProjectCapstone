import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { Det, Frame, Status, VideoState, ViewportProps } from './types.ts';
import { CONFIG } from './config.ts';
import { ema, formatDistance, groundDistance, iou, median, pickLead, resolveStatus, roiPolygon } from './geometry.ts';
import { toDets } from './detector.ts';

const HIT_N = 0.04;     // horizon grab zone, ± fraction of image height
const MAX_FAILS = 10;   // consecutive detectForVideo errors before giving up

// Visually hidden but still rendered: display:none can stop rVFC / decoding in Chromium.
const HIDDEN_VIDEO: CSSProperties = {
  position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none',
};
const CANVAS: CSSProperties = { width: '100%', height: 'auto', display: 'block' };

type Hot = {
  prevLead: Det | null;    // input to pickLead (last detect's lead)
  smoothLead: Det | null;  // lead the EMA series belongs to
  smoothed: number | null;
  lastOkAt: number;
  inferSamples: number[];
  detectTimes: number[];
  lastDetectAt: number;
  lastTs: number;          // last detectForVideo timestamp, kept across resets (must strictly increase)
  fails: number;
  stopped: boolean;
  dets: Det[] | null;      // last raw detections (re-evaluated when calib changes while paused)
  frame: Frame | null;     // last emitted frame, drawn until the next detect
};

const freshHot = (lastTs = 0): Hot => ({
  prevLead: null, smoothLead: null, smoothed: null, lastOkAt: -Infinity,
  inferSamples: [], detectTimes: [], lastDetectAt: -Infinity, lastTs,
  fails: 0, stopped: false, dets: null, frame: null,
});

const hasFrame = (v: HTMLVideoElement) => v.readyState >= 2 && v.videoWidth > 0;

const videoState = (v: HTMLVideoElement): VideoState => ({
  hasVideo: hasFrame(v), playing: !v.paused && !v.ended, width: v.videoWidth, height: v.videoHeight,
});

const clampH = (y: number) => {
  const [lo, hi] = CONFIG.CALIB_LIMITS.horizonY;
  return Math.min(hi, Math.max(lo, y));
};

const leadColor = (s: Status) => (s === 'ok' ? '#22c55e' : s === 'out-of-range' ? '#8b98a8' : '#f5b400');

function drawOverlay(ctx: CanvasRenderingContext2D, frame: Frame | null, horizonY: number) {
  const { width: W, height: H } = ctx.canvas;
  const cssW = ctx.canvas.getBoundingClientRect().width;
  const k = cssW > 0 ? W / cssW : 1;
  ctx.save();

  // 1. ROI
  ctx.beginPath();
  roiPolygon(horizonY).forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(59,167,255,0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(59,167,255,0.6)';
  ctx.lineWidth = 1.5 * k;
  ctx.stroke();

  // 2. Horizon
  const hy = horizonY * H;
  ctx.setLineDash([8 * k, 6 * k]);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.moveTo(0, hy);
  ctx.lineTo(W, hy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `${12 * k}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textBaseline = 'bottom';
  ctx.fillText('chân trời', 8 * k, hy - 4 * k);

  if (frame) {
    // 3. Non-lead boxes
    ctx.lineWidth = 1.5 * k;
    ctx.strokeStyle = 'rgba(200,208,218,0.85)';
    for (const d of frame.dets) if (d !== frame.lead) ctx.strokeRect(d.x, d.y, d.w, d.h);

    // 4. Lead box + bottom-center dot + distance (only when ok)
    const L = frame.lead;
    if (L) {
      const c = leadColor(frame.status);
      ctx.lineWidth = 3 * k;
      ctx.strokeStyle = c;
      ctx.strokeRect(L.x, L.y, L.w, L.h);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(L.x + L.w / 2, L.y + L.h, 4 * k, 0, 2 * Math.PI);
      ctx.fill();
      if (frame.status === 'ok' && frame.distanceM !== null) {
        const txt = formatDistance(frame.distanceM);
        ctx.font = `600 ${18 * k}px system-ui, sans-serif`;
        const pad = 6 * k, ph = 26 * k;
        const pw = ctx.measureText(txt).width + 2 * pad;
        const x = Math.min(W - pw, Math.max(0, L.x + L.w / 2 - pw / 2));
        const y = Math.max(0, L.y - ph - 4 * k);
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(x, y, pw, ph);
        ctx.fillStyle = c;
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, x + pad, y + ph / 2);
      }
    }
  }
  ctx.restore();
}

export default function Viewport(props: ViewportProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  const hot = useRef<Hot>(freshHot());
  const still = useRef<(redetect: boolean) => void>(() => {});
  const dragging = useRef(false);

  useLayoutEffect(() => {
    live.current = props;
  });

  // Mount: loop + media listeners. Everything reads props through `live`, so the loop never restarts.
  useEffect(() => {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    // stillFrame: paused/seeked frame → show the raw distance of exactly this frame (no EMA lag).
    const evaluate = (dets: Det[], now: number, stillFrame: boolean) => {
      const h = hot.current;
      const { calib } = live.current;
      const W = canvas.width, H = canvas.height;
      const lead = pickLead(dets, h.prevLead, W, H, calib.horizonY);
      h.prevLead = lead;
      const raw = lead ? groundDistance(lead.y + lead.h, H, calib) : null;
      const status = resolveStatus({ ready: true, error: false, hasVideo: true, calib, dets, lead, rawDistance: raw, imgH: H, imgW: W });
      if (status === 'ok' && lead && raw !== null) {
        const sameLead = h.smoothLead !== null && iou(lead, h.smoothLead) > CONFIG.LEAD_IOU_KEEP;
        if (stillFrame || !sameLead || now - h.lastOkAt > CONFIG.EMA_RESET_MS) h.smoothed = null;
        h.smoothed = ema(h.smoothed, raw);
        h.smoothLead = lead;
        h.lastOkAt = now;
      }
      while (h.detectTimes.length && h.detectTimes[0] <= now - 1000) h.detectTimes.shift();
      const frame: Frame = {
        dets, lead, status,
        distanceM: status === 'ok' ? h.smoothed : null, // honesty rule
        inferMs: median(h.inferSamples),
        detectHz: h.detectTimes.length,
        videoTime: video.currentTime,
      };
      h.frame = frame;
      live.current.onFrame(frame);
    };

    const detect = (stillFrame: boolean) => {
      const h = hot.current;
      const det = live.current.detector;
      if (!det || h.stopped || !hasFrame(video)) return;
      let t = performance.now();
      if (t <= h.lastTs) t = h.lastTs + 1;
      h.lastTs = t;
      h.lastDetectAt = t;
      let result;
      try {
        const t0 = performance.now();
        result = det.detectForVideo(video, t);
        h.inferSamples.push(performance.now() - t0);
      } catch (e) {
        console.error('detectForVideo failed:', e);
        if (++h.fails > MAX_FAILS) {
          h.stopped = true;
          live.current.onDetectorError(`Lỗi nhận diện liên tiếp: ${e instanceof Error ? e.message : String(e)}`);
        }
        return;
      }
      h.fails = 0;
      if (h.inferSamples.length > CONFIG.INFER_WINDOW) h.inferSamples.shift();
      h.detectTimes.push(t);
      h.dets = toDets(result);
      evaluate(h.dets, t, stillFrame);
    };

    const paint = () => {
      if (!hasFrame(video)) return;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      ctx.drawImage(video, 0, 0);
      drawOverlay(ctx, hot.current.frame, live.current.calib.horizonY);
    };

    still.current = (redetect) => {
      const h = hot.current;
      if (redetect || !h.dets) detect(true);
      else if (h.dets && live.current.detector && !h.stopped) evaluate(h.dets, performance.now(), true);
      paint();
    };

    const useRvfc = 'requestVideoFrameCallback' in video;
    let rvfc = 0, raf = 0, alive = true;
    const schedule = () => {
      if (!alive) return;
      if (useRvfc) rvfc = video.requestVideoFrameCallback(tick);
      else raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      if (!video.paused && hasFrame(video)) {
        if (performance.now() - hot.current.lastDetectAt >= CONFIG.DETECT_MIN_INTERVAL_MS) detect(false);
        paint();
      }
      schedule();
    };
    const rearm = () => {
      if (useRvfc) video.cancelVideoFrameCallback(rvfc);
      else cancelAnimationFrame(raf);
      schedule();
    };

    const emit = () => live.current.onVideoState(videoState(video));
    const on: Record<string, () => void> = {
      loadedmetadata: () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        emit();
      },
      loadeddata: () => { emit(); still.current(true); },
      play: () => { emit(); rearm(); }, // pending rVFC may be dropped across a src change
      pause: () => { emit(); still.current(true); },
      seeked: () => still.current(true),
      ended: emit,
      emptied: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); emit(); },
      error: () => {
        const e = video.error;
        live.current.onVideoError(`Không phát được video (mã ${e?.code ?? '?'})${e?.message ? `: ${e.message}` : ''}`);
      },
    };
    for (const [type, fn] of Object.entries(on)) video.addEventListener(type, fn);

    // touch-action set at pointerdown is too late on mobile; cancel the touch near the horizon so the page doesn't scroll.
    const onTouchStart = (e: TouchEvent) => {
      if (!live.current.onHorizonChange || e.touches.length !== 1) return;
      const r = canvas.getBoundingClientRect();
      if (r.height > 0 && Math.abs((e.touches[0].clientY - r.top) / r.height - live.current.calib.horizonY) <= HIT_N) e.preventDefault();
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });

    schedule();
    return () => {
      alive = false;
      if (useRvfc) video.cancelVideoFrameCallback(rvfc);
      else cancelAnimationFrame(raf);
      for (const [type, fn] of Object.entries(on)) video.removeEventListener(type, fn);
      canvas.removeEventListener('touchstart', onTouchStart);
      still.current = () => {};
    };
  }, []);

  // Source change: reset hot state; App owns (and revokes) object URLs.
  useEffect(() => {
    const video = videoRef.current!;
    hot.current = freshHot(hot.current.lastTs);
    if (props.src) video.src = props.src;
    else {
      video.removeAttribute('src');
      video.load(); // fires 'emptied' → canvas cleared, VideoState reported
    }
  }, [props.src]);

  // New detector (ready / retried): clear failure state and old results, detect the visible frame.
  useEffect(() => {
    hot.current = freshHot(hot.current.lastTs);
    still.current(true);
  }, [props.detector]);

  // Calib changed while paused/ended: the loop isn't running, so re-evaluate cached dets, emit a Frame, redraw.
  const { heightM, vfovDeg, horizonY, confirmed } = props.calib;
  useEffect(() => {
    if (videoRef.current?.paused) still.current(false);
  }, [heightM, vfovDeg, horizonY, confirmed]);

  useEffect(() => {
    const v = videoRef.current!;
    if (props.playing && props.src) {
      v.play().catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return; // interrupted by pause/src change
        console.warn('video.play() rejected:', e);
        live.current.onVideoState(videoState(v));
      });
    } else v.pause();
  }, [props.playing, props.src]);

  const yNOf = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return r.height > 0 ? (e.clientY - r.top) / r.height : NaN;
  };
  const nearHorizon = (yN: number) => Math.abs(yN - live.current.calib.horizonY) <= HIT_N;

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const yN = yNOf(e);
    if (!props.onHorizonChange || !nearHorizon(yN)) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.touchAction = 'none';
    props.onHorizonChange(clampH(yN));
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const yN = yNOf(e);
    if (dragging.current) {
      if (!Number.isNaN(yN)) props.onHorizonChange?.(clampH(yN));
      return;
    }
    if (e.pointerType === 'mouse') e.currentTarget.style.cursor = props.onHorizonChange && nearHorizon(yN) ? 'ns-resize' : '';
  };
  const endDrag = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.style.touchAction = '';
  };

  return (
    <div style={{ position: 'relative' }}>
      <video ref={videoRef} muted playsInline loop preload="auto" style={HIDDEN_VIDEO} aria-hidden="true" />
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Video phân tích với khung xe phát hiện"
        style={CANVAS}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  );
}
