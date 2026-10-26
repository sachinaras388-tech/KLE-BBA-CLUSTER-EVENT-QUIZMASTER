import { Link } from 'react-router-dom';
import { Users, Trophy, Activity, CheckCircle2, Plus, UserPlus, CalendarClock, Radio } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { fmtDateTime, relativeFromNow } from '../../lib/format.js';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '../../components/ui.jsx';

const actionLabel = (a) => a.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default function Dashboard() {
  const { data, error, loading, reload } = useFetch(() => api.get('/admin/stats'), [], { interval: 30000 });

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Live overview of your competitions and participants."
        actions={
          <>
            <Link to="/admin/participants">
              <Button variant="secondary" icon={UserPlus}>Add participants</Button>
            </Link>
            <Link to="/admin/competitions/new">
              <Button icon={Plus}>New competition</Button>
            </Link>
          </>
        }
      />

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      )}

      {data && (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Participants" value={data.participants.total} icon={Users} hint={`${data.participants.active} active`} />
            <StatCard label="Live now" value={data.live.length} icon={Radio} tone="green" hint="competitions open" />
            <StatCard label="In progress" value={data.attempts.inProgress} icon={Activity} tone="sky" hint="attempts running" />
            <StatCard label="Submitted today" value={data.attempts.submittedToday} icon={CheckCircle2} tone="amber" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="flex items-center gap-2 text-base font-bold"><Radio className="h-4 w-4 text-emerald-600" /> Live competitions</h2>
              {data.live.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Nothing is running right now.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {data.live.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{c.title}</p>
                        <p className="text-xs text-slate-500">Closes {relativeFromNow(c.endTime)} - {fmtDateTime(c.endTime)}</p>
                      </div>
                      <Link to={`/admin/competitions/${c.id}`}><Button size="sm" variant="soft">Monitor</Button></Link>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="mt-8 flex items-center gap-2 text-base font-bold"><CalendarClock className="h-4 w-4 text-sky-600" /> Upcoming</h2>
              {data.upcoming.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No upcoming published competitions.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {data.upcoming.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{c.title}</p>
                        <p className="text-xs text-slate-500">Starts {relativeFromNow(c.startTime)} - {fmtDateTime(c.startTime)}</p>
                      </div>
                      <Link to={`/admin/competitions/${c.id}`}><Button size="sm" variant="secondary">Open</Button></Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-base font-bold">Competitions</h2>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
                {[['Draft', data.competitions.draft], ['Published', data.competitions.published], ['Archived', data.competitions.archived]].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-slate-50 p-3">
                    <dd className="text-2xl font-extrabold text-slate-900">{v}</dd>
                    <dt className="text-xs font-semibold text-slate-500">{k}</dt>
                  </div>
                ))}
              </dl>

              <h2 className="mt-8 text-base font-bold">Recent activity</h2>
              {data.recentActivity.length === 0 ? (
                <EmptyState title="No activity yet" />
              ) : (
                <ul className="mt-3 space-y-3">
                  {data.recentActivity.map((l) => (
                    <li key={l.id} className="text-sm">
                      <p className="font-semibold text-slate-800">{actionLabel(l.action)}</p>
                      <p className="text-xs text-slate-500">{l.actorLabel || 'system'} - {relativeFromNow(l.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/admin/audit" className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline">View full audit log</Link>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
