const Competition = require('../models/Competition');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const audit = require('../services/audit');
const { getPhase, eligibleUsers } = require('../services/competition');
const { finalizeAttempt, finalizeExpired, gradeAnswers } = require('../services/attempts');
const { computeLeaderboard } = require('../services/leaderboard');
const { ApiError, asyncHandler, escapeRegex, toCSV } = require('../utils/helpers');

const compOr404 = async (id) => {
  const comp = await Competition.findById(id);
  if (!comp) throw new ApiError(404, 'Competition not found', 'NOT_FOUND');
  return comp;
};

/* ------------------------- monitoring ------------------------- */
exports.attempts = asyncHandler(async (req, res) => {
  const comp = await compOr404(req.params.id);
  await finalizeExpired({ competition: comp._id });

  const attempts = await Attempt.find({ competition: comp._id })
    .sort({ startedAt: -1 })
    .populate('user', 'name participantId email')
    .lean();
  const eligible = await eligibleUsers(comp);
  const startedUserIds = new Set(attempts.map((a) => String(a.user?._id)));

  let rows = attempts.map((a) => ({
    id: String(a._id),
    user: a.user ? { id: String(a.user._id), name: a.user.name, participantId: a.user.participantId } : null,
    attemptNumber: a.attemptNumber,
    status: a.status === 'grading' ? 'in_progress' : a.status,
    startedAt: a.startedAt,
    deadline: a.deadline,
    submittedAt: a.submittedAt,
    timeTakenSeconds: a.timeTakenSeconds,
    answered: a.answers.length,
    totalQuestions: a.questionOrder.length,
    score: a.status === 'in_progress' ? null : a.score,
    maxScore: a.maxScore,
    ip: a.ip,
  }));

  const notStarted = eligible
    .filter((u) => !startedUserIds.has(String(u._id)))
    .map((u) => ({ id: `ns-${u._id}`, user: { id: String(u._id), name: u.name, participantId: u.participantId }, status: 'not_started' }));

  const summary = {
    eligible: eligible.length,
    notStarted: notStarted.length,
    inProgress: rows.filter((r) => r.status === 'in_progress').length,
    submitted: rows.filter((r) => r.status !== 'in_progress').length,
    phase: getPhase(comp),
  };

  const { status, q } = req.query;
  if (status === 'not_started') rows = notStarted;
  else if (status === 'in_progress') rows = rows.filter((r) => r.status === 'in_progress');
  else if (status === 'submitted') rows = rows.filter((r) => r.status !== 'in_progress');
  else rows = [...rows, ...notStarted];
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    rows = rows.filter((r) => rx.test(r.user?.name || '') || rx.test(r.user?.participantId || ''));
  }
  res.json({ summary, items: rows });
});

exports.attemptDetail = asyncHandler(async (req, res) => {
  const attempt = await Attempt.findById(req.params.attemptId).populate('user', 'name participantId');
  if (!attempt) throw new ApiError(404, 'Attempt not found', 'NOT_FOUND');
  const comp = await Competition.findById(attempt.competition).select('title negativeMarking');
  const questions = await Question.find({ _id: { $in: attempt.questionOrder } }).select('+correctOption +explanation');
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  const chosen = new Map(attempt.answers.map((a) => [String(a.question), String(a.option)]));
  const grade = gradeAnswers(attempt.answers, questions, comp.negativeMarking);

  res.json({
    attempt: {
      id: String(attempt._id),
      user: attempt.user,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      deadline: attempt.deadline,
      timeTakenSeconds: attempt.timeTakenSeconds,
      score: attempt.score,
      maxScore: attempt.maxScore,
      ip: attempt.ip,
    },
    competition: { id: String(comp._id), title: comp.title },
    questions: attempt.questionOrder
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map((q) => ({
        id: String(q._id),
        text: q.text,
        marks: q.marks,
        options: q.options.map((o) => ({ id: String(o._id), text: o.text })),
        correctOptionId: String(q.correctOption),
        selectedOptionId: chosen.get(String(q._id)) || null,
        awarded: grade.perQuestion.get(String(q._id)) ?? 0,
      })),
  });
});

exports.forceSubmit = asyncHandler(async (req, res) => {
  const attempt = await Attempt.findById(req.params.attemptId);
  if (!attempt) throw new ApiError(404, 'Attempt not found', 'NOT_FOUND');
  if (attempt.status !== 'in_progress') throw new ApiError(409, 'This attempt is already submitted', 'ALREADY_SUBMITTED');
  const done = await finalizeAttempt(attempt._id, { type: 'admin' });
  await audit(req, 'ATTEMPT_FORCE_SUBMITTED', { entityType: 'Attempt', entityId: attempt._id, meta: { competition: attempt.competition } });
  res.json({ ok: true, status: done.status });
});

