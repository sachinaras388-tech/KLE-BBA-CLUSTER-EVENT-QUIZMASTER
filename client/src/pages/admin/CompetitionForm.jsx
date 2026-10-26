import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { fromLocalInput, toLocalInput } from '../../lib/format.js';
import { Alert, Button, Card, ErrorState, Field, Input, PageHeader, PageLoader, Select, Textarea, Toggle } from '../../components/ui.jsx';

const defaults = () => {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    title: '',
    description: '',
    instructions: 'Each question has one correct answer. You can change your answers until you submit or the timer ends. Your progress is saved automatically.',
    startTime: toLocalInput(start),
    endTime: toLocalInput(end),
    durationMinutes: 30,
    negativeEnabled: false,
    negativeFraction: 0.25,
    shuffleQuestions: false,
    shuffleOptions: false,
    maxAttempts: 1,
    visibility: 'assigned',
    showLeaderboard: true,
  };
};

export default function CompetitionForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(defaults);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const existing = useFetch(async () => {
    if (!editing) return null;
    const r = await api.get(`/admin/competitions/${id}`);
    return r.competition;
  }, [id]);

  useEffect(() => {
    const c = existing.data;
    if (!c) return;
    setForm({
      title: c.title,
      description: c.description || '',
      instructions: c.instructions || '',
      startTime: toLocalInput(c.startTime),
      endTime: toLocalInput(c.endTime),
      durationMinutes: c.durationMinutes,
      negativeEnabled: c.negativeMarking.enabled,
      negativeFraction: c.negativeMarking.fraction,
      shuffleQuestions: c.shuffleQuestions,
      shuffleOptions: c.shuffleOptions,
      maxAttempts: c.maxAttempts,
      visibility: c.visibility,
      showLeaderboard: c.showLeaderboard,
    });
    setLocked((c.stats?.submitted || 0) + (c.stats?.inProgress || 0) > 0);
  }, [existing.data]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setVal = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const windowMin = form.startTime && form.endTime ? (new Date(form.endTime) - new Date(form.startTime)) / 60000 : 0;
  const invalidWindow = form.startTime && form.endTime && windowMin <= 0;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const payload = {
      title: form.title,
      description: form.description,
      instructions: form.instructions,
      startTime: fromLocalInput(form.startTime),
      endTime: fromLocalInput(form.endTime),
      durationMinutes: Number(form.durationMinutes),
      negativeMarking: { enabled: form.negativeEnabled, fraction: Number(form.negativeFraction) },
      shuffleQuestions: form.shuffleQuestions,
      shuffleOptions: form.shuffleOptions,
      maxAttempts: Number(form.maxAttempts),
      visibility: form.visibility,
      showLeaderboard: form.showLeaderboard,
    };
    try {
      const r = editing ? await api.patch(`/admin/competitions/${id}`, payload) : await api.post('/admin/competitions', payload);
      toast.success(editing ? 'Competition updated' : 'Competition created - now add questions');
      navigate(`/admin/competitions/${r.competition.id}`);
    } catch (err) {
      setError(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  }

  if (editing && existing.loading) return <PageLoader />;
  if (editing && existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;

  return (
    <>
      <PageHeader
        back={<Link to={editing ? `/admin/competitions/${id}` : '/admin/competitions'} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Back</Link>}
        title={editing ? 'Edit competition' : 'New competition'}
        subtitle="Times are shown in your local time zone and enforced by the server."
      />
      <form onSubmit={submit} className="max-w-3xl space-y-6" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {locked && <Alert tone="warning" title="Attempts exist">Duration, negative marking and shuffle settings are locked. You can still extend the schedule or edit text.</Alert>}

        <Card className="space-y-5 p-5 sm:p-6">
          <h2 className="text-base font-bold">Basics</h2>
          <Field label="Title"><Input value={form.title} onChange={set('title')} maxLength={160} required placeholder="Inter-school Science Quiz 2026" /></Field>
          <Field label="Short description (optional)"><Textarea value={form.description} onChange={set('description')} maxLength={2000} rows={2} /></Field>
          <Field label="Instructions shown in the lobby" hint="Rules, topics, marking scheme, etc."><Textarea value={form.instructions} onChange={set('instructions')} maxLength={5000} rows={5} /></Field>
        </Card>

        <Card className="space-y-5 p-5 sm:p-6">
          <h2 className="text-base font-bold">Schedule</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Opens at"><Input type="datetime-local" value={form.startTime} onChange={set('startTime')} required /></Field>
            <Field label="Closes at" error={invalidWindow ? 'Must be after the opening time' : undefined}><Input type="datetime-local" value={form.endTime} onChange={set('endTime')} required invalid={invalidWindow} /></Field>
          </div>
          <Field label="Time allowed per attempt (minutes)" hint={windowMin > 0 && Number(form.durationMinutes) > windowMin ? 'Longer than the window - attempts will be cut off at the closing time.' : 'The timer starts when the participant begins. It never runs past the closing time.'}>
            <Input type="number" min={1} max={600} value={form.durationMinutes} onChange={set('durationMinutes')} disabled={locked} required className="sm:max-w-[12rem]" />
          </Field>
        </Card>

        <Card className="space-y-5 p-5 sm:p-6">
          <h2 className="text-base font-bold">Rules</h2>
          <Toggle label="Negative marking" description="Deduct a fraction of a question's marks for each wrong answer. Unanswered questions are never penalised." checked={form.negativeEnabled} onChange={setVal('negativeEnabled')} disabled={locked} />
          {form.negativeEnabled && (
            <Field label="Penalty per wrong answer">
              <Select value={form.negativeFraction} onChange={set('negativeFraction')} disabled={locked} className="sm:max-w-[16rem]">
                <option value={0.25}>25% of the question's marks</option>
                <option value={0.33}>33% of the question's marks</option>
                <option value={0.5}>50% of the question's marks</option>
                <option value={1}>100% of the question's marks</option>
              </Select>
            </Field>
          )}
          <Toggle label="Shuffle question order" description="Each participant gets their own random order." checked={form.shuffleQuestions} onChange={setVal('shuffleQuestions')} disabled={locked} />
          <Toggle label="Shuffle answer options" checked={form.shuffleOptions} onChange={setVal('shuffleOptions')} disabled={locked} />
          <Field label="Attempts allowed per participant" hint="You can grant individual participants extra attempts later.">
            <Select value={form.maxAttempts} onChange={set('maxAttempts')} className="sm:max-w-[12rem]">
              {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
        </Card>

        <Card className="space-y-5 p-5 sm:p-6">
          <h2 className="text-base font-bold">Audience & results</h2>
          <Field label="Who can see this competition?">
            <Select value={form.visibility} onChange={set('visibility')} className="sm:max-w-[22rem]">
              <option value="assigned">Only participants I assign</option>
              <option value="all">All active participants</option>
            </Select>
          </Field>
          <Toggle label="Show leaderboard after results are published" checked={form.showLeaderboard} onChange={setVal('showLeaderboard')} />
          <p className="text-xs text-slate-500">Publishing results and the answer key is controlled separately from the competition page, after it closes.</p>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link to={editing ? `/admin/competitions/${id}` : '/admin/competitions'}><Button variant="secondary" className="w-full sm:w-auto">Cancel</Button></Link>
          <Button type="submit" loading={busy} disabled={!form.title.trim() || invalidWindow} className="sm:min-w-[10rem]">{editing ? 'Save changes' : 'Create competition'}</Button>
        </div>
      </form>
    </>
  );
}
