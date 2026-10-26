import { useState } from 'react';
import { Plus, Search, Users, Pencil, KeyRound, UserX, UserCheck, Upload, Download, AlertTriangle } from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { downloadCsvText, fmtDateTime } from '../../lib/format.js';
import {
  Alert, Badge, Button, ConfirmModal, CopyButton, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, Select, Skeleton, Textarea, TableWrap, useDebounced,
} from '../../components/ui.jsx';

/* One-time credentials viewer (passwords are never retrievable again) */
function CredentialsModal({ credentials, onClose }) {
  if (!credentials) return null;
  const rows = credentials;
  return (
    <Modal
      open
      onClose={onClose}
      title="Participant credentials"
      size="lg"
      footer={
        <>
          <Button
            variant="secondary"
            icon={Download}
            onClick={() =>
              downloadCsvText(
                [['Name', 'Participant ID', 'Temporary password'], ...rows.map((r) => [r.name, r.participantId, r.temporaryPassword])],
                `quizmaster-credentials-${new Date().toISOString().slice(0, 10)}.csv`
              )
            }
          >
            Download CSV
          </Button>
          <Button onClick={onClose}>I have saved these</Button>
        </>
      }
    >
      <Alert tone="warning" title="Shown only once">
        Temporary passwords are stored hashed and cannot be viewed again. Share them securely - participants must set their own password at first sign-in.
      </Alert>
      <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50"><tr><th className="th">Name</th><th className="th">Participant ID</th><th className="th">Temporary password</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.participantId}>
                <td className="td font-semibold text-slate-900">{r.name}</td>
                <td className="td font-mono">{r.participantId} <CopyButton text={r.participantId} /></td>
                <td className="td font-mono">{r.temporaryPassword} <CopyButton text={r.temporaryPassword} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function UserForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(initial);
  const [form, setForm] = useState({ name: initial?.name || '', email: initial?.email || '', organization: initial?.organization || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing) {
        await api.patch(`/admin/users/${initial.id}`, { name: form.name, email: form.email || '', organization: form.organization || null });
        toast.success('Participant updated');
        onSaved();
      } else {
        const r = await api.post('/admin/users', { name: form.name, email: form.email || undefined, organization: form.organization || undefined });
        onSaved([r.credentials]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit participant' : 'Add participant'} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="user-form" loading={busy} disabled={form.name.trim().length < 2}>{editing ? 'Save changes' : 'Create & generate credentials'}</Button>
      </>
    }>
      <form id="user-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {editing && <p className="text-sm text-slate-500">Participant ID: <span className="font-mono font-semibold text-slate-800">{initial.participantId}</span></p>}
        <Field label="Full name"><Input value={form.name} onChange={set('name')} required maxLength={100} /></Field>
        <Field label="Email (optional)"><Input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="School / organization (optional)"><Input value={form.organization} onChange={set('organization')} maxLength={120} /></Field>
        {!editing && <p className="text-xs text-slate-500">A unique participant ID and a strong temporary password are generated automatically.</p>}
      </form>
    </Modal>
  );
}

function BulkForm({ onClose, onSaved }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const parsed = lines.map((l) => {
    const [name, email, organization] = l.split(',').map((s) => s.trim());
    return { name, email: email || undefined, organization: organization || undefined };
  });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/admin/users/bulk', { participants: parsed });
      onSaved(r.created, r.failed);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Bulk add participants" size="lg" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="bulk-form" loading={busy} disabled={!parsed.length || parsed.length > 50}>Create {parsed.length || ''} participant{parsed.length === 1 ? '' : 's'}</Button>
      </>
    }>
      <form id="bulk-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="One participant per line" hint="Format: Name, email (optional), organization (optional). Up to 50 per batch.">
          <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Aarav Sharma, aarav@example.com, Green Valley School\nDiya Patel\nKabir Singh, , Green Valley School'} className="font-mono text-xs" />
        </Field>
        {parsed.length > 50 && <Alert tone="error">Too many lines - maximum 50 per batch.</Alert>}
      </form>
    </Modal>
  );
}

