import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { useNow } from '../lib/hooks.js';
import { cx } from './ui.jsx';

/** Offset (ms) between the server clock and this device, from a serverTime the API returned. */
export function useServerOffset(serverTime) {
  return useMemo(() => (serverTime ? new Date(serverTime).getTime() - Date.now() : 0), [serverTime]);
}

/** 93784 -> "1d 02:03:04" ; 3725 -> "1:02:05" ; 65 -> "01:05" */
export function longClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  if (d) return `${d}d ${p(h)}:${p(m)}:${p(sec)}`;
  if (h) return `${h}:${p(m)}:${p(sec)}`;
  return `${p(m)}:${p(sec)}`;
}

/** Live countdown to `target` using server time. Calls onDone once when it reaches zero. */
export function Countdown({ target, offset = 0, onDone, className }) {
  const now = useNow(1000, offset);
  const left = (new Date(target).getTime() - now) / 1000;
  const fired = useRef(false);
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true;
      onDone?.();
    }
  }, [left, onDone]);
  return <span className={cx('tabular-nums', className)}>{longClock(left)}</span>;
}

export function BackLink({ to, children }) {
  return (
    <Link to={to} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {children}
    </Link>
  );
}

/** Friendly "not available yet" panel (results / answer key / leaderboard not released). */
export function GateNotice({ icon: Icon = Clock, title, children, action }) {
  return (
    <div className="card mx-auto max-w-xl px-6 py-14 text-center">
      <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <h2 className="text-xl font-extrabold">{title}</h2>
      <div className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{children}</div>
      {action && <div className="mt-6 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ScoreRing({ percent, size = 168, children }) {
  const pct = Math.max(0, Math.min(100, percent || 0));
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="url(#ring)" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

/** Pulls a scheduled release time out of an RESULTS_NOT_RELEASED / ANSWERS_NOT_RELEASED error. */
export const scheduledFrom = (err) => err?.details?.scheduledAt || null;
