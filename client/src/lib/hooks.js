import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads data with loading / error state. `fn` is re-run when `deps` change or reload() is called. */
export function useFetch(fn, deps = [], { interval } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const run = useCallback(async (silent = false) => {
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ data: silent ? s.data : null, error: silent ? s.error : error, loading: false }));
    }
  }, []);

  useEffect(() => {
    run();
    return () => {
      seq.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!interval) return undefined;
    const t = setInterval(() => run(true), interval);
    return () => clearInterval(t);
  }, [interval, run]);

  return { ...state, reload: () => run(), refresh: () => run(true) };
}

/** Ticking "now" that respects an offset to server time. */
export function useNow(intervalMs = 1000, offsetMs = 0) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offsetMs), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, offsetMs]);
  return now;
}
