const Competition = require('../models/Competition');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const User = require('../models/User');
const audit = require('../services/audit');
const { getPhase, releaseState, refreshStats, graceMs } = require('../services/competition');
const { regradeCompetition } = require('../services/attempts');
const { ApiError, asyncHandler } = require('../utils/helpers');

const findOr404 = async (id) => {
  const comp = await Competition.findById(id);
  if (!comp) throw new ApiError(404, 'Competition not found', 'NOT_FOUND');
  return comp;
};

const hasAttempts = (id) => Attempt.exists({ competition: id });

function serialize(comp, stats) {
  const o = comp.toJSON();
  const now = new Date();
  return {
    ...o,
    phase: getPhase(comp, now),
    resultsState: releaseState(comp, 'results', now),
    answersState: releaseState(comp, 'answers', now),
    assignedCount: comp.assignedParticipants?.length || 0,
    ...(stats ? { stats } : {}),
  };
}

async function statsFor(ids) {
  const rows = await Attempt.aggregate([
    { $match: { competition: { $in: ids } } },
    {
      $group: {
        _id: { c: '$competition', inProgress: { $in: ['$status', ['in_progress', 'grading']] } },
        n: { $sum: 1 },
      },
    },
  ]);
  const map = new Map(ids.map((id) => [String(id), { inProgress: 0, submitted: 0 }]));
  for (const r of rows) {
    const s = map.get(String(r._id.c));
    if (s) s[r._id.inProgress ? 'inProgress' : 'submitted'] += r.n;
  }
  return map;
}

exports.list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status && ['draft', 'published', 'archived'].includes(req.query.status)) filter.status = req.query.status;
  const comps = await Competition.find(filter).sort({ startTime: -1 });
  const stats = await statsFor(comps.map((c) => c._id));
  res.json({ items: comps.map((c) => serialize(c, stats.get(String(c._id)))) });
});

exports.create = asyncHandler(async (req, res) => {
  const comp = await Competition.create({ ...req.body, createdBy: req.user._id });
  await audit(req, 'COMPETITION_CREATED', { entityType: 'Competition', entityId: comp._id, meta: { title: comp.title } });
  res.status(201).json({ competition: serialize(comp) });
});

exports.get = asyncHandler(async (req, res) => {
  const comp = await findOr404(req.params.id);
  const stats = (await statsFor([comp._id])).get(String(comp._id));
  res.json({ competition: serialize(comp, stats) });
});

exports.update = asyncHandler(async (req, res) => {
  const comp = await findOr404(req.params.id);
  const body = req.body;
  const locked = await hasAttempts(comp._id);

  if (locked) {
    const current = {
      durationMinutes: comp.durationMinutes,
      negativeMarking: { enabled: comp.negativeMarking.enabled, fraction: comp.negativeMarking.fraction },
      shuffleQuestions: comp.shuffleQuestions,
      shuffleOptions: comp.shuffleOptions,
    };
    for (const key of Object.keys(current)) {
      if (body[key] !== undefined && JSON.stringify(body[key]) !== JSON.stringify(current[key])) {
        throw new ApiError(409, 'Attempts already exist - duration, negative marking and shuffle settings are locked.', 'LOCKED');
      }
    }
  }
  const start = body.startTime || comp.startTime;
  const end = body.endTime || comp.endTime;
  if (end <= start) throw new ApiError(400, 'End time must be after start time', 'VALIDATION_ERROR');

  const endChanged = body.endTime && body.endTime.getTime() !== comp.endTime.getTime();
  for (const [k, v] of Object.entries(body)) comp.set(k, v);
  await comp.save();
  // Closing earlier must also cut off attempts that are already running (server-enforced deadline)
  if (endChanged) {
    await Attempt.updateMany({ competition: comp._id, status: 'in_progress', deadline: { $gt: comp.endTime } }, { $set: { deadline: comp.endTime } });
  }
  await audit(req, 'COMPETITION_UPDATED', { entityType: 'Competition', entityId: comp._id, meta: { fields: Object.keys(body) } });
  res.json({ competition: serialize(comp) });
});

exports.remove = asyncHandler(async (req, res) => {
  const comp = await findOr404(req.params.id);
  if (await hasAttempts(comp._id)) {
    throw new ApiError(409, 'This competition has attempts and cannot be deleted. Archive it instead.', 'HAS_ATTEMPTS');
  }
  await Question.deleteMany({ competition: comp._id });
  await comp.deleteOne();
  await audit(req, 'COMPETITION_DELETED', { entityType: 'Competition', entityId: comp._id, meta: { title: comp.title } });
  res.json({ ok: true });
});

