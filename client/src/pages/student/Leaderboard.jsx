import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Crown, Lock, Search, Trophy } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { fmtDateTime, fmtDuration, num } from '../../lib/format.js';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, PageLoader, cx } from '../../components/ui.jsx';
import { BackLink, GateNotice, scheduledFrom } from '../../components/studentBits.jsx';

const podiumStyle = [
  'from-amber-300 to-amber-500 text-amber-950', // 1st
  'from-slate-200 to-slate-400 text-slate-900', // 2nd
  'from-orange-300 to-orange-500 text-orange-950', // 3rd
];

function Podium({ top }) {
  // display order 2nd, 1st, 3rd
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="mb-8 grid grid-cols-3 items-end gap-2 sm:gap-4">
      {order.map((r) => {
        const i = r.rank - 1;
        return (
          <div key={r.rank} className={cx('flex flex-col items-center rounded-2xl bg-gradient-to-b px-2 pb-4 pt-5 text-center shadow-soft', podiumStyle[i], i === 0 ? 'pb-8 pt-8' : '')}>
            {i === 0 && <Crown className="mb-1 h-6 w-6" aria-hidden />}
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/60 text-lg font-extrabold">{r.rank}</span>
            <p className="mt-2 w-full truncate text-sm font-extrabold sm:text-base">{r.name}{r.isMe ? ' (you)' : ''}</p>
            <p className="text-xl font-extrabold sm:text-2xl">{num(r.score)}</p>
            <p className="text-[11px] font-semibold opacity-80">{fmtDuration(r.timeTakenSeconds)}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function Leaderboard() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch(() => api.get(`/student/competitions/${id}/leaderboard`), [id]);
  const [q, setQ] = useState('');
  const items = data?.items || [];
  const me = items.find((r) => r.isMe);
  const filtered = useMemo(() => items.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())), [items, q]);

  if (loading) return <PageLoader label="Loading leaderboard..." />;
  if (error?.code === 'RESULTS_NOT_RELEASED' || error?.code === 'LEADERBOARD_OFF') {
    const off = error.code === 'LEADERBOARD_OFF';
    const at = scheduledFrom(error);
    return (
      <>
        <BackLink to={`/competitions/${id}`}>Competition</BackLink>
        <GateNotice icon={Lock} title={off ? 'Leaderboard is disabled' : 'Leaderboard not published yet'} action={<Link to="/"><Button variant="secondary">Back to dashboard</Button></Link>}>
          {off ? 'The organiser has chosen not to show a public ranking for this competition.' : at ? `Rankings will appear on ${fmtDateTime(at)}.` : 'Rankings appear when the organiser publishes the results.'}
        </GateNotice>
      </>
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<BackLink to={`/competitions/${id}`}>{data.competition.title}</BackLink>} title="Leaderboard" subtitle={`${items.length} participant${items.length === 1 ? '' : 's'} · ranked by score, then fastest time`} />

      {!items.length ? (
        <EmptyState icon={Trophy} title="No submissions yet">Rankings will appear here once participants have submitted.</EmptyState>
      ) : (
        <>
          {me && (
            <Card className="mb-6 flex items-center justify-between gap-4 bg-gradient-to-r from-brand-600 to-violet-600 p-5 text-white ring-0">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-100">Your position</p>
                <p className="text-3xl font-extrabold">#{me.rank}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-extrabold">{num(me.score)} <span className="text-base font-semibold text-brand-100">/ {num(me.maxScore)}</span></p>
                <p className="text-xs text-brand-100">{fmtDuration(me.timeTakenSeconds)}</p>
              </div>
            </Card>
          )}

          {items.length >= 3 && <Podium top={items.slice(0, 3)} />}

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="pl-10" aria-label="Search leaderboard" />
          </div>

          <Card className="overflow-hidden">
            <ol className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <li key={r.rank} className={cx('flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5', r.isMe && 'bg-brand-50')}>
                  <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold', r.rank <= 3 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600')}>{r.rank}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {r.name} {r.isMe && <Badge tone="brand" className="ml-1">You</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">{fmtDuration(r.timeTakenSeconds)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-extrabold text-slate-900">{num(r.score)}</p>
                    <p className="text-xs text-slate-500">{r.maxScore ? Math.round((r.score / r.maxScore) * 100) : 0}%</p>
                  </div>
                </li>
              ))}
              {!filtered.length && <li className="px-5 py-10 text-center text-sm text-slate-500">No one matches "{q}".</li>}
            </ol>
          </Card>
        </>
      )}
    </div>
  );
}
