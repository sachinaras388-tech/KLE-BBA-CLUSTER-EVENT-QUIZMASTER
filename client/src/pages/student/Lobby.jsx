import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BadgeMinus, CheckCircle2, Clock, HelpCircle, ListChecks, Medal, PlayCircle, Repeat, ShieldCheck, Target, Trophy, WifiOff } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { fmtDateTime } from '../../lib/format.js';
import { Alert, Button, Card, ErrorState, PageLoader, PhaseBadge } from '../../components/ui.jsx';
import { BackLink, Countdown, useServerOffset } from '../../components/studentBits.jsx';

const Stat = ({ icon: Icon, value, label }) => (
  <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
    <Icon className="mb-2 h-5 w-5 text-brand-100" aria-hidden />
    <p className="text-2xl font-extrabold text-white">{value}</p>
    <p className="text-xs font-semibold uppercase tracking-wide text-brand-100">{label}</p>
  </div>
);

export default function Lobby() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload, refresh } = useFetch(() => api.get(`/student/competitions/${id}`), [id]);
  const offset = useServerOffset(data?.serverTime);
  const [agree, setAgree] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  if (loading) return <PageLoader label="Opening lobby..." />;
  if (error) return <ErrorState error={error} onRetry={reload} title={error.status === 404 ? 'Competition not found' : undefined} />;
  const c = data.competition;
  const resuming = Boolean(c.activeAttemptId);

  async function start() {
    setStartError('');
    setStarting(true);
    try {
      const r = await api.post(`/student/competitions/${id}/start`);
      navigate(`/attempt/${r.attempt.id}`);
    } catch (err) {
      setStartError(err.message);
      setStarting(false);
      refresh();
    }
  }

  const rules = [
    [Clock, `You have ${c.durationMinutes} minutes once you press Start. The timer runs on the server - closing the tab does not pause it.`],
    [ShieldCheck, 'Your answers save automatically. If you disconnect, sign back in and choose Resume to continue where you left off.'],
    [Target, c.negativeMarking.enabled ? `Negative marking applies: a wrong answer costs ${Math.round(c.negativeMarking.fraction * 100)}% of that question's marks. Unanswered questions score zero.` : 'There is no negative marking. Unanswered questions score zero.'],
    [Repeat, c.maxAttempts > 1 ? `You are allowed ${c.maxAttempts} attempts. Your best score counts.` : 'You have a single attempt. Once submitted it cannot be repeated.'],
  ];

  return (
    <>
      <BackLink to="/">All competitions</BackLink>

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-violet-700 p-6 text-white shadow-lift sm:p-10">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="relative">
          <PhaseBadge phase={c.phase} />
          <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight !text-white sm:text-4xl">{c.title}</h1>
          {c.description && <p className="mt-3 max-w-2xl text-brand-100">{c.description}</p>}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={Clock} value={`${c.durationMinutes}m`} label="Duration" />
            <Stat icon={HelpCircle} value={c.questionCount} label="Questions" />
            <Stat icon={Trophy} value={c.totalMarks} label="Total marks" />
            <Stat icon={BadgeMinus} value={c.negativeMarking.enabled ? `-${Math.round(c.negativeMarking.fraction * 100)}%` : 'None'} label="Negative marking" />
          </div>
          <p className="mt-5 text-sm text-brand-100">
            Window: {fmtDateTime(c.startTime)} - {fmtDateTime(c.endTime)}
          </p>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <ListChecks className="h-5 w-5 text-brand-600" aria-hidden /> Before you begin
            </h2>
            <ul className="mt-4 space-y-3">
              {rules.map(([Icon, text]) => (
                <li key={text} className="flex gap-3 text-sm">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            {c.instructions && (
              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">From the organiser</p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{c.instructions}</p>
              </div>
            )}
          </Card>
          <Alert tone="info" title="Fair play">
            <span className="flex items-start gap-2">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>Use a stable connection and one device. Opening the quiz in a second tab simply resumes the same attempt.</span>
            </span>
          </Alert>
        </div>

        <Card className="h-fit p-6 lg:sticky lg:top-24">
          {c.phase === 'upcoming' && (
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-500">Opens in</p>
              <p className="my-2 text-4xl font-extrabold text-brand-700">
                <Countdown target={c.startTime} offset={offset} onDone={refresh} />
              </p>
              <p className="text-xs text-slate-500">{fmtDateTime(c.startTime)}</p>
              <Button className="mt-5 w-full" size="lg" disabled>
                Not open yet
              </Button>
            </div>
          )}

          {c.phase === 'open' && (c.canStart || resuming) && (
            <div>
              <p className="text-center text-sm font-semibold text-slate-500">Closes in</p>
              <p className="mb-5 mt-1 text-center text-3xl font-extrabold text-emerald-700">
                <Countdown target={c.endTime} offset={offset} onDone={refresh} />
              </p>
              {!resuming && (
                <label className="mb-4 flex cursor-pointer items-start gap-3 text-sm">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  <span>I have read the instructions and understand that the timer starts immediately.</span>
                </label>
              )}
              {startError && <Alert tone="error" className="mb-4">{startError}</Alert>}
              <Button size="lg" className="w-full" icon={PlayCircle} loading={starting} disabled={!resuming && !agree} onClick={start}>
                {resuming ? 'Resume attempt' : c.hasSubmitted ? 'Start another attempt' : 'Start quiz'}
              </Button>
              <p className="mt-3 text-center text-xs text-slate-500">
                Attempts used: {c.attemptsUsed} of {c.maxAttempts}
              </p>
            </div>
          )}

          {c.phase === 'open' && !c.canStart && !resuming && (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
              <h3 className="mt-3 text-lg font-extrabold">You have submitted</h3>
              <p className="mt-1 text-sm text-slate-500">All your attempts for this competition are complete.</p>
            </div>
          )}

          {c.phase === 'closed' && !c.hasSubmitted && (
            <div className="text-center">
              <Clock className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
              <h3 className="mt-3 text-lg font-extrabold">Competition closed</h3>
              <p className="mt-1 text-sm text-slate-500">This competition ended on {fmtDateTime(c.endTime)} and you did not submit an attempt.</p>
            </div>
          )}

          {c.hasSubmitted && (
            <div className={c.phase === 'open' ? 'mt-6 border-t border-slate-100 pt-6' : ''}>
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Results</p>
              {c.resultsReleased ? (
                <div className="space-y-2">
                  {c.myScore && (
                    <p className="mb-3 text-center text-3xl font-extrabold text-slate-900">
                      {c.myScore.score}
                      <span className="text-lg font-bold text-slate-400"> / {c.myScore.maxScore}</span>
                    </p>
                  )}
                  <Link to={`/competitions/${c.id}/result`} className="block">
                    <Button className="w-full" icon={Medal}>View my result</Button>
                  </Link>
                  {c.showLeaderboard && (
                    <Link to={`/competitions/${c.id}/leaderboard`} className="block">
                      <Button variant="secondary" className="w-full" icon={Trophy}>Leaderboard</Button>
                    </Link>
                  )}
                  {c.answersReleased && (
                    <Link to={`/competitions/${c.id}/review`} className="block">
                      <Button variant="secondary" className="w-full" icon={ListChecks}>Review answers</Button>
                    </Link>
                  )}
                </div>
              ) : (
                <Alert tone="info" title="Results not published yet">
                  {c.resultsScheduledAt ? <>Scheduled for {fmtDateTime(c.resultsScheduledAt)}.</> : 'The organiser will publish them after the competition closes.'}
                </Alert>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