/* ------------------------- results / export ------------------------- */
exports.results = asyncHandler(async (req, res) => {
  const comp = await compOr404(req.params.id);
  await finalizeExpired({ competition: comp._id });
  const rows = await computeLeaderboard(comp._id);
  const eligible = await eligibleUsers(comp);
  const scores = rows.map((r) => r.score);
  res.json({
    items: rows,
    summary: {
      participants: rows.length,
      eligible: eligible.length,
      absent: Math.max(0, eligible.length - rows.length),
      average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0,
      highest: scores.length ? Math.max(...scores) : 0,
      lowest: scores.length ? Math.min(...scores) : 0,
      maxScore: comp.totalMarks,
    },
  });
});

exports.exportCsv = asyncHandler(async (req, res) => {
  const comp = await compOr404(req.params.id);
  await finalizeExpired({ competition: comp._id });
  const board = await computeLeaderboard(comp._id);
  const rankByUser = new Map(board.map((r) => [String(r.userId), r.rank]));
  const attempts = await Attempt.find({ competition: comp._id, status: { $in: Attempt.FINAL_STATUSES } })
    .populate('user', 'name participantId email organization')
    .sort({ score: -1, timeTakenSeconds: 1 })
    .lean();
  const eligible = await eligibleUsers(comp);
  const attemptedIds = new Set(attempts.map((a) => String(a.user?._id)));

  const header = [
    'Rank (best attempt)', 'Participant ID', 'Name', 'Email', 'Organization', 'Attempt #', 'Submission type',
    'Started at (UTC)', 'Submitted at (UTC)', 'Time taken (sec)', 'Score', 'Max score', 'Percentage',
    'Correct', 'Wrong', 'Unanswered',
  ];
  const rows = [header];
  for (const a of attempts) {
    const pct = a.maxScore ? Math.round((a.score / a.maxScore) * 10000) / 100 : 0;
    rows.push([
      rankByUser.get(String(a.user?._id)) ?? '', a.user?.participantId, a.user?.name, a.user?.email, a.user?.organization,
      a.attemptNumber, a.status.replace('_', ' '), a.startedAt, a.submittedAt, a.timeTakenSeconds, a.score, a.maxScore, pct,
      a.correctCount, a.wrongCount, a.unansweredCount,
    ]);
  }
  for (const u of eligible.filter((x) => !attemptedIds.has(String(x._id)))) {
    rows.push(['', u.participantId, u.name, u.email, '', '', 'not attempted', '', '', '', '', '', '', '', '', '']);
  }

  await audit(req, 'RESULTS_EXPORTED', { entityType: 'Competition', entityId: comp._id, meta: { rows: rows.length - 1 } });
  const slug = comp.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'competition';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="results-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCSV(rows));
});

/* ------------------------- dashboard + audit ------------------------- */
exports.stats = asyncHandler(async (_req, res) => {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  await finalizeExpired();

  const [participants, activeParticipants, comps, inProgress, submittedToday, upcoming, live, recent] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'student', isActive: true }),
    Competition.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Attempt.countDocuments({ status: { $in: ['in_progress', 'grading'] } }),
    Attempt.countDocuments({ status: { $in: Attempt.FINAL_STATUSES }, submittedAt: { $gte: startOfDay } }),
    Competition.find({ status: 'published', startTime: { $gt: now } }).sort({ startTime: 1 }).limit(5).select('title startTime endTime'),
    Competition.find({ status: 'published', startTime: { $lte: now }, endTime: { $gt: now } }).sort({ endTime: 1 }).limit(5).select('title startTime endTime'),
    AuditLog.find().sort({ createdAt: -1 }).limit(8),
  ]);
  const byStatus = Object.fromEntries(comps.map((c) => [c._id, c.n]));
  res.json({
    participants: { total: participants, active: activeParticipants },
    competitions: { draft: byStatus.draft || 0, published: byStatus.published || 0, archived: byStatus.archived || 0 },
    attempts: { inProgress, submittedToday },
    upcoming: upcoming.map((c) => c.toJSON()),
    live: live.map((c) => c.toJSON()),
    recentActivity: recent.map((l) => l.toJSON()),
  });
});

exports.auditLogs = asyncHandler(async (req, res) => {
  const { page, limit, action, q } = req.query;
  const filter = {};
  if (action) filter.action = action;
  if (q) filter.$or = [{ actorLabel: new RegExp(escapeRegex(q), 'i') }, { entityId: q }];
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items: items.map((i) => i.toJSON()), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});