exports.setStatus = asyncHandler(async (req, res) => {
  const comp = await findOr404(req.params.id);
  const { status } = req.body;

  if (status === 'published') {
    const questions = await Question.find({ competition: comp._id }).select('+correctOption options');
    if (!questions.length) throw new ApiError(409, 'Add at least one question before publishing', 'NO_QUESTIONS');
    const broken = questions.find((q) => !q.options.some((o) => String(o._id) === String(q.correctOption)));
    if (broken) throw new ApiError(409, 'A question has no valid correct answer', 'BAD_QUESTION');
    if (comp.endTime <= new Date()) throw new ApiError(409, 'The end time is already in the past - update the schedule first', 'PAST_END');
  }
  if (status === 'draft' && (await hasAttempts(comp._id))) {
    throw new ApiError(409, 'Attempts exist - you can archive but not return this competition to draft', 'HAS_ATTEMPTS');
  }
  comp.status = status;
  await comp.save();
  await audit(req, `COMPETITION_${status.toUpperCase()}`, { entityType: 'Competition', entityId: comp._id, meta: { title: comp.title } });
  res.json({ competition: serialize(comp) });
});

exports.setAssignments = asyncHandler(async (req, res) => {
  const comp = await findOr404(req.params.id);
  const { visibility, participantIds } = req.body;
  const valid = await User.find({ _id: { $in: participantIds }, role: 'student' }).select('_id').lean();
  comp.visibility = visibility;
  comp.assignedParticipants = valid.map((u) => u._id);
  await comp.save();
  await audit(req, 'COMPETITION_ASSIGNMENTS_UPDATED', {
    entityType: 'Competition',
    entityId: comp._id,
    meta: { visibility, assigned: valid.length },
  });
  res.json({ competition: serialize(comp) });
});

/** Results (score + leaderboard) and answer key are released independently of quiz closure. */
exports.release = asyncHandler(async (req, res) => {
  const comp = await findOr404(req.params.id);
  const { kind, action, scheduledAt } = req.body;
  const field = kind === 'results' ? 'resultsRelease' : 'answerRelease';
  const closesAt = new Date(comp.endTime.getTime() + graceMs());
  const now = new Date();

  if (action === 'publish') {
    if (now < closesAt) {
      throw new ApiError(409, `Cannot publish before the competition closes (${comp.endTime.toISOString()}).`, 'NOT_CLOSED');
    }
    comp[field].published = true;
    comp[field].publishedAt = now;
    comp[field].scheduledAt = undefined;
  } else if (action === 'unpublish') {
    comp[field].published = false;
    comp[field].publishedAt = undefined;
    comp[field].scheduledAt = undefined;
  } else if (action === 'schedule') {
    if (!scheduledAt) throw new ApiError(400, 'scheduledAt is required', 'VALIDATION_ERROR');
    if (scheduledAt < closesAt) {
      throw new ApiError(409, 'Release time must be after the competition closes', 'BEFORE_CLOSE');
    }
    comp[field].published = false;
    comp[field].publishedAt = undefined;
    comp[field].scheduledAt = scheduledAt;
  } else {
    comp[field].scheduledAt = undefined;
  }
  comp.markModified(field);
  await comp.save();
  await audit(req, `${kind.toUpperCase()}_${action.toUpperCase()}`, {
    entityType: 'Competition',
    entityId: comp._id,
    meta: { title: comp.title, scheduledAt },
  });
  res.json({ competition: serialize(comp) });
});

exports.grantAttempt = asyncHandler(async (req, res) => {
  const comp = await findOr404(req.params.id);
  const { userId, extra } = req.body;
  const user = await User.findOne({ _id: userId, role: 'student' }).select('participantId name');
  if (!user) throw new ApiError(404, 'Participant not found', 'NOT_FOUND');
  const existing = comp.attemptOverrides.find((o) => String(o.user) === String(userId));
  if (existing) existing.extraAttempts = Math.min(10, existing.extraAttempts + extra);
  else comp.attemptOverrides.push({ user: userId, extraAttempts: extra });
  await comp.save();
  await audit(req, 'EXTRA_ATTEMPT_GRANTED', {
    entityType: 'Competition',
    entityId: comp._id,
    meta: { participantId: user.participantId, extra },
  });
  res.json({ ok: true });
});

exports.recalculate = asyncHandler(async (req, res) => {
  const comp = await findOr404(req.params.id);
  const n = await regradeCompetition(comp._id);
  await audit(req, 'COMPETITION_REGRADED', { entityType: 'Competition', entityId: comp._id, meta: { attempts: n } });
  res.json({ regraded: n });
});

exports.refreshStats = refreshStats;
