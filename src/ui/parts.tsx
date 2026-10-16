import { useRef, type RefObject } from 'react';
import type { Delegate, Frame, Status, VideoState } from '../types.ts';
import { CONFIG } from '../config.ts';
import { formatDistance } from '../geometry.ts';
import { headwayS, REG_SOURCE, type AlertLevel } from '../alert.ts';

type Tone = 'neutral' | 'ok' | 'warn' | 'danger';
const TONE_BORDER: Record<Tone, string> = {
  neutral: 'border-l-muted', ok: 'border-l-ok', warn: 'border-l-warn', danger: 'border-l-danger',
};
const btn = 'min-h-11 rounded-lg px-4 text-sm font-medium border border-border bg-surface text-text hover:bg-border inline-flex items-center justify-center gap-2';

// SPEC 7.2. Subtitles that depend on live data (no-lead, ok, model-error, no-vehicle) are built in DistanceCard.
const COPY: Record<Status, { title: string; sub: string; tone: Tone }> = {
  'loading': { title: 'Đang tải mô hình…', sub: 'Mô hình chạy trên thiết bị, không cần mạng', tone: 'neutral' },
  'model-error': { title: 'Không tải được mô hình', sub: '', tone: 'danger' },
  'no-video': { title: 'Chưa có video', sub: 'Tải lên MP4 hoặc chọn clip mẫu', tone: 'neutral' },
  'uncalibrated': { title: 'Chưa hiệu chuẩn', sub: 'Nhập chiều cao camera, góc nhìn và căn đường chân trời', tone: 'warn' },
  'no-vehicle': { title: 'Không phát hiện xe', sub: '', tone: 'neutral' },
  'no-lead': { title: 'Không có xe phía trước', sub: '', tone: 'neutral' },
  'too-close': { title: 'Quá gần', sub: 'Đáy xe ra ngoài khung hình, không ước lượng được', tone: 'warn' },
  'above-horizon': { title: 'Không tính được', sub: 'Đáy xe ở trên đường chân trời — kiểm tra hiệu chuẩn', tone: 'warn' },
  'out-of-range': { title: `> ${CONFIG.MAX_RANGE_M} m`, sub: 'Ngoài tầm đo tin cậy', tone: 'neutral' },
  'ok': { title: '', sub: '', tone: 'ok' },
};

export function TopBar({ delegate, ready }: { delegate: Delegate | null; ready: boolean }) {
  const chip = 'rounded-full border border-border px-3 py-1 text-xs';
  return (
    <header className="flex items-center justify-between gap-2 py-3">
      <h1 className="text-xl font-bold tracking-tight">SafeLens</h1>
      <div className="flex items-center gap-2">
        <span className={`${chip} text-text`}>{delegate ?? '—'}</span>
        {ready && <span className={`${chip} text-ok`}>On-device</span>}
      </div>
    </header>
  );
}

export function DistanceCard(p: { status: Status; frame: Frame | null; error: string | null; onRetry: () => void }) {
  const { status, frame } = p;
  const c = COPY[status];
  const dist = status === 'ok' && frame !== null ? frame.distanceM : null; // the only place a number can come from
  let sub = c.sub;
  if (status === 'model-error') sub = p.error ?? 'Lỗi không xác định';
  else if (status === 'no-lead') sub = `Có ${frame?.dets.length ?? 0} xe ngoài vùng phía trước`;
  else if (status === 'ok') sub = frame?.lead ? `Xe trong vùng phía trước · ${frame.lead.label} ${Math.round(frame.lead.score * 100)}%` : 'Xe trong vùng phía trước';
  const big = 'tabular-nums text-[56px] leading-none font-bold';
  return (
    <section aria-label="Khoảng cách" className={`rounded-xl border border-border border-l-4 bg-surface p-4 ${TONE_BORDER[c.tone]}`}>
      {dist !== null && <div className={big}>{formatDistance(dist)}</div>}
      <div aria-live="polite" className={dist !== null ? 'sr-only' : status === 'out-of-range' ? big : 'text-2xl font-semibold leading-tight'}>
        {dist !== null ? 'Đã ước lượng khoảng cách' : c.title}
      </div>
      {sub && <p className="mt-2 text-sm text-muted">{sub}</p>}
      {status === 'model-error' && <button type="button" className={`${btn} mt-3`} onClick={p.onRetry}>Thử lại</button>}
    </section>
  );
}

const ALERT: Record<AlertLevel, { title: string; tone: Tone; bg: string }> = {
  'below': { title: '⚠ Dưới khoảng cách tối thiểu', tone: 'danger', bg: 'bg-danger/15' },
  'near': { title: 'Sát mức tối thiểu', tone: 'warn', bg: 'bg-warn/10' },
  'meets': { title: '✓ Đủ khoảng cách tối thiểu', tone: 'ok', bg: 'bg-surface' },
  'none-seen': { title: 'Không thấy xe phía trước trong tầm đo', tone: 'neutral', bg: 'bg-surface' },
  'no-rule': { title: 'Không có mức quy định ở tốc độ này', tone: 'neutral', bg: 'bg-surface' },
  'unknown': { title: 'Chưa đánh giá được', tone: 'neutral', bg: 'bg-surface' },
};
const SPEEDS = [0, 40, 50, 60, 70, 80, 90, 100, 110, 120];

