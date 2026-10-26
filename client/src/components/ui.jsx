import { forwardRef, useEffect, useRef, useState } from 'react';
import { Loader2, X, AlertTriangle, Info, CheckCircle2, Inbox, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react';

export const cx = (...a) => a.filter(Boolean).join(' ');

/* ------------------------------ buttons ------------------------------ */
export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, className, children, disabled, type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

/* ------------------------------ form ------------------------------ */
export function Field({ label, hint, error, className, children }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>}
      {error && (
        <span className="mt-1.5 block text-xs font-medium text-rose-600" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export const Input = forwardRef(function Input({ className, invalid, ...p }, ref) {
  return <input ref={ref} className={cx('input', invalid && 'input-invalid', className)} {...p} />;
});
export const Textarea = forwardRef(function Textarea({ className, invalid, rows = 3, ...p }, ref) {
  return <textarea ref={ref} rows={rows} className={cx('input resize-y', invalid && 'input-invalid', className)} {...p} />;
});
export const Select = forwardRef(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cx('input pr-9', className)} {...p}>
      {children}
    </select>
  );
});

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50', checked ? 'bg-brand-600' : 'bg-slate-300')}
      >
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  );
}

/* ------------------------------ surfaces ------------------------------ */
export const Card = ({ className, children, ...p }) => (
  <div className={cx('card', className)} {...p}>
    {children}
  </div>
);

const badgeTones = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
};
export const Badge = ({ tone = 'slate', className, children }) => <span className={cx('badge', badgeTones[tone], className)}>{children}</span>;

export function PhaseBadge({ phase }) {
  if (phase === 'open')
    return (
      <Badge tone="green">
        <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-emerald-500" /> Live
      </Badge>
    );
  if (phase === 'upcoming') return <Badge tone="blue">Upcoming</Badge>;
  return <Badge tone="slate">Closed</Badge>;
}

export function StatusBadge({ status }) {
  const map = {
    draft: ['amber', 'Draft'],
    published: ['green', 'Published'],
    archived: ['slate', 'Archived'],
    in_progress: ['blue', 'In progress'],
    submitted: ['green', 'Submitted'],
    auto_submitted: ['amber', 'Auto-submitted'],
    admin_submitted: ['amber', 'Force-submitted'],
    not_started: ['slate', 'Not started'],
  };
  const [tone, label] = map[status] || ['slate', status];
  return <Badge tone={tone}>{label}</Badge>;
}

export const Spinner = ({ className }) => <Loader2 className={cx('h-5 w-5 animate-spin text-brand-600', className)} aria-label="Loading" />;

export function PageLoader({ label = 'Loading...' }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-500" role="status">
      <Spinner className="h-8 w-8" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export const Skeleton = ({ className }) => <div className={cx('animate-pulse rounded-xl bg-slate-200/70', className)} />;

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      <div className="mb-4 rounded-2xl bg-brand-50 p-3 text-brand-600">
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/60 px-6 py-12 text-center" role="alert">
      <AlertTriangle className="mb-3 h-8 w-8 text-rose-500" aria-hidden />
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-slate-600">{error?.message || String(error || 'Unknown error')}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

const alertTones = {
  info: ['bg-sky-50 text-sky-900 ring-sky-200', Info],
  success: ['bg-emerald-50 text-emerald-900 ring-emerald-200', CheckCircle2],
  warning: ['bg-amber-50 text-amber-900 ring-amber-200', AlertTriangle],
  error: ['bg-rose-50 text-rose-900 ring-rose-200', AlertTriangle],
};
export function Alert({ tone = 'info', title, children, className }) {
  const [cls, Icon] = alertTones[tone];
  return (
    <div className={cx('flex gap-3 rounded-xl p-3.5 text-sm ring-1 ring-inset', cls, className)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'brand', hint }) {
  const tones = { brand: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', rose: 'bg-rose-50 text-rose-600', sky: 'bg-sky-50 text-sky-600' };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        {Icon && (
          <span className={cx('rounded-xl p-2', tones[tone])}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export function ProgressBar({ value, max = 100, tone = 'brand', label }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const bar = { brand: 'bg-brand-600', green: 'bg-emerald-500', amber: 'bg-amber-500' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx('h-full rounded-full transition-all', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------ modal ------------------------------ */
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => ref.current?.querySelector('input,select,textarea,button:not([data-close])')?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx('relative flex max-h-[92vh] w-full animate-fade-up flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', width)}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-bold">{title}</h2>
          <button data-close onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirm', tone = 'danger', loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{children}</div>
    </Modal>
  );
}

/* ------------------------------ tabs / pagination / misc ------------------------------ */
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="inline-flex min-w-full gap-1 border-b border-slate-200 sm:min-w-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={cx(
              '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition',
              value === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {t.icon && <t.icon className="h-4 w-4" aria-hidden />}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-slate-500">
        Page {page} of {pages}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Prev
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', className }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cx('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50', className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copied' : label}
    </button>
  );
}

export function Logo({ className, light }) {
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-md">
        <CheckCircle2 className="h-5 w-5" aria-hidden />
      </span>
      <span className={cx('text-lg font-extrabold tracking-tight', light ? 'text-white' : 'text-slate-900')}>QuizMaster</span>
    </div>
  );
}

export const TableWrap = ({ children }) => (
  <div className="card overflow-hidden">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100">{children}</table>
    </div>
  </div>
);

export function useDebounced(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
