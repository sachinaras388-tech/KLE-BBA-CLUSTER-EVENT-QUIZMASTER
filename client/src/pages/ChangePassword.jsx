import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Circle, KeyRound } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, Button, Card, Field, Input, Logo, cx } from '../components/ui.jsx';

const rules = [
  ['At least 10 characters', (p) => p.length >= 10],
  ['An uppercase letter', (p) => /[A-Z]/.test(p)],
  ['A lowercase letter', (p) => /[a-z]/.test(p)],
  ['A number', (p) => /\d/.test(p)],
];

export default function ChangePassword() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const forced = user.mustChangePassword;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const allOk = rules.every(([, f]) => f(next));
  const match = next && next === confirm;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      setUser(r.user);
      toast.success('Password updated. Other devices have been signed out.');
      navigate(r.user.role === 'admin' ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <Logo className="mb-8 justify-center" />
      <Card className="animate-fade-up p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <KeyRound className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-extrabold">{forced ? 'Set your own password' : 'Change password'}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {forced ? 'You are using a temporary password. Choose a new one to continue.' : 'Choose a strong password you do not use elsewhere.'}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label={forced ? 'Temporary password' : 'Current password'}>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="New password">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
          </Field>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5" aria-label="Password requirements">
            {rules.map(([label, f]) => {
              const ok = f(next);
              return (
                <li key={label} className={cx('flex items-center gap-2 text-xs font-medium', ok ? 'text-emerald-600' : 'text-slate-400')}>
                  {ok ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />} {label}
                </li>
              );
            })}
          </ul>
          <Field label="Confirm new password" error={confirm && !match ? 'Passwords do not match' : undefined}>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required invalid={Boolean(confirm && !match)} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!current || !allOk || !match}>
            Update password
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          {forced ? (
            <button className="font-semibold text-slate-500 hover:text-slate-700" onClick={async () => { await logout(); navigate('/login'); }}>
              Sign out instead
            </button>
          ) : (
            <Link to={user.role === 'admin' ? '/admin' : '/'} className="font-semibold text-slate-500 hover:text-slate-700">
              Cancel
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
