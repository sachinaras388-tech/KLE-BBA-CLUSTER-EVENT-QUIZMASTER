import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, Timer, Trophy, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Button, Field, Input, Logo } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) {
    if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
    return <Navigate to={location.state?.from || (user.role === 'admin' ? '/admin' : '/')} replace />;
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(identifier.trim(), password);
      navigate(u.mustChangePassword ? '/change-password' : u.role === 'admin' ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-violet-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-violet-400/20 blur-3xl" />
        <Logo light className="relative" />
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-extrabold leading-tight !text-white xl:text-5xl">Fair, secure quiz competitions.</h1>
          <p className="mt-4 text-lg text-brand-100">Every deadline is enforced on the server. Every score is calculated on the server. Answers stay sealed until the organiser releases them.</p>
          <ul className="mt-10 space-y-5">
            {[
              [Timer, 'Server-timed attempts', 'Resume safely after a disconnect - the clock never lies.'],
              [ShieldCheck, 'Sealed answer keys', 'Correct answers never reach your browser before release.'],
              [Trophy, 'Live leaderboards', 'Ranked by score, then speed, once results are published.'],
            ].map(([Icon, t, d]) => (
              <li key={t} className="flex gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-bold">{t}</p>
                  <p className="text-sm text-brand-100">{d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-brand-200">Accounts are created by your organiser - there is no public sign-up.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md animate-fade-up">
          <Logo className="mb-8 lg:hidden" />
          <h2 className="text-3xl font-extrabold">Welcome back</h2>
          <p className="mt-2 text-sm text-slate-500">Sign in with the credentials issued by your organiser.</p>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Participant ID or admin username">
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="QM-7K3X9P"
                required
                autoFocus
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Your password"
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 hover:text-slate-600"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!identifier || !password}>
              Sign in
            </Button>
          </form>

          <p className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Your session is protected by a secure, HTTP-only cookie.
          </p>
        </div>
      </section>
    </div>
  );
}
