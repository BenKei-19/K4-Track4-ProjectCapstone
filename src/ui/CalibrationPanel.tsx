import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Calib } from '../types.ts';
import { CONFIG, DEMO_CALIB } from '../config.ts';

const L = CONFIG.CALIB_LIMITS;
const btn = 'min-h-11 rounded-lg px-4 text-sm font-medium border border-border bg-surface text-text hover:bg-border';
const btnPrimary = 'min-h-11 rounded-lg px-4 text-sm font-semibold bg-accent text-bg hover:brightness-110';

function NumField(p: {
  id: string; label: string; unit: string; value: number; min: number; max: number; step: number;
  hint?: string; onCommit: (v: number) => void;
}) {
  const [raw, setRaw] = useState<string | null>(null); // text while typing; null = show committed value
  const [clampedAt, setClampedAt] = useState<number | null>(null); // red border until the value changes again
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
  const bad = (raw !== null && !(n >= p.min && n <= p.max)) || clampedAt === p.value;
  const commit = () => {
    if (raw !== null && Number.isFinite(n)) {
      const c = Math.min(p.max, Math.max(p.min, n));
      p.onCommit(c);
      setClampedAt(c !== n ? c : null);
    } else setClampedAt(null); // reverted to the previous value: nothing left to flag
    setRaw(null);
  };
  return (
    <div>
      <label htmlFor={p.id} className="block text-sm text-muted mb-1">{p.label}</label>
      <div className="flex items-center gap-2">
        <input
          id={p.id} type="number" inputMode="decimal" min={p.min} max={p.max} step={p.step}
          value={raw ?? String(p.value)}
          aria-invalid={bad}
          aria-describedby={p.hint ? `${p.id}-hint` : undefined}
          onChange={(e) => {
            setRaw(e.target.value);
            const v = e.target.value.trim() === '' ? NaN : Number(e.target.value);
            if (v >= p.min && v <= p.max) { p.onCommit(v); setClampedAt(null); } // live-apply valid values
          }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          className={`min-h-11 w-full rounded-lg bg-bg px-3 text-text tabular-nums border ${bad ? 'border-danger' : 'border-border'}`}
        />
        <span className="text-muted w-6">{p.unit}</span>
      </div>
      {bad && <p role="alert" className="mt-1 text-xs text-danger">Giá trị phải từ {p.min} đến {p.max} {p.unit}</p>}
      {p.hint && <p id={`${p.id}-hint`} className="mt-1 text-xs text-muted">{p.hint}</p>}
    </div>
  );
}

export function CalibrationPanel(p: {
  calib: Calib; onChange: (patch: Partial<Calib>) => void; onApply: () => void;
  onReset: () => void; onPreset: () => void; onClose?: () => void; closeRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { calib } = p;
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 id="calib-title" className="text-lg font-semibold">Hiệu chuẩn</h2>
        {p.onClose && (
          <button ref={p.closeRef} type="button" onClick={p.onClose} aria-label="Đóng" className="min-h-11 min-w-11 rounded-lg text-xl text-muted hover:bg-border">✕</button>
        )}
      </div>
      <NumField id="calib-h" label="Chiều cao camera" unit="m" value={calib.heightM} min={L.heightM[0]} max={L.heightM[1]} step={0.01}
        onCommit={(v) => p.onChange({ heightM: v })} />
      <NumField id="calib-fov" label="Góc nhìn dọc (vFOV)" unit="°" value={calib.vfovDeg} min={L.vfovDeg[0]} max={L.vfovDeg[1]} step={0.5}
        hint="≈ 2·atan(9.7 / f₃₅) với f₃₅ là tiêu cự tương đương 35 mm của camera (VD 26 mm → ~41°), video 16:9 quay ngang."
        onCommit={(v) => p.onChange({ vfovDeg: v })} />
      <div>
        <label htmlFor="calib-hz" className="flex justify-between text-sm text-muted mb-1">
          <span>Đường chân trời</span><span className="tabular-nums text-text">{(calib.horizonY * 100).toFixed(1)}%</span>
        </label>
        <input id="calib-hz" type="range" min={L.horizonY[0]} max={L.horizonY[1]} step={0.001} value={calib.horizonY}
          onChange={(e) => p.onChange({ horizonY: Math.round(Number(e.target.value) * 1000) / 1000 })}
          className="w-full min-h-11 accent-accent" />
      </div>
      <p className="text-xs text-muted">
        {calib.confirmed ? 'Đã xác nhận — có thể tinh chỉnh trực tiếp.' : 'Chưa xác nhận — khoảng cách sẽ không hiển thị.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} onClick={p.onApply}>Dùng hiệu chuẩn này</button>
        <button type="button" className={btn} onClick={p.onReset}>Đặt lại</button>
        {DEMO_CALIB !== null && <button type="button" className={btn} onClick={p.onPreset}>Preset clip mẫu</button>}
      </div>
    </div>
  );
}

/** Mobile bottom sheet: modal dialog, Esc / backdrop close, focus moved in and restored, Tab trapped. */
export function CalibrationSheet(p: { onClose: () => void; children: (closeRef: RefObject<HTMLButtonElement | null>) => ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prev?.focus();
  }, []);
  // Document-level: focus falls to <body> after clicking non-focusable dialog content, so an element-level handler would miss keys.
  const { onClose } = p;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = boxRef.current?.querySelectorAll<HTMLElement>('button,input,select');
      if (!f?.length) return;
      const first = f[0], last = f[f.length - 1];
      const a = document.activeElement;
      if (!boxRef.current?.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={p.onClose}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="calib-title" onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[88dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {p.children(closeRef)}
      </div>
    </div>
  );
}
