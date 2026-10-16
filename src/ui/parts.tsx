import { useRef } from 'react';
import type { Delegate, Frame, Status } from '../types.ts';
import { CONFIG } from '../config.ts';
import { formatDistance } from '../geometry.ts';
import { headwayS, REG_SOURCE, type AlertLevel } from '../alert.ts';

type Tone = 'neutral' | 'ok' | 'warn' | 'danger';
const TONE_TEXT: Record<Tone, string> = { neutral: 'text-muted', ok: 'text-ok', warn: 'text-warn', danger: 'text-danger' };
const btn = 'min-h-11 rounded-lg px-3 text-sm font-medium border border-border bg-surface text-text hover:bg-border inline-flex items-center justify-center gap-2';

// SPEC 7.2 — chữ hiển thị thay cho con số khi không có khoảng cách hợp lệ.
const COPY: Record<Status, { title: string; sub: string; tone: Tone }> = {
  'loading': { title: 'Đang tải mô hình…', sub: 'Mô hình chạy trên thiết bị', tone: 'neutral' },
  'model-error': { title: 'Không tải được mô hình', sub: '', tone: 'danger' },
  'no-video': { title: 'Chọn một video', sub: 'Bấm clip KITTI bên dưới', tone: 'neutral' },
  'uncalibrated': { title: 'Chưa hiệu chuẩn', sub: 'Bấm ⚙ để nhập thông số camera', tone: 'warn' },
  'no-vehicle': { title: 'Không phát hiện xe', sub: '', tone: 'neutral' },
  'no-lead': { title: 'Không có xe phía trước', sub: '', tone: 'neutral' },
  'too-close': { title: 'Quá gần', sub: 'Đáy xe ra ngoài khung hình', tone: 'danger' },
  'above-horizon': { title: 'Không tính được', sub: 'Kiểm tra hiệu chuẩn', tone: 'warn' },
  'out-of-range': { title: `> ${CONFIG.MAX_RANGE_M} m`, sub: 'Ngoài tầm đo tin cậy', tone: 'neutral' },
  'ok': { title: '', sub: '', tone: 'ok' },
};

const ALERT: Record<AlertLevel, { title: string; tone: Tone; bg: string }> = {
  'below': { title: '⚠ DƯỚI KHOẢNG CÁCH TỐI THIỂU', tone: 'danger', bg: 'bg-danger/20 border-danger' },
  'near': { title: 'Sát mức tối thiểu', tone: 'warn', bg: 'bg-warn/15 border-warn' },
  'meets': { title: '✓ Đủ khoảng cách tối thiểu', tone: 'ok', bg: 'bg-ok/10 border-ok' },
  'none-seen': { title: 'Không thấy xe phía trước', tone: 'neutral', bg: 'bg-surface border-border' },
  'no-rule': { title: 'Dưới 60 km/h — không có mức quy định', tone: 'neutral', bg: 'bg-surface border-border' },
  'unknown': { title: 'Chưa đánh giá được', tone: 'neutral', bg: 'bg-surface border-border' },
};
const SPEEDS = [0, 40, 50, 60, 70, 80, 90, 100, 110, 120];

export function TopBar(p: { delegate: Delegate | null; ready: boolean; onCalib: () => void; onFile: (f: File) => void }) {
  const chip = 'rounded-full border border-border px-3 py-1 text-xs';
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <header className="flex items-center justify-between gap-2 py-2">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold tracking-tight">SafeLens</h1>
        <span className={`${chip} text-text`}>{p.delegate ?? '—'}</span>
        {p.ready && <span className={`${chip} text-ok`}>On-device</span>}
      </div>
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept="video/mp4,video/*" className="hidden" aria-label="Tải video"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onFile(f); e.target.value = ''; }} />
        <button type="button" className={btn} onClick={() => fileRef.current?.click()} aria-label="Tải video của bạn">⬆</button>
        <button type="button" className={btn} onClick={p.onCalib} aria-label="Hiệu chuẩn">⚙</button>
      </div>
    </header>
  );
}