export function AlertCard(p: {
  level: AlertLevel; speedKmh: number; minM: number | null; d: number | null; sigma: number; onSpeed: (v: number) => void;
  dataset: { name: string; gtM: number | null } | null;
}) {
  const a = ALERT[p.level];
  const hw = p.d !== null && p.speedKmh > 0 ? headwayS(p.d, p.speedKmh) : null;
  return (
    <section aria-label="Cảnh báo khoảng cách" className={`rounded-xl border border-border border-l-4 p-4 ${TONE_BORDER[a.tone]} ${a.bg}`}>
      {p.dataset ? (
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span>Tốc độ xe <span className="text-muted">({p.dataset.name})</span></span>
          <span className="text-2xl font-bold tabular-nums">{Math.round(p.speedKmh)} km/h</span>
        </div>
      ) : (
        <label className="flex items-center justify-between gap-2 text-sm">
          <span>Tốc độ xe <span className="text-muted">(nhập tay — video không có dữ liệu tốc độ)</span></span>
          <select className={`${btn} px-3`} value={p.speedKmh} onChange={(e) => p.onSpeed(Number(e.target.value))}>
            {SPEEDS.map((v) => <option key={v} value={v}>{v === 0 ? 'Chưa chọn' : `${v} km/h`}</option>)}
          </select>
        </label>
      )}
      {p.dataset && (
        <p className="mt-1 text-sm text-muted tabular-nums">
          Ground truth LiDAR: {p.dataset.gtM !== null ? `${p.dataset.gtM.toFixed(1)} m` : '— (không có xe phía trước)'}
          {p.dataset.gtM !== null && p.d !== null && ` · sai số ${(p.d - p.dataset.gtM).toFixed(1)} m`}
        </p>
      )}
      {p.speedKmh > 0 && (
        <>
          <p aria-live="polite" className="mt-3 text-xl font-semibold leading-tight">{a.title}</p>
          <p className="mt-1 text-sm text-muted tabular-nums">
            {p.minM !== null ? `Tối thiểu ${p.minM} m` : 'Dưới 60 km/h: tự giữ khoảng cách phù hợp'}
            {p.d !== null && ` · đo được ${formatDistance(p.d)} ±${Math.max(0.5, Math.round(p.sigma * 2) / 2)} m`}
            {p.d !== null && p.minM !== null && ` · đạt ${Math.round((p.d / p.minM) * 100)}%`}
            {hw !== null && hw !== undefined && ` · giãn cách ${hw.toFixed(1)} s`}
          </p>
          <p className="mt-1 text-[11px] text-muted">Theo {REG_SOURCE} (đường khô). Chỉ mang tính tham khảo.</p>
        </>
      )}
    </section>
  );
}

export function MetricsRow({ frame, video }: { frame: Frame | null; video: VideoState }) {
  const items: [string, string][] = [
    ['Suy luận', frame ? `${Math.round(frame.inferMs)} ms` : '—'],
    ['Tần số', frame && video.playing ? `${Math.round(frame.detectHz)} Hz` : '—'],
    ['Số xe', frame ? `${frame.dets.length}` : '—'],
    ['Độ phân giải', video.hasVideo && video.width > 0 ? `${video.width}×${video.height}` : '—'],
  ];
  return (
    <dl className="m-0 grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-border bg-border">
      {items.map(([k, v]) => (
        <div key={k} className="bg-surface px-1 py-2 text-center">
          <dd className="m-0 text-sm font-semibold tabular-nums">{v}</dd>
          <dt className="text-[11px] text-muted">{k}</dt>
        </div>
      ))}
    </dl>
  );
}

export function SourceBar(p: {
  src: string | null; demos: { label: string; url: string }[]; playing: boolean; hasVideo: boolean;
  onFile: (f: File) => void; onDemo: (url: string) => void; onToggle: () => void;
  onOpenCalib: () => void; calibBtnRef: RefObject<HTMLButtonElement | null>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="grid grid-cols-2 gap-2">
      <input ref={fileRef} type="file" accept="video/mp4,video/*" className="hidden" aria-label="Tải video MP4"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onFile(f); e.target.value = ''; }} />
      <button type="button" className={btn} onClick={() => fileRef.current?.click()}>⬆ Tải MP4</button>
      <select aria-label="Clip mẫu" className={`${btn} px-3`} value={p.demos.find((d) => d.url === p.src)?.url ?? ''}
        onChange={(e) => e.target.value && p.onDemo(e.target.value)}>
        <option value="" disabled>Clip mẫu</option>
        {p.demos.map((d) => <option key={d.url} value={d.url}>{d.label}</option>)}
      </select>
      <button type="button" className={`${btn} disabled:opacity-50`} disabled={!p.hasVideo} onClick={p.onToggle}>
        {p.playing ? '❚❚ Tạm dừng' : '▶ Phát'}
      </button>
      <button ref={p.calibBtnRef} type="button" className={`${btn} lg:hidden`} onClick={p.onOpenCalib}>⚙ Hiệu chuẩn</button>
    </div>
  );
}
