import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Clock, FileQuestion, Medal, PlayCircle, Radio, Trophy } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { fmtDateTime } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PhaseBadge, Skeleton } from '../../components/ui.jsx';
import { Countdown, useServerOffset } from '../../components/studentBits.jsx';

function cta(c) {
  if (c.phase === 'open') {
    if (c.activeAttemptId) return { label: 'Resume attempt', icon: PlayCircle, variant: 'primary' };
    if (c.canStart) return { label: 'Enter lobby', icon: PlayCircle, variant: 'primary' };
    return { label: 'View status', variant: 'secondary' };
  }
  if (c.phase === 'upcoming') return { label: 'View details', variant: 'secondary' };
  if (c.resultsReleased && c.hasSubmitted) return { label: 'View results', icon: Medal, variant: 'soft' };
  return { label: 'View details', variant: 'secondary' };
}

function CompetitionCard({ c, offset, onTick }) {
  const action = cta(c);
  const target = `/competitions/${c.id}${c.phase === 'closed' && c.resultsReleased && c.hasSubmitted ? '/result' : ''}`;
  return (
    <Card className="flex flex-col p-5 transition hover:shadow-lift">
      <div className="mb-3 flex items-start justify-between gap-3">
        <PhaseBadge phase={c.phase} />
        {c.hasSubmitted && (
          <Badge tone="green">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Submitted
          </Badge>
        )}
        {c.activeAttemptId && <Badge tone="amber">In progress</Badge>}
      </div>
      <h3 className="text-lg font-extrabold leading-snug">{c.title}</h3>
      {c.description && <p className="mt-1.5 line-clamp-2 text-sm text-slate-500">{c.description}</p>}

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          [c.durationMinutes, 'minutes'],
          [c.questionCount, 'questions'],
          [c.totalMarks, 'marks'],
        ].map(([v, l]) => (
          <div key={l} className="rounded-xl bg-slate-50 py-2">
            <dd className="text-base font-extrabold text-slate-900">{v}</dd>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-1 text-xs text-slate-500">
        <p className="flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Opens {fmtDateTime(c.startTime)}
        </p>
        <p className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden /> Closes {fmtDateTime(c.endTime)}
        </p>
      </div>

      {c.phase === 'upcoming' && (
        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
          Starts in <Countdown target={c.startTime} offset={offset} onDone={onTick} />
        </p>
      )}
      {c.phase === 'open' && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          Closes in <Countdown target={c.endTime} offset={offset} onDone={onTick} />
        </p>
      )}

      <div className="mt-5 flex-1" />
      <div className="flex gap-2">
        <Link to={target} className="flex-1">
          <Button variant={action.variant} icon={action.icon} className="w-full">
            {action.label}
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function Section({ title, icon: Icon, items, offset, onTick }) {
  if (!items.length) return null;
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
        <Icon className="h-5 w-5 text-brand-600" aria-hidden /> {title}
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">{items.length}</span>
      </h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <CompetitionCard key={c.id} c={c} offset={offset} onTick={onTick} />
        ))}
      </div>
    </section>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload, refresh } = useFetch(() => api.get('/student/competitions'), [], { interval: 45000 });
  const offset = useServerOffset(data?.serverTime);
  const items = data?.items || [];
  const live = items.filter((c) => c.phase === 'open');
  const upcoming = items.filter((c) => c.phase === 'upcoming').sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const closed = items.filter((c) => c.phase === 'closed');
  const firstName = user.name.split(' ')[0];

  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} subtitle="Your competitions in one place. Every deadline shown here is server time." />

      {loading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      )}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data && !items.length && (
        <EmptyState icon={FileQuestion} title="No competitions yet">
          When the organiser assigns you to a competition, it will appear here. Check back soon.
        </EmptyState>
      )}

      {data && items.length > 0 && (
        <>
          <div className="mb-8 grid grid-cols-3 gap-3 sm:gap-4">
            {[
              [Radio, 'Live now', live.length, 'text-emerald-600 bg-emerald-50'],
              [CalendarClock, 'Upcoming', upcoming.length, 'text-sky-600 bg-sky-50'],
              [Trophy, 'Completed', closed.length, 'text-brand-600 bg-brand-50'],
            ].map(([Icon, label, n, tone]) => (
              <Card key={label} className="flex items-center gap-3 p-4">
                <span className={`hidden rounded-xl p-2.5 sm:block ${tone}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-2xl font-extrabold text-slate-900">{n}</p>
                  <p className="text-xs font-semibold text-slate-500">{label}</p>
                </div>
              </Card>
            ))}
          </div>
          <Section title="Live now" icon={Radio} items={live} offset={offset} onTick={refresh} />
          <Section title="Upcoming" icon={CalendarClock} items={upcoming} offset={offset} onTick={refresh} />
          <Section title="Completed" icon={Trophy} items={closed} offset={offset} onTick={refresh} />
        </>
      )}
    </>
  );
}
