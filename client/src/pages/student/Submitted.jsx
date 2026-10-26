import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, Hash, Home, ListChecks, Timer } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { fmtDateTime } from '../../lib/format.js';
import { Alert, Button, Card, ErrorState, PageLoader } from '../../components/ui.jsx';

export default function Submitted() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const attemptId = params.get('attempt');
  const { data, error, loading, reload } = useFetch(() => (attemptId ? api.get(`/student/attempts/${attemptId}/summary`) : Promise.resolve(null)), [attemptId]);

  if (!attemptId) return <Navigate to={`/competitions/${id}`} replace />;
  if (loading) return <PageLoader label="Confirming your submission..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const auto = data.submissionType === 'auto';
  const admin = data.submissionType === 'admin';

  return (
    <div className="mx-auto max-w-xl animate-fade-up">
      <Card className="overflow-hidden text-center">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-10 text-white">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/20 ring-8 ring-white/10">
            <CheckCircle2 className="h-9 w-9" aria-hidden />
          </span>
          <h1 className="mt-5 text-2xl font-extrabold !text-white sm:text-3xl">{auto ? 'Time is up - submitted!' : admin ? 'Attempt submitted' : 'Submission received!'}</h1>
          <p className="mt-2 text-emerald-50">{data.competitionTitle}</p>
        </div>

        <div className="space-y-5 p-6 sm:p-8">
          {auto && <Alert tone="info" className="text-left">Your timer ended, so your saved answers were submitted automatically at the deadline.</Alert>}
          {admin && <Alert tone="info" className="text-left">The organiser closed this attempt and your saved answers were submitted.</Alert>}

          <dl className="grid grid-cols-2 gap-3 text-left">
            {[
              [Hash, 'Receipt', data.receipt, 'font-mono'],
              [ListChecks, 'Answered', `${data.answered} of ${data.totalQuestions}`],
              [Clock, 'Submitted at', fmtDateTime(data.submittedAt)],
              [Timer, 'Method', auto ? 'Automatic' : admin ? 'By organiser' : 'Manual'],
            ].map(([Icon, label, value, extra]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3.5">
                <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
                </dt>
                <dd className={`mt-1 text-sm font-bold text-slate-900 ${extra || ''}`}>{value}</dd>
              </div>
            ))}
          </dl>

          <p className="text-sm text-slate-500">
            {data.resultsReleased
              ? 'Your results are available now.'
              : data.resultsScheduledAt
                ? `Results are scheduled to be published on ${fmtDateTime(data.resultsScheduledAt)}.`
                : 'Your score is hidden until the organiser publishes the results. Keep your receipt number for reference.'}
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            {data.resultsReleased && (
              <Link to={`/competitions/${id}/result`}>
                <Button className="w-full">View my result</Button>
              </Link>
            )}
            <Link to="/">
              <Button variant="secondary" icon={Home} className="w-full">
                Back to dashboard
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
