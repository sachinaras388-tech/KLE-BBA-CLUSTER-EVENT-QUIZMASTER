const dtf = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const df = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const tf = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });

export const fmtDateTime = (v) => (v ? dtf.format(new Date(v)) : '-');
export const fmtDate = (v) => (v ? df.format(new Date(v)) : '-');
export const fmtTime = (v) => (v ? tf.format(new Date(v)) : '-');

/** seconds -> "1h 05m", "12m 05s", "45s" */
export function fmtDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return '-';
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

/** seconds -> "mm:ss" or "h:mm:ss" for the countdown */
export function clock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const pad = (n) => String(n).padStart(2, '0');
/** ISO -> value for <input type="datetime-local"> in the viewer's local time */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** datetime-local value -> ISO (UTC) */
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : undefined);

export const num = (n) => (n === null || n === undefined ? '-' : Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

export function relativeFromNow(iso, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  let text;
  if (mins < 1) text = 'moments';
  else if (mins < 60) text = `${mins} min`;
  else if (mins < 60 * 48) text = `${Math.round(mins / 60)} hr`;
  else text = `${Math.round(mins / 1440)} days`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

export function downloadCsvText(rows, filename) {
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