export default function Participants() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useFetch(() => api.get(`/admin/users${qs({ q: dq, status, page, limit: 15 })}`), [dq, status, page]);

  const [creds, setCreds] = useState(null);
  const [form, setForm] = useState(null); // null | 'new' | user
  const [bulk, setBulk] = useState(false);
  const [confirm, setConfirm] = useState(null); // {type, user}
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState([]);

  async function runConfirm() {
    setBusy(true);
    try {
      const { type, user } = confirm;
      if (type === 'reset') {
        const r = await api.post(`/admin/users/${user.id}/reset-password`);
        setCreds([r.credentials]);
      } else {
        await api.patch(`/admin/users/${user.id}`, { isActive: type === 'activate' });
        toast.success(type === 'activate' ? 'Participant re-activated' : 'Participant deactivated and signed out');
      }
      setConfirm(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Participants"
        subtitle="Create accounts and manage access. There is no public registration."
        actions={
          <>
            <Button variant="secondary" icon={Upload} onClick={() => setBulk(true)}>Bulk add</Button>
            <Button icon={Plus} onClick={() => setForm('new')}>Add participant</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search by name, ID, email or organization" className="pl-10" aria-label="Search participants" />
        </div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-44" aria-label="Filter by status">
          <option value="all">All accounts</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </Select>
      </div>

      {failed.length > 0 && (
        <Alert tone="warning" title={`${failed.length} entr${failed.length === 1 ? 'y' : 'ies'} could not be created`} className="mb-4">
          {failed.map((f) => <p key={f.name}>{f.name}: {f.reason}</p>)}
        </Alert>
      )}

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>}

      {data && data.items.length === 0 && (
        <EmptyState icon={Users} title={dq || status !== 'all' ? 'No matching participants' : 'No participants yet'} action={!dq && status === 'all' && <Button icon={Plus} onClick={() => setForm('new')}>Add the first participant</Button>}>
          {dq || status !== 'all' ? 'Try a different search or filter.' : 'Add participants to generate their IDs and temporary passwords.'}
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        <>
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Participant</th>
                <th className="th">ID</th>
                <th className="th hidden md:table-cell">Organization</th>
                <th className="th hidden lg:table-cell">Last sign-in</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="td">
                    <p className="font-semibold text-slate-900">{u.name}</p>
                    {u.email && <p className="text-xs text-slate-500">{u.email}</p>}
                  </td>
                  <td className="td font-mono text-xs">{u.participantId}</td>
                  <td className="td hidden md:table-cell">{u.organization || '-'}</td>
                  <td className="td hidden lg:table-cell">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'}</td>
                  <td className="td">
                    {u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}
                    {u.mustChangePassword && <Badge tone="amber" className="ml-1">Temp password</Badge>}
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setForm(u)} aria-label={`Edit ${u.name}`} title="Edit" />
                      <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => setConfirm({ type: 'reset', user: u })} aria-label={`Reset password for ${u.name}`} title="Reset password" />
                      {u.isActive ? (
                        <Button variant="ghost" size="sm" icon={UserX} className="text-rose-600" onClick={() => setConfirm({ type: 'deactivate', user: u })} aria-label={`Deactivate ${u.name}`} title="Deactivate" />
                      ) : (
                        <Button variant="ghost" size="sm" icon={UserCheck} className="text-emerald-600" onClick={() => setConfirm({ type: 'activate', user: u })} aria-label={`Activate ${u.name}`} title="Activate" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
          <p className="mt-2 text-xs text-slate-400">{data.total} participant{data.total === 1 ? '' : 's'}</p>
        </>
      )}

      {form && (
        <UserForm
          initial={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          onSaved={(c) => { setForm(null); if (c) setCreds(c); reload(); }}
        />
      )}
      {bulk && (
        <BulkForm
          onClose={() => setBulk(false)}
          onSaved={(created, f) => { setBulk(false); setFailed(f); if (created.length) setCreds(created); reload(); }}
        />
      )}
      <CredentialsModal credentials={creds} onClose={() => setCreds(null)} />
      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        loading={busy}
        tone={confirm?.type === 'activate' ? 'success' : confirm?.type === 'reset' ? 'primary' : 'danger'}
        title={confirm?.type === 'reset' ? 'Reset password?' : confirm?.type === 'activate' ? 'Re-activate account?' : 'Deactivate account?'}
        confirmLabel={confirm?.type === 'reset' ? 'Reset & show new password' : confirm?.type === 'activate' ? 'Activate' : 'Deactivate'}
      >
        {confirm?.type === 'reset' && <>A new temporary password will be generated for <b>{confirm.user.name}</b>. Any signed-in sessions are ended immediately.</>}
        {confirm?.type === 'deactivate' && <>{confirm.user.name} will be signed out immediately and will not be able to sign in. Their past attempts are kept.</>}
        {confirm?.type === 'activate' && <>{confirm.user.name} will be able to sign in again.</>}
      </ConfirmModal>
    </>
  );
}
