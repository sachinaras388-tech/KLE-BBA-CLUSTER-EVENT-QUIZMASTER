import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Trash2, Plus, Eye, ListChecks, Settings2, Activity, BarChart3, Users, Download, Upload, Send, Archive, CalendarClock, EyeOff, RefreshCw, Rocket, ShieldAlert,
} from 'lucide-react';
import { api, downloadFile, qs } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { downloadCsvText, fmtDateTime, fmtDuration, fromLocalInput, num, toLocalInput } from '../../lib/format.js';
import {
  Alert, Badge, Button, Card, ConfirmModal, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, PhaseBadge, Select, StatCard, StatusBadge, Tabs, TableWrap, Textarea, Skeleton, cx,
} from '../../components/ui.jsx';

/* =============================== Questions =============================== */
const blankQ = () => ({ text: '', options: ['', '', '', ''], correctIndex: 0, explanation: '', marks: 1 });

function QuestionModal({ compId, initial, locked, onClose, onSaved }) {
  const toast = useToast();
  const [q, setQ] = useState(initial ? { ...initial } : blankQ());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setOpt = (i, v) => setQ((x) => ({ ...x, options: x.options.map((o, j) => (j === i ? v : o)) }));
  const canAdd = !locked && q.options.length < 6;
  const canRemove = !locked && q.options.length > 2;

  function removeOption(i) {
    setQ((x) => ({
      ...x,
      options: x.options.filter((_, j) => j !== i),
      correctIndex: x.correctIndex === i ? 0 : x.correctIndex > i ? x.correctIndex - 1 : x.correctIndex,
    }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { text: q.text, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, marks: Number(q.marks) };
    try {
      if (initial) await api.put(`/admin/competitions/${compId}/questions/${initial.id}`, body);
      else await api.post(`/admin/competitions/${compId}/questions`, body);
      toast.success(initial ? 'Question updated' : 'Question added');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={initial ? 'Edit question' : 'Add question'} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="q-form" loading={busy}>{initial ? 'Save question' : 'Add question'}</Button>
      </>
    }>
      <form id="q-form" onSubmit={save} className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        {locked && <Alert tone="warning">Attempts exist. You can fix wording, marks and the correct answer (all scores are recalculated automatically), but not the number of options.</Alert>}
        <Field label="Question"><Textarea rows={3} value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} maxLength={2000} required /></Field>
        <fieldset>
          <legend className="label">Options - select the correct one</legend>
          <div className="space-y-2.5">
            {q.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="correct" checked={q.correctIndex === i} onChange={() => setQ({ ...q, correctIndex: i })} className="h-5 w-5 shrink-0 accent-emerald-600" aria-label={`Mark option ${i + 1} as correct`} />
                <span className="w-5 shrink-0 text-sm font-bold text-slate-400">{String.fromCharCode(65 + i)}</span>
                <Input value={o} onChange={(e) => setOpt(i, e.target.value)} maxLength={500} placeholder={`Option ${i + 1}`} required aria-label={`Option ${i + 1}`} className={q.correctIndex === i ? '!ring-emerald-500 bg-emerald-50/40' : ''} />
                {canRemove && <button type="button" onClick={() => removeOption(i)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove option ${i + 1}`}><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
          {canAdd && <Button variant="ghost" size="sm" icon={Plus} className="mt-3" onClick={() => setQ({ ...q, options: [...q.options, ''] })}>Add option</Button>}
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
          <Field label="Explanation (shown after answers are released)"><Textarea rows={3} value={q.explanation} onChange={(e) => setQ({ ...q, explanation: e.target.value })} maxLength={3000} /></Field>
          <Field label="Marks"><Input type="number" min={0.25} max={100} step={0.25} value={q.marks} onChange={(e) => setQ({ ...q, marks: e.target.value })} required /></Field>
        </div>
      </form>
    </Modal>
  );
}

function parseCsvQuestions(csvText) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      if (current.trim()) lines.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current);

  const splitRow = (row) => {
    const fields = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      const n = row[i + 1];
      if (c === '"') {
        if (inQ && n === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === ',' && !inQ) {
        fields.push(field.trim());
        field = '';
      } else {
        field += c;
      }
    }
    fields.push(field.trim());
    return fields;
  };

  const parsed = [];
  const errors = [];
  let startIdx = 0;

  if (lines.length > 0) {
    const header = splitRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (header[0]?.includes('question') || header[1]?.includes('option')) {
      startIdx = 1;
    }
  }

  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (!cols.length || (cols.length === 1 && !cols[0])) continue;
    const text = cols[0];
    if (!text) {
      errors.push(`Row ${i + 1}: Missing question text.`);
      continue;
    }

    let rawOptions = [];
    let correctRaw = 'A';
    let marksRaw = 1;
    let explanation = '';

    if (cols.length >= 6) {
      const col5 = cols[5]?.trim();
      const col4 = cols[4]?.trim();
      if (/^[a-fA-F0-9]$/.test(col5)) {
        rawOptions = cols.slice(1, 5).filter(Boolean);
        correctRaw = col5;
        marksRaw = cols[6] || 1;
        explanation = cols[7] || '';
      } else if (/^[a-fA-F0-9]$/.test(col4)) {
        rawOptions = cols.slice(1, 4).filter(Boolean);
        correctRaw = col4;
        marksRaw = cols[5] || 1;
        explanation = cols[6] || '';
      } else {
        rawOptions = [cols[1], cols[2], cols[3], cols[4]].filter(Boolean);
        correctRaw = cols[5] || 'A';
        marksRaw = cols[6] || 1;
        explanation = cols[7] || '';
      }
    } else if (cols.length === 5) {
      rawOptions = [cols[1], cols[2], cols[3]].filter(Boolean);
      correctRaw = cols[4] || 'A';
    } else if (cols.length === 4) {
      rawOptions = [cols[1], cols[2]].filter(Boolean);
      correctRaw = cols[3] || 'A';
    } else {
      errors.push(`Row ${i + 1}: Not enough columns (need Question, options, and Correct Option).`);
      continue;
    }

    if (rawOptions.length < 2) {
      errors.push(`Row ${i + 1}: Must provide at least 2 options.`);
      continue;
    }

    let correctIndex = 0;
    const cr = String(correctRaw).trim().toUpperCase();
    if (['A', 'B', 'C', 'D', 'E', 'F'].includes(cr)) {
      correctIndex = cr.charCodeAt(0) - 65;
    } else if (/^[1-6]$/.test(cr)) {
      correctIndex = parseInt(cr, 10) - 1;
    } else if (/^[0-5]$/.test(cr)) {
      correctIndex = parseInt(cr, 10);
    } else {
      const matchIdx = rawOptions.findIndex((o) => o.toLowerCase() === cr.toLowerCase());
      if (matchIdx !== -1) correctIndex = matchIdx;
      else correctIndex = 0;
    }

    if (correctIndex >= rawOptions.length) {
      correctIndex = 0;
    }

    const marks = Math.max(0.25, Math.min(100, Number(marksRaw) || 1));

    const uniqueOpts = [];
    const seen = new Set();
    for (const opt of rawOptions) {
      let optText = opt;
      if (seen.has(optText.toLowerCase())) {
        optText = `${optText} (alt)`;
      }
      seen.add(optText.toLowerCase());
      uniqueOpts.push(optText);
    }

    parsed.push({
      text,
      options: uniqueOpts,
      correctIndex,
      marks,
      explanation: explanation || '',
    });
  }

  return { questions: parsed, errors };
}

function ImportModal({ compId, onClose, onSaved }) {
  const toast = useToast();
  const [tab, setTab] = useState('csv'); // 'csv' | 'json'
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(true);

  const sampleCsv = [
    'Question,Option A,Option B,Option C,Option D,Correct Option,Marks,Explanation',
    '"What is the capital of France?",Berlin,Madrid,Paris,Rome,C,1,"Paris is the capital of France."',
    '"Which data structure uses LIFO ordering?",Queue,Stack,Array,Tree,B,1,"Stack is Last-In-First-Out."',
    '"What is 12 * 12?",124,144,142,154,B,2,"12 squared equals 144."',
  ].join('\n');

  const sampleJson = JSON.stringify(
    {
      questions: [
        {
          text: 'What is the chemical symbol for Water?',
          options: ['H2O', 'CO2', 'O2', 'NaCl'],
          correctIndex: 0,
          explanation: 'Water is H2O.',
          marks: 1,
        },
        {
          text: 'Which planet is closest to the Sun?',
          options: ['Venus', 'Mercury', 'Mars', 'Earth'],
          correctIndex: 1,
          explanation: 'Mercury is closest.',
          marks: 1,
        },
      ],
    },
    null,
    2
  );

  function downloadTemplate() {
    downloadCsvText(
      [
        ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Option', 'Marks', 'Explanation'],
        ['What is the capital city of Australia?', 'Sydney', 'Melbourne', 'Canberra', 'Perth', 'C', '1', 'Canberra is the capital.'],
        ['Which planet has the most confirmed moons?', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'B', '2', 'Saturn has the most confirmed moons.'],
        ['What is 25 * 4?', '100', '125', '75', '150', 'A', '1', '25 * 4 = 100.'],
      ],
      'quizmaster-questions-template.csv'
    );
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isJson = file.name.endsWith('.json');
    setTab(isJson ? 'json' : 'csv');
    const reader = new FileReader();
    reader.onload = (event) => {
      setText(event.target?.result || '');
      setError('');
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // Live parsed questions
  const parsedData = useMemo(() => {
    if (!text.trim()) return { questions: [], errors: [] };
    if (tab === 'json') {
      try {
        const j = JSON.parse(text);
        const qs = Array.isArray(j) ? j : j.questions;
        if (!Array.isArray(qs)) return { questions: [], errors: ['JSON must contain an array of questions.'] };
        return { questions: qs, errors: [] };
      } catch {
        return { questions: [], errors: ['Invalid JSON syntax.'] };
      }
    } else {
      return parseCsvQuestions(text);
    }
  }, [text, tab]);

  async function run(e) {
    e.preventDefault();
    setError('');
    if (!parsedData.questions.length) {
      setError('No valid questions found to import.');
      return;
    }
    setBusy(true);
    try {
      const r = await api.post(`/admin/competitions/${compId}/questions/import`, { questions: parsedData.questions });
      toast.success(`${r.imported} questions successfully imported!`);
      onSaved();
    } catch (err) {
      setError(err.details?.[0] ? `${err.details[0].path}: ${err.details[0].message}` : err.message);
    } finally {
      setBusy(false);
    }
  }

  const totalMarks = parsedData.questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Bulk Import Questions"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="import-form" loading={busy} disabled={!parsedData.questions.length}>
            Import {parsedData.questions.length ? `${parsedData.questions.length} questions` : ''}
          </Button>
        </>
      }
    >
      <form id="import-form" onSubmit={run} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {parsedData.errors.length > 0 && (
          <Alert tone="warning">
            <p className="font-semibold">Some lines had warnings:</p>
            <ul className="mt-1 list-inside list-disc text-xs space-y-0.5 max-h-24 overflow-y-auto">
              {parsedData.errors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {parsedData.errors.length > 5 && <li>...and {parsedData.errors.length - 5} more issues.</li>}
            </ul>
          </Alert>
        )}

        {/* Tab switch & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              className={cx('rounded-lg px-3 py-1.5 transition', tab === 'csv' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900')}
              onClick={() => { setTab('csv'); if (!text) setText(sampleCsv); }}
            >
              📊 CSV / Spreadsheet
            </button>
            <button
              type="button"
              className={cx('rounded-lg px-3 py-1.5 transition', tab === 'json' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900')}
              onClick={() => { setTab('json'); if (!text) setText(sampleJson); }}
            >
              {'{ }'} JSON Array
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="btn btn-secondary btn-sm cursor-pointer">
              <Upload className="h-4 w-4" /> Upload File (.csv / .json)
              <input type="file" accept=".csv,.json,text/csv,application/json" onChange={handleFileUpload} className="hidden" />
            </label>
            {tab === 'csv' && (
              <Button type="button" variant="ghost" size="sm" icon={Download} onClick={downloadTemplate}>
                Download Template
              </Button>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
            <span>
              {tab === 'csv'
                ? 'Columns: Question, Option A, Option B, Option C, Option D, Correct Option (A/B/C/D), Marks, Explanation'
                : 'JSON format: [{ text, options, correctIndex, marks, explanation }]'}
            </span>
            <button
              type="button"
              className="text-brand-600 font-semibold hover:underline"
              onClick={() => setText(tab === 'csv' ? sampleCsv : sampleJson)}
            >
              Load Example
            </button>
          </div>
          <Textarea
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="font-mono text-xs leading-relaxed"
            placeholder={tab === 'csv' ? sampleCsv : sampleJson}
            spellCheck={false}
          />
        </div>

        {/* Live parsed summary & Preview */}
        {parsedData.questions.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">✓</span>
                <span className="text-sm font-bold text-emerald-900">
                  {parsedData.questions.length} questions detected
                </span>
                <Badge tone="good">{totalMarks} total marks</Badge>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-emerald-700 hover:underline"
                onClick={() => setPreviewOpen(!previewOpen)}
              >
                {previewOpen ? 'Hide Preview' : 'Show Preview'}
              </button>
            </div>

            {previewOpen && (
              <div className="mt-3 max-h-48 overflow-y-auto space-y-2 pr-1">
                {parsedData.questions.map((q, idx) => (
                  <div key={idx} className="rounded-lg bg-white p-2.5 text-xs ring-1 ring-slate-200">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-800">
                        {idx + 1}. {q.text}
                      </span>
                      <span className="shrink-0 font-bold text-slate-500">{q.marks} mk</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {q.options.map((opt, oIdx) => (
                        <span
                          key={oIdx}
                          className={cx(
                            'rounded px-2 py-0.5 text-[11px]',
                            oIdx === q.correctIndex ? 'bg-emerald-100 font-bold text-emerald-800 ring-1 ring-emerald-300' : 'bg-slate-100 text-slate-600'
                          )}
                        >
                          {String.fromCharCode(65 + oIdx)}: {opt}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

function QuestionsTab({ comp, onChanged }) {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch(() => api.get(`/admin/competitions/${comp.id}/questions`), [comp.id]);
  const [edit, setEdit] = useState(null); // null | 'new' | question
  const [imp, setImp] = useState(false);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const locked = (comp.stats?.submitted || 0) + (comp.stats?.inProgress || 0) > 0;

  const refresh = () => { reload(); onChanged(); };

  async function move(i, dir) {
    const ids = data.items.map((q) => q.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await api.put(`/admin/competitions/${comp.id}/questions/order`, { ids });
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/admin/competitions/${comp.id}/questions/${del.id}`);
      toast.success('Question deleted');
      setDel(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{comp.questionCount} questions - {comp.totalMarks} total marks</p>
        <div className="flex gap-2">
          {!locked && <Button variant="secondary" icon={Upload} onClick={() => setImp(true)}>Bulk Import Questions</Button>}
          {!locked && <Button icon={Plus} onClick={() => setEdit('new')}>Add question</Button>}
        </div>
      </div>
      {locked && <Alert tone="info" className="mb-4">Attempts exist, so questions can't be added, removed or reordered. Edit a question to fix wording or the answer key - scores are recalculated automatically.</Alert>}
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
      {data && data.items.length === 0 && (
        <EmptyState icon={ListChecks} title="No questions yet" action={<Button icon={Plus} onClick={() => setEdit('new')}>Add the first question</Button>}>Add multiple-choice questions, or import a JSON file.</EmptyState>
      )}
      <ol className="space-y-3">
        {data?.items.map((q, i) => (
          <li key={q.id}>
            <Card className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap font-semibold text-slate-900">{q.text}</p>
                  <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {q.options.map((o, j) => (
                      <li key={o.id} className={cx('flex items-start gap-2 rounded-lg px-3 py-2 text-sm', j === q.correctIndex ? 'bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-700')}>
                        <span className="font-bold opacity-60">{String.fromCharCode(65 + j)}</span> <span className="min-w-0 break-words">{o.text}</span>
                      </li>
                    ))}
                  </ul>
                  {q.explanation && <p className="mt-3 text-xs text-slate-500"><b>Explanation:</b> {q.explanation}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2"><Badge tone="brand">{q.marks} mark{q.marks === 1 ? '' : 's'}</Badge></div>
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  {!locked && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</Button>
                      <Button variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === data.items.length - 1} aria-label="Move down" title="Move down">↓</Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEdit(q)} aria-label="Edit question" />
                  {!locked && <Button variant="ghost" size="sm" icon={Trash2} className="text-rose-600" onClick={() => setDel(q)} aria-label="Delete question" />}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      {edit && <QuestionModal compId={comp.id} locked={locked} initial={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
      {imp && <ImportModal compId={comp.id} onClose={() => setImp(false)} onSaved={() => { setImp(false); refresh(); }} />}
      <ConfirmModal open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} loading={busy} title="Delete question?" confirmLabel="Delete">This permanently removes the question.</ConfirmModal>
    </div>
  );
}

/* =============================== Participants / access =============================== */
function AccessTab({ comp, onChanged }) {
  const toast = useToast();
  const [visibility, setVisibility] = useState(comp.visibility);
  const [selected, setSelected] = useState(() => new Set());
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const users = useFetch(() => api.get(`/admin/users${qs({ status: 'active', limit: 200 })}`), []);
  const full = useFetch(async () => {
    const r = await api.get(`/admin/competitions/${comp.id}`);
    return r.competition;
  }, [comp.id]);

  // assignedParticipants comes back from the admin endpoint
  useMemo(() => {
    if (full.data && !loaded) {
      setSelected(new Set((full.data.assignedParticipants || []).map(String)));
      setLoaded(true);
    }
  }, [full.data, loaded]);

  const list = (users.data?.items || []).filter((u) => !search || `${u.name} ${u.participantId}`.toLowerCase().includes(search.toLowerCase()));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function save() {
    setBusy(true);
    try {
      await api.put(`/admin/competitions/${comp.id}/assignments`, { visibility, participantIds: [...selected] });
      toast.success('Audience saved');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-bold">Who can enter?</h2>
      <Select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="mt-3 sm:max-w-sm" aria-label="Audience">
        <option value="assigned">Only the participants selected below</option>
        <option value="all">All active participants</option>
      </Select>
      {visibility === 'assigned' && (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Input placeholder="Search participants" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" aria-label="Search participants" />
            <Button variant="secondary" size="sm" onClick={() => setSelected(new Set(list.map((u) => u.id)))}>Select all shown</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
            <span className="text-sm text-slate-500">{selected.size} selected</span>
          </div>
          {users.loading ? <Skeleton className="h-40" /> : list.length === 0 ? (
            <EmptyState icon={Users} title="No participants">Create participants first on the Participants page.</EmptyState>
          ) : (
            <ul className="grid max-h-96 gap-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">
              {list.map((u) => (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{u.name}</span><span className="font-mono text-xs text-slate-500">{u.participantId}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-6 flex justify-end"><Button onClick={save} loading={busy}>Save audience</Button></div>
    </Card>
  );
}

/* =============================== Monitor =============================== */
function MonitorTab({ comp }) {
  const toast = useToast();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useFetch(() => api.get(`/admin/competitions/${comp.id}/attempts${qs({ status, q })}`), [comp.id, status, q], { interval: 15000 });
  const [force, setForce] = useState(null);
  const [grant, setGrant] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  async function doForce() {
    setBusy(true);
    try {
      await api.post(`/admin/attempts/${force.id}/force-submit`);
      toast.success('Attempt submitted');
      setForce(null);
      reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function doGrant() {
    setBusy(true);
    try {
      await api.post(`/admin/competitions/${comp.id}/grant-attempt`, { userId: grant.user.id, extra: 1 });
      toast.success('One extra attempt granted');
      setGrant(null);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function openDetail(id) {
    try { setDetail(await api.get(`/admin/attempts/${id}`)); } catch (err) { toast.error(err.message); }
  }

  const s = data?.summary;
  return (
    <div className="space-y-5">
      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Eligible" value={s.eligible} icon={Users} />
          <StatCard label="In progress" value={s.inProgress} icon={Activity} tone="sky" />
          <StatCard label="Submitted" value={s.submitted} icon={ListChecks} tone="green" />
          <StatCard label="Not started" value={s.notStarted} icon={CalendarClock} tone="amber" />
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or ID" className="sm:max-w-xs" aria-label="Search" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-48" aria-label="Status filter">
          <option value="all">All</option><option value="in_progress">In progress</option><option value="submitted">Submitted</option><option value="not_started">Not started</option>
        </Select>
        <Button variant="secondary" icon={RefreshCw} onClick={reload}>Refresh</Button>
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-48" />}
      {data && data.items.length === 0 && <EmptyState icon={Activity} title="Nothing to show">No participants match this filter yet.</EmptyState>}
      {data && data.items.length > 0 && (
        <TableWrap>
          <thead className="bg-slate-50"><tr><th className="th">Participant</th><th className="th">Status</th><th className="th hidden md:table-cell">Started</th><th className="th hidden md:table-cell">Submitted</th><th className="th">Progress</th><th className="th">Score</th><th className="th text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((r) => (
              <tr key={r.id}>
                <td className="td"><p className="font-semibold text-slate-900">{r.user?.name}</p><p className="font-mono text-xs text-slate-500">{r.user?.participantId}</p></td>
                <td className="td"><StatusBadge status={r.status} />{r.attemptNumber > 1 && <span className="ml-1 text-xs text-slate-400">#{r.attemptNumber}</span>}</td>
                <td className="td hidden md:table-cell">{r.startedAt ? fmtDateTime(r.startedAt) : '-'}</td>
                <td className="td hidden md:table-cell">{r.submittedAt ? fmtDateTime(r.submittedAt) : '-'}</td>
                <td className="td">{r.totalQuestions ? `${r.answered}/${r.totalQuestions}` : '-'}</td>
                <td className="td font-semibold">{r.score === null || r.score === undefined ? '-' : `${num(r.score)} / ${num(r.maxScore)}`}</td>
                <td className="td">
                  <div className="flex justify-end gap-1">
                    {r.status === 'in_progress' && <Button variant="ghost" size="sm" icon={Send} onClick={() => setForce(r)} title="Force submit" aria-label="Force submit" />}
                    {r.status !== 'in_progress' && r.status !== 'not_started' && <Button variant="ghost" size="sm" icon={Eye} onClick={() => openDetail(r.id)} title="View answers" aria-label="View answers" />}
                    {r.status !== 'in_progress' && r.user && <Button variant="ghost" size="sm" icon={Plus} onClick={() => setGrant(r)} title="Grant extra attempt" aria-label="Grant extra attempt" />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <ConfirmModal open={Boolean(force)} onClose={() => setForce(null)} onConfirm={doForce} loading={busy} title="Force-submit this attempt?" confirmLabel="Submit now" tone="primary">
        {force?.user?.name}'s saved answers will be graded and the attempt locked. This is recorded in the audit log.
      </ConfirmModal>
      <ConfirmModal open={Boolean(grant)} onClose={() => setGrant(null)} onConfirm={doGrant} loading={busy} title="Grant an extra attempt?" confirmLabel="Grant" tone="primary">
        {grant?.user?.name} will be allowed one more attempt, within the competition window.
      </ConfirmModal>
      {detail && (
        <Modal open onClose={() => setDetail(null)} size="xl" title={`${detail.attempt.user?.name} - ${num(detail.attempt.score)} / ${num(detail.attempt.maxScore)}`}>
          <p className="mb-4 text-sm text-slate-500">Submitted {fmtDateTime(detail.attempt.submittedAt)} - time taken {fmtDuration(detail.attempt.timeTakenSeconds)}</p>
          <ol className="space-y-4">
            {detail.questions.map((q, i) => (
              <li key={q.id} className="rounded-xl border border-slate-200 p-4">
                <p className="font-semibold text-slate-900">{i + 1}. {q.text} <span className="ml-1 text-xs font-bold text-slate-400">({q.awarded > 0 ? '+' : ''}{q.awarded})</span></p>
                <ul className="mt-2 space-y-1">
                  {q.options.map((o) => {
                    const correct = o.id === q.correctOptionId;
                    const chosen = o.id === q.selectedOptionId;
                    return <li key={o.id} className={cx('rounded-lg px-3 py-1.5 text-sm', correct && 'bg-emerald-50 font-semibold text-emerald-800', chosen && !correct && 'bg-rose-50 font-semibold text-rose-800')}>{o.text}{correct && '  (correct)'}{chosen && ' - selected'}</li>;
                  })}
                </ul>
                {!q.selectedOptionId && <p className="mt-2 text-xs text-slate-400">Not answered</p>}
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </div>
  );
}

/* =============================== Results & publishing =============================== */
function ReleaseCard({ comp, kind, title, description, onChanged }) {
  const toast = useToast();
  const state = kind === 'results' ? comp.resultsState : comp.answersState;
  const [when, setWhen] = useState(toLocalInput(state.scheduledAt) || '');
  const [busy, setBusy] = useState(false);
  const closed = comp.phase === 'closed';

  async function act(action) {
    setBusy(true);
    try {
      await api.post(`/admin/competitions/${comp.id}/release`, { kind, action, scheduledAt: action === 'schedule' ? fromLocalInput(when) : undefined });
      toast.success(action === 'publish' ? `${title} published` : action === 'unpublish' ? `${title} hidden again` : action === 'schedule' ? 'Release scheduled' : 'Schedule cleared');
      onChanged();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        {state.released ? <Badge tone="green"><Eye className="h-3 w-3" /> Visible</Badge> : state.scheduledAt ? <Badge tone="blue"><CalendarClock className="h-3 w-3" /> Scheduled</Badge> : <Badge tone="slate"><EyeOff className="h-3 w-3" /> Hidden</Badge>}
      </div>
      {state.scheduledAt && !state.released && <p className="mt-3 text-sm text-slate-600">Goes live {fmtDateTime(state.scheduledAt)}</p>}
      {state.publishedAt && state.published && <p className="mt-3 text-sm text-slate-600">Published {fmtDateTime(state.publishedAt)}</p>}
      <div className="mt-4 space-y-3">
        {!state.published ? (
          <Button onClick={() => act('publish')} loading={busy} disabled={!closed} icon={Rocket} className="w-full sm:w-auto">Publish now</Button>
        ) : (
          <Button variant="secondary" onClick={() => act('unpublish')} loading={busy} icon={EyeOff} className="w-full sm:w-auto">Hide again</Button>
        )}
        {!closed && <p className="text-xs text-slate-500">Available once the competition has closed.</p>}
        {!state.published && (
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-end">
            <Field label="Or schedule release" className="flex-1"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} min={toLocalInput(comp.endTime)} /></Field>
            <Button variant="soft" onClick={() => act('schedule')} disabled={!when} loading={busy} icon={CalendarClock}>Schedule</Button>
            {state.scheduledAt && <Button variant="ghost" onClick={() => act('clear_schedule')}>Clear</Button>}
          </div>
        )}
      </div>
    </Card>
  );
}

function ResultsTab({ comp, onChanged }) {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch(() => api.get(`/admin/competitions/${comp.id}/results`), [comp.id]);
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    try { await downloadFile(`/admin/competitions/${comp.id}/export.csv`, 'results.csv'); } catch (err) { toast.error(err.message); } finally { setExporting(false); }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <ReleaseCard comp={comp} kind="results" title="Scores & leaderboard" description="Participants see their score, rank and the leaderboard." onChanged={onChanged} />
        <ReleaseCard comp={comp} kind="answers" title="Answer key & explanations" description="Participants can review their answers, the correct options and explanations." onChanged={onChanged} />
      </div>
      <Alert tone="info">Results and the answer key are released independently of the closing time. Neither can be released before the competition closes.</Alert>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Rankings (best attempt)</h2>
        <Button icon={Download} onClick={exportCsv} loading={exporting}>Export CSV</Button>
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-48" />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Participated" value={`${data.summary.participants}/${data.summary.eligible}`} icon={Users} hint={`${data.summary.absent} absent`} />
            <StatCard label="Average" value={num(data.summary.average)} icon={BarChart3} tone="sky" hint={`of ${num(data.summary.maxScore)}`} />
            <StatCard label="Highest" value={num(data.summary.highest)} icon={BarChart3} tone="green" />
            <StatCard label="Lowest" value={num(data.summary.lowest)} icon={BarChart3} tone="amber" />
          </div>
          {data.items.length === 0 ? <EmptyState icon={BarChart3} title="No submissions yet" /> : (
            <TableWrap>
              <thead className="bg-slate-50"><tr><th className="th">#</th><th className="th">Participant</th><th className="th">Score</th><th className="th hidden sm:table-cell">Correct</th><th className="th hidden sm:table-cell">Wrong</th><th className="th hidden md:table-cell">Time</th><th className="th hidden md:table-cell">Submitted</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((r) => (
                  <tr key={r.userId}>
                    <td className="td font-bold">{r.rank}</td>
                    <td className="td"><p className="font-semibold text-slate-900">{r.name}</p><p className="font-mono text-xs text-slate-500">{r.participantId}</p></td>
                    <td className="td font-semibold">{num(r.score)} / {num(r.maxScore)}</td>
                    <td className="td hidden sm:table-cell text-emerald-700">{r.correctCount}</td>
                    <td className="td hidden sm:table-cell text-rose-700">{r.wrongCount}</td>
                    <td className="td hidden md:table-cell">{fmtDuration(r.timeTakenSeconds)}</td>
                    <td className="td hidden md:table-cell">{fmtDateTime(r.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </>
      )}
    </div>
  );
}

/* =============================== Overview =============================== */
function Overview({ comp, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [regrade, setRegrade] = useState(false);
  const dl = (l, v) => <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{l}</dt><dd className="mt-0.5 text-sm font-semibold text-slate-800">{v}</dd></div>;

  async function recalc() {
    setBusy(true);
    try { const r = await api.post(`/admin/competitions/${comp.id}/recalculate`); toast.success(`${r.regraded} attempts recalculated`); setRegrade(false); onChanged(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="p-5 sm:p-6 lg:col-span-2">
        <h2 className="text-base font-bold">Details</h2>
        {comp.description && <p className="mt-2 text-sm text-slate-600">{comp.description}</p>}
        <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3">
          {dl('Opens', fmtDateTime(comp.startTime))}
          {dl('Closes', fmtDateTime(comp.endTime))}
          {dl('Per attempt', `${comp.durationMinutes} min`)}
          {dl('Questions', comp.questionCount)}
          {dl('Total marks', comp.totalMarks)}
          {dl('Negative marking', comp.negativeMarking.enabled ? `-${Math.round(comp.negativeMarking.fraction * 100)}% per wrong` : 'Off')}
          {dl('Attempts', comp.maxAttempts)}
          {dl('Shuffle', [comp.shuffleQuestions && 'questions', comp.shuffleOptions && 'options'].filter(Boolean).join(' + ') || 'Off')}
          {dl('Audience', comp.visibility === 'all' ? 'All participants' : `${comp.assignedCount} assigned`)}
        </dl>
        {comp.instructions && (<><h3 className="mt-6 text-sm font-bold">Instructions</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{comp.instructions}</p></>)}
      </Card>
      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-bold">Maintenance</h2>
        <p className="mt-2 text-sm text-slate-500">Scores are recalculated automatically whenever you fix an answer key. You can also force a full recalculation.</p>
        <Button variant="secondary" icon={RefreshCw} className="mt-4 w-full" onClick={() => setRegrade(true)} disabled={!comp.stats?.submitted}>Recalculate all scores</Button>
      </Card>
      <ConfirmModal open={regrade} onClose={() => setRegrade(false)} onConfirm={recalc} loading={busy} tone="primary" title="Recalculate scores?" confirmLabel="Recalculate">Every submitted attempt is re-graded against the current answer key.</ConfirmModal>
    </div>
  );
}

/* =============================== Page =============================== */
export default function CompetitionManage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload, refresh } = useFetch(async () => (await api.get(`/admin/competitions/${id}`)).competition, [id]);
  const [tab, setTab] = useState('overview');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const c = data;

  async function setStatus(status) {
    setBusy(true);
    try { await api.post(`/admin/competitions/${id}/status`, { status }); toast.success(`Competition ${status}`); setConfirm(null); reload(); } catch (err) { toast.error(err.message); setConfirm(null); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await api.del(`/admin/competitions/${id}`); toast.success('Competition deleted'); navigate('/admin/competitions'); } catch (err) { toast.error(err.message); setConfirm(null); } finally { setBusy(false); }
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Settings2 },
    { id: 'questions', label: `Questions (${c.questionCount})`, icon: ListChecks },
    { id: 'access', label: 'Audience', icon: Users },
    { id: 'monitor', label: 'Monitor', icon: Activity },
    { id: 'results', label: 'Results & publishing', icon: BarChart3 },
  ];

  return (
    <>
      <PageHeader
        back={<Link to="/admin/competitions" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Competitions</Link>}
        title={c.title}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><StatusBadge status={c.status} />{c.status === 'published' && <PhaseBadge phase={c.phase} />}<span>{fmtDateTime(c.startTime)} - {fmtDateTime(c.endTime)}</span></span>}
        actions={
          <>
            <Link to={`/admin/competitions/${id}/edit`}><Button variant="secondary" icon={Pencil}>Edit</Button></Link>
            {c.status !== 'published' && <Button icon={Rocket} onClick={() => setConfirm('published')}>Publish</Button>}
            {c.status === 'published' && <Button variant="secondary" icon={Archive} onClick={() => setConfirm('archived')}>Archive</Button>}
            {c.status === 'archived' && <Button variant="secondary" onClick={() => setConfirm('published')}>Restore</Button>}
            {!(c.stats?.submitted || c.stats?.inProgress) && <Button variant="ghost" icon={Trash2} className="text-rose-600" onClick={() => setConfirm('delete')} aria-label="Delete competition" />}
          </>
        }
      />
      {c.status === 'draft' && <Alert tone="warning" title="This competition is a draft" className="mb-5"><span>Participants cannot see it until you publish. Add questions and choose the audience first.</span></Alert>}

      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === 'overview' && <Overview comp={c} onChanged={refresh} />}
        {tab === 'questions' && <QuestionsTab comp={c} onChanged={refresh} />}
        {tab === 'access' && <AccessTab comp={c} onChanged={refresh} />}
        {tab === 'monitor' && <MonitorTab comp={c} />}
        {tab === 'results' && <ResultsTab comp={c} onChanged={refresh} />}
      </div>

      <ConfirmModal open={confirm === 'published'} onClose={() => setConfirm(null)} onConfirm={() => setStatus('published')} loading={busy} tone="primary" title="Publish competition?" confirmLabel="Publish">It becomes visible to the selected audience and opens at the scheduled start time.</ConfirmModal>
      <ConfirmModal open={confirm === 'archived'} onClose={() => setConfirm(null)} onConfirm={() => setStatus('archived')} loading={busy} title="Archive competition?" confirmLabel="Archive">Participants will no longer see it. Existing attempts and results are kept.</ConfirmModal>
      <ConfirmModal open={confirm === 'delete'} onClose={() => setConfirm(null)} onConfirm={remove} loading={busy} title="Delete competition?" confirmLabel="Delete forever"><span className="inline-flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" /> This permanently deletes the competition and all its questions. It cannot be undone.</span></ConfirmModal>
    </>
  );
}
