import { useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { fmtDateTime } from '../../lib/format.js';
import { Badge, EmptyState, ErrorState, Input, PageHeader, Pagination, Skeleton, TableWrap, useDebounced } from '../../components/ui.jsx';

const tone = (a) => (/FAILED|BLOCKED|DEACTIVATED|DELETED|FORCE/.test(a) ? 'red' : /CREATED|PUBLISH|ACTIVATED|SUCCESS|GRANTED/.test(a) ? 'green' : /RESET|CHANGED|UPDATED|RELEASE|SCHEDULE/.test(a) ? 'amber' : 'slate');
const label = (a) => a.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default function AuditLog() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useFetch(() => api.get(`/admin/audit-logs${qs({ q: dq, page, limit: 30 })}`), [dq, page]);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Sign-ins, submissions and every administrative action, with timestamps." />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Filter by actor (ID or email)" className="pl-10" aria-label="Filter audit log" />
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-64" />}
      {data && data.items.length === 0 && <EmptyState icon={ScrollText} title="No log entries" />}
      {data && data.items.length > 0 && (
        <>
          <TableWrap>
            <thead className="bg-slate-50"><tr><th className="th">When</th><th className="th">Action</th><th className="th">Actor</th><th className="th hidden lg:table-cell">Details</th><th className="th hidden md:table-cell">IP</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((l) => (
                <tr key={l.id}>
                  <td className="td whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                  <td className="td"><Badge tone={tone(l.action)}>{label(l.action)}</Badge></td>
                  <td className="td font-mono text-xs">{l.actorLabel || '-'}</td>
                  <td className="td hidden max-w-xs truncate text-xs text-slate-500 lg:table-cell" title={l.meta ? JSON.stringify(l.meta) : ''}>{l.meta ? JSON.stringify(l.meta) : '-'}</td>
                  <td className="td hidden font-mono text-xs md:table-cell">{l.ip || '-'}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </>
  );
}