export function Hud(p: {
  status: Status; frame: Frame | null; error: string | null; onRetry: () => void;
  speedKmh: number; speedSource: string | null; onSpeed: (v: number) => void;
  level: AlertLevel; minM: number | null; d: number | null; sigma: number; gtM: number | null | undefined;
}) {
  const c = COPY[p.status];
  const a = ALERT[p.level];
  const hw = p.d !== null && p.speedKmh > 0 ? headwayS(p.d, p.speedKmh) : null;
  let sub = c.sub;
  if (p.status === 'model-error') sub = p.error ?? '';
  else if (p.status === 'no-lead') sub = `Có ${p.frame?.dets.length ?? 0} xe ngoài vùng phía trước`;
  const label = 'text-[11px] uppercase tracking-wider text-muted';
  return (
    <div className="grid grid-cols-2 content-start gap-2">
      <section aria-label="Tốc độ" className="rounded-xl border border-border bg-surface p-3 [@media(max-height:500px)]:p-2">
        <div className={label}>Tốc độ xe</div>
        {p.speedSource ? (
          <>
            <div className="text-5xl font-bold leading-none tabular-nums [@media(max-height:500px)]:text-4xl">{Math.round(p.speedKmh)}<span className="ml-1 text-base text-muted">km/h</span></div>
            <div className="mt-1 text-[11px] text-muted">{p.speedSource}</div>
          </>
        ) : (
          <select aria-label="Tốc độ (nhập tay)" className={`${btn} mt-1 w-full`} value={p.speedKmh} onChange={(e) => p.onSpeed(Number(e.target.value))}>
            {SPEEDS.map((v) => <option key={v} value={v}>{v === 0 ? 'Nhập tốc độ (video không có dữ liệu)' : `${v} km/h (nhập tay)`}</option>)}
          </select>
        )}
      </section>

      <section aria-label="Khoảng cách" className="rounded-xl border border-border bg-surface p-3 [@media(max-height:500px)]:p-2">
        <div className={label}>Khoảng cách</div>
        {p.d !== null ? (
          <div className="text-5xl font-bold leading-none tabular-nums [@media(max-height:500px)]:text-4xl">
            {formatDistance(p.d).replace(' m', '')}<span className="ml-1 text-base text-muted">m</span>
          </div>
        ) : (
          <div aria-live="polite" className={`text-xl font-semibold leading-tight ${TONE_TEXT[c.tone]}`}>{c.title}</div>
        )}
        <p className="mt-1 text-xs text-muted tabular-nums">
          {p.d !== null ? `±${Math.max(0.5, Math.round(p.sigma * 2) / 2)} m · ${p.frame?.lead?.label ?? ''} ${Math.round((p.frame?.lead?.score ?? 0) * 100)}%` : sub}
        </p>
        {p.gtM !== undefined && (
          <p className="mt-1 text-xs tabular-nums">
            LiDAR thật: {p.gtM !== null ? `${p.gtM.toFixed(1)} m` : '—'}
            {p.gtM !== null && p.d !== null && <span className="text-muted"> · sai số {(p.d - p.gtM).toFixed(1)} m</span>}
          </p>
        )}
        {p.status === 'model-error' && <button type="button" className={`${btn} mt-2`} onClick={p.onRetry}>Thử lại</button>}
      </section>

      <section aria-label="Cảnh báo" className={`col-span-2 rounded-xl border-2 p-3 [@media(max-height:500px)]:p-2 ${a.bg}`}>
        <p aria-live="polite" className={`text-lg font-bold leading-tight ${TONE_TEXT[a.tone]}`}>{p.speedKmh > 0 ? a.title : 'Chưa có tốc độ'}</p>
        <p className="mt-1 text-xs text-muted tabular-nums">
          {p.minM !== null ? `Tối thiểu ${p.minM} m` : 'Mức quy định: ≥ 60 km/h'}
          {p.d !== null && p.minM !== null && ` · đạt ${Math.round((p.d / p.minM) * 100)}%`}
          {hw !== null && ` · giãn cách ${hw.toFixed(1)} s`}
        </p>
        <p className="mt-1 text-[10px] text-muted [@media(max-height:500px)]:hidden">Theo {REG_SOURCE} (đường khô). Tham khảo.</p>
      </section>

      <p className="col-span-2 text-center text-[11px] text-muted tabular-nums">
        {p.frame ? `Suy luận ${Math.round(p.frame.inferMs)} ms · ${p.frame.detectHz} Hz · ${p.frame.dets.length} xe` : '—'}
      </p>
    </div>
  );
}

export type Demo = { id: string; label: string; mp4: string; json?: string; maxKmh?: number };

export function DemoStrip(p: { demos: Demo[]; current: string | null; playing: boolean; hasVideo: boolean; onPick: (d: Demo) => void; onToggle: () => void }) {
  return (
    <nav aria-label="Video demo" className="flex items-center gap-2 overflow-x-auto py-2">
      <button type="button" className={`${btn} shrink-0 disabled:opacity-50`} disabled={!p.hasVideo} onClick={p.onToggle} aria-label={p.playing ? 'Tạm dừng' : 'Phát'}>
        {p.playing ? '❚❚' : '▶'}
      </button>
      {p.demos.length === 0 && <span className="text-sm text-muted">Chưa có clip demo — bấm ⬆ để tải video</span>}
      {p.demos.map((d) => {
        const on = p.current?.endsWith(d.mp4);
        return (
          <button key={d.id} type="button" onClick={() => p.onPick(d)} aria-pressed={on}
            className={`${btn} shrink-0 ${on ? 'border-accent bg-accent/15' : ''}`}>
            {d.label}{d.maxKmh ? <span className="text-xs text-muted">≤{Math.round(d.maxKmh)} km/h</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
