import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, CircleSlash, Clock, ListChecks, Lock, Medal, Trophy, XCircle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { fmtDateTime, fmtDuration, num } from '../../lib/format.js';
import { Button, Card, ErrorState, PageLoader } from '../../components/ui.jsx';
import { BackLink, GateNotice, ScoreRing, scheduledFrom } from '../../components/studentBits.jsx';

function verdict(p) {
  if (p >= 90) return ['Outstanding!', 'text-emerald-600'];
  if (p >= 75) return ['Great work', 'text-emerald-600'];
  if (p >= 50) return ['Good effort', 'text-brand-600'];
  return ['Keep practising', 'text-amber-600'];
}

export default function Result() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch(() => api.get(`/student/competitions/${id}/result`), [id]);

  if (loading) return <PageLoader label="Loading your result..." />;
  if (error?.code === 'RESULTS_NOT_RELEASED') {
    const at = scheduledFrom(error);
    return (
      <>
        <BackLink to={`/competitions/${id}`}>Competition</BackLink>
        <GateNotice icon={Lock} title="Results are not published yet" action={<Link to="/"><Button variant="secondary">Back to dashboard</Button></Link>}>
          {at ? `They are scheduled to be released on ${fmtDateTime(at)}.` : 'The organiser will release them after the competition closes. Check back later.'}
        </GateNotice>
      </>
    );
  }
  if (error?.code === 'NO_ATTEMPT') {
    return (
      <>
        <BackLink to="/">Dashboard</BackLink>
        <GateNotice icon={CircleSlash} title="No submission found" action={<Link to="/"><Button variant="secondary">Back to dashboard</Button></Link>}>
          You did not submit an attempt for this competition, so there is no score to show.
        </GateNotice>
      </>
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { competition: c, result: r } = data;
  const [label, tone] = verdict(r.percentage);

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <BackLink to={`/competitions/${id}`}>{c.title}</BackLink>

      <Card className="overflow-hidden">
        <div className="grid items-center gap-8 bg-gradient-to-br from-brand-50 via-white to-violet-50 p-6 sm:grid-cols-[auto_1fr] sm:p-10">
          <div className="mx-auto">
            <ScoreRing percent={r.percentage}>
              <p className="text-4xl font-extrabold text-slate-900">{num(r.score)}</p>
              <p className="text-sm font-semibold text-slate-500">of {num(r.maxScore)}</p>
            </ScoreRing>
          </div>
          <div className="text-center sm:text-left">
            <p className={`text-sm font-bold uppercase tracking-wider ${tone}`}>{label}</p>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{r.percentage}% score</h1>
            <p className="mt-1 text-sm text-slate-500">{c.title}{r.attemptNumber > 1 ? ` · best of your attempts (#${r.attemptNumber})` : ''}</p>
            {r.rank && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-extrabold text-amber-800">
                <Medal className="h-4 w-4" aria-hidden /> Rank #{r.rank} of {r.totalParticipants}
              </p>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
          {[
            [CheckCircle2, 'Correct', r.correct, 'text-emerald-600'],
            [XCircle, 'Wrong', r.wrong, 'text-rose-600'],
            [CircleSlash, 'Unanswered', r.unanswered, 'text-slate-500'],
            [Clock, 'Time taken', fmtDuration(r.timeTakenSeconds), 'text-brand-600'],
          ].map(([Icon, l, v, cls]) => (
            <div key={l} className="bg-white p-5 text-center">
              <Icon className={`mx-auto h-5 w-5 ${cls}`} aria-hidden />
              <dd className="mt-2 text-2xl font-extrabold text-slate-900">{v}</dd>
              <dt className="text-xs font-semibold text-slate-500">{l}</dt>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-2 p-6 sm:flex-row sm:justify-center">
          {c.answersReleased ? (
            <Link to={`/competitions/${id}/review`}>
              <Button icon={ListChecks} className="w-full">Review my answers</Button>
            </Link>
          ) : (
            <p className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              <Lock className="h-4 w-4" aria-hidden /> Answer key not released yet
            </p>
          )}
          {c.showLeaderboard && (
            <Link to={`/competitions/${id}/leaderboard`}>
              <Button variant="secondary" icon={Trophy} className="w-full">View leaderboard</Button>
            </Link>
          )}
        </div>
      </Card>
      <p className="mt-4 text-center text-xs text-slate-400">Submitted {fmtDateTime(r.submittedAt)}</p>
    </div>
  );
}
