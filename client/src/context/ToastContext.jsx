import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const tones = {
  success: { icon: CheckCircle2, cls: 'text-emerald-600' },
  error: { icon: AlertTriangle, cls: 'text-rose-600' },
  info: { icon: Info, cls: 'text-brand-600' },
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone, message) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-3), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end" aria-live="polite">
        {items.map((t) => {
          const { icon: Icon, cls } = tones[t.tone];
          return (
            <div key={t.id} role="status" className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-xl bg-white p-3.5 shadow-lift ring-1 ring-slate-200">
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cls}`} aria-hidden />
              <p className="flex-1 text-sm font-medium text-slate-800">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-slate-400 hover:text-slate-600" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
