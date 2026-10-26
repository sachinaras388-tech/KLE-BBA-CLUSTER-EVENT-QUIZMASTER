// Thin fetch wrapper. Auth lives in an httpOnly cookie, so no token ever touches JavaScript or browser storage.
const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => {
  unauthorizedHandler = fn;
};

async function request(method, path, body, { raw = false } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'X-Requested-With': 'quizmaster',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Please check your internet connection.', { status: 0, code: 'NETWORK' });
  }
  if (raw && res.ok) return res;

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const err = new ApiError(data?.message || `Request failed (${res.status})`, {
      status: res.status,
      code: data?.code,
      details: data?.details,
    });
    if (res.status === 401 && !path.startsWith('/auth/login') && unauthorizedHandler) unauthorizedHandler(err);
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b ?? {}),
  del: (p) => request('DELETE', p),
};

export async function downloadFile(path, fallbackName = 'download') {
  const res = await request('GET', path, undefined, { raw: true });
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const name = /filename="?([^";]+)"?/i.exec(cd)?.[1] || fallbackName;
  saveBlob(blob, name);
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};
