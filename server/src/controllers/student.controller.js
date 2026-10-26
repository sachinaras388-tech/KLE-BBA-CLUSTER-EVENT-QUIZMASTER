const Competition = require('../models/Competition');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const audit = require('../services/audit');
const env = require('../config/env');
const { getPhase, isReleased, releaseState, canAccess, allowedAttempts } = require('../services/competition');
const { finalizeAttempt, finalizeExpired, gradeAnswers } = require('../services/attempts');
const { computeLeaderboard } = require('../services/leaderboard');
const { ApiError, asyncHandler, shuffle } = require('../utils/helpers');

const graceMs = () => (process.env.SUBMIT_GRACE_SECONDS !== undefined ? Number(process.env.SUBMIT_GRACE_SECONDS) : env.SUBMIT_GRACE_SECONDS) * 1000;
const FINAL = Attempt.FINAL_STATUSES;

/* ------------------------------------------------------------------ */
/* Serializers - ONLY these shapes ever leave the server for students. */
/* They never include correct answers, explanations, other users, or   */
/* the assignment / override lists.                                    */
/* ------------------------------------------------------------------ */
function lobbyShape(comp, userId, attempts, now = new Date()) {
  const phase = getPhase(comp, now);
  const mine = attempts.filter((a) => String(a.competition) === String(comp._id));
  const live = mine.find((a) => a.status === 'in_progress' && now.getTime() <= new Date(a.deadline).getTime() + graceMs());
  const finished = mine.filter((a) => FINAL.includes(a.status));
  const allowed = allowedAttempts(comp, userId);
  const results = releaseState(comp, 'results', now);
  const answers = releaseState(comp, 'answers', now);
  const best = results.released ? [...finished].sort((a, b) => b.score - a.score)[0] : null;

  return {
    id: String(comp._id),
    title: comp.title,
    description: comp.description,
    instructions: comp.instructions,
    startTime: comp.startTime,
    endTime: comp.endTime,
    durationMinutes: comp.durationMinutes,
    questionCount: comp.questionCount,
    totalMarks: comp.totalMarks,
    negativeMarking: { enabled: comp.negativeMarking.enabled, fraction: comp.negativeMarking.fraction },
    maxAttempts: allowed,
    showLeaderboard: comp.showLeaderboard,
    phase,
    attemptsUsed: finished.length + (live ? 1 : 0),
    activeAttemptId: live ? String(live._id) : null,
    hasSubmitted: finished.length > 0,
    canStart: phase === 'open' && !live && finished.length < allowed,
    resultsReleased: results.released,
    answersReleased: answers.released,
    resultsScheduledAt: !results.released ? results.scheduledAt : null,
    answersScheduledAt: !answers.released ? answers.scheduledAt : null,
    myScore: best ? { score: best.score, maxScore: best.maxScore } : null,
  };
}

const STUDENT_FIELDS =
  'title description instructions status startTime endTime durationMinutes questionCount totalMarks negativeMarking maxAttempts visibility assignedParticipants attemptOverrides resultsRelease answerRelease showLeaderboard';

async function loadAccessible(req) {
  const comp = await Competition.findById(req.params.id).select(STUDENT_FIELDS);
  // 404 (not 403) so participants cannot probe for competitions they are not part of
  if (!comp || !canAccess(comp, req.user._id)) throw new ApiError(404, 'Competition not found', 'NOT_FOUND');
  return comp;
}

/** Attempt owned by the caller, or 404. */
async function loadOwnAttempt(req) {
  const attempt = await Attempt.findOne({ _id: req.params.attemptId, user: req.user._id });
  if (!attempt) throw new ApiError(404, 'Attempt not found', 'NOT_FOUND');
  return attempt;
}

function quizPayload(attempt, comp, questions) {
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  const optionOrder = new Map(attempt.optionOrders.map((o) => [String(o.question), o.options.map(String)]));
  return {
    serverTime: new Date(),
    attempt: {
      id: String(attempt._id),
      competitionId: String(attempt.competition),
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      deadline: attempt.deadline,
    },
    competition: { id: String(comp._id), title: comp.title, durationMinutes: comp.durationMinutes, totalMarks: comp.totalMarks, negativeMarking: comp.negativeMarking },
    questions: attempt.questionOrder
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map((q) => {
        const order = optionOrder.get(String(q._id));
        const opts = order ? order.map((oid) => q.options.find((o) => String(o._id) === oid)).filter(Boolean) : q.options;
        return { id: String(q._id), text: q.text, marks: q.marks, options: opts.map((o) => ({ id: String(o._id), text: o.text })) };
      }),
    answers: Object.fromEntries(attempt.answers.map((a) => [String(a.question), String(a.option)])),
  };
}

/** Loads the quiz questions WITHOUT the correct answer (select:false on the schema). */
const loadQuizQuestions = (attempt) => Question.find({ _id: { $in: attempt.questionOrder } }).select('text options marks');

/* ----------------------------- dashboard ----------------------------- */
exports.listCompetitions = asyncHandler(async (req, res) => {
  await finalizeExpired({ user: req.user._id });
  const comps = await Competition.find({
    status: 'published',
    $or: [{ visibility: 'all' }, { assignedParticipants: req.user._id }],
  })
    .select(STUDENT_FIELDS)
    .sort({ startTime: -1 });
  const attempts = await Attempt.find({ user: req.user._id, competition: { $in: comps.map((c) => c._id) } })
    .select('competition status score maxScore deadline')
    .lean();
  const now = new Date();
  res.json({ serverTime: now, items: comps.map((c) => lobbyShape(c, req.user._id, attempts, now)) });
});

exports.getCompetition = asyncHandler(async (req, res) => {
  await finalizeExpired({ user: req.user._id, competition: req.params.id });
  const comp = await loadAccessible(req);
  const attempts = await Attempt.find({ user: req.user._id, competition: comp._id }).select('competition status score maxScore deadline').lean();
  const now = new Date();
  res.json({ serverTime: now, competition: lobbyShape(comp, req.user._id, attempts, now) });
});

/* ------------------------------- quiz ------------------------------- */
exports.startAttempt = asyncHandler(async (req, res) => {
  const comp = await loadAccessible(req);
  await finalizeExpired({ user: req.user._id, competition: comp._id });
  const now = new Date();

  // Resume an eligible attempt (accidental disconnect / refresh)
  const live = await Attempt.findOne({ competition: comp._id, user: req.user._id, status: 'in_progress' });
  if (live && now.getTime() <= live.deadline.getTime() + graceMs()) {
    const questions = await loadQuizQuestions(live);
    return res.json(quizPayload(live, comp, questions));
  }

  const phase = getPhase(comp, now);
  if (phase === 'upcoming') throw new ApiError(403, 'This competition has not started yet', 'NOT_STARTED');
  if (phase === 'closed') throw new ApiError(403, 'This competition has closed', 'CLOSED');

  const finishedCount = await Attempt.countDocuments({ competition: comp._id, user: req.user._id, status: { $in: [...FINAL, 'grading'] } });
  if (finishedCount >= allowedAttempts(comp, req.user._id)) {
    throw new ApiError(409, 'You have already used all your attempts for this competition', 'NO_ATTEMPTS_LEFT');
  }

  const questions = await Question.find({ competition: comp._id }).sort({ order: 1, createdAt: 1 }).select('text options marks');
  if (!questions.length) throw new ApiError(409, 'This competition has no questions yet', 'NO_QUESTIONS');

  const orderedQs = comp.shuffleQuestions ? shuffle(questions) : questions;
  const deadline = new Date(Math.min(now.getTime() + comp.durationMinutes * 60 * 1000, comp.endTime.getTime()));

  let attempt;
  try {
    attempt = await Attempt.create({
      competition: comp._id,
      user: req.user._id,
      attemptNumber: finishedCount + 1,
      status: 'in_progress',
      startedAt: now,
      deadline,
      questionOrder: orderedQs.map((q) => q._id),
      optionOrders: orderedQs.map((q) => ({
        question: q._id,
        options: (comp.shuffleOptions ? shuffle(q.options) : q.options).map((o) => o._id),
      })),
      maxScore: comp.totalMarks,
      ip: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 300),
    });
  } catch (err) {
    if (err.code === 11000) {
      // double-click / two tabs: return the attempt that won the race
      const existing = await Attempt.findOne({ competition: comp._id, user: req.user._id, status: 'in_progress' });
      if (existing) return res.json(quizPayload(existing, comp, await loadQuizQuestions(existing)));
      throw new ApiError(409, 'Could not start the attempt, please try again', 'CONFLICT');
    }
    throw err;
  }

  await audit(req, 'ATTEMPT_STARTED', { entityType: 'Attempt', entityId: attempt._id, meta: { competition: String(comp._id), attemptNumber: attempt.attemptNumber } });
  res.status(201).json(quizPayload(attempt, comp, orderedQs));
});

exports.getAttempt = asyncHandler(async (req, res) => {
  let attempt = await loadOwnAttempt(req);
  const now = new Date();

  if (attempt.status === 'in_progress' && now.getTime() > attempt.deadline.getTime() + graceMs()) {
    attempt = await finalizeAttempt(attempt._id, { type: 'auto' });
  }
  if (attempt.status !== 'in_progress') {
    return res.json({ closed: true, status: attempt.status, competitionId: String(attempt.competition), serverTime: now });
  }
  const comp = await Competition.findById(attempt.competition).select('title durationMinutes totalMarks negativeMarking');
  res.json(quizPayload(attempt, comp, await loadQuizQuestions(attempt)));
});

/** Validates and writes one answer. `attempt` must be in_progress and inside its deadline. */
function assertWritable(attempt, now = new Date()) {
  if (attempt.status !== 'in_progress') {
    throw new ApiError(409, 'This attempt has already been submitted', 'ATTEMPT_CLOSED');
  }
  if (now.getTime() > attempt.deadline.getTime() + graceMs()) {
    throw new ApiError(409, 'Time is up - this attempt has ended', 'ATTEMPT_CLOSED');
  }
}

exports.saveAnswer = asyncHandler(async (req, res) => {
  const attempt = await loadOwnAttempt(req);
  const now = new Date();
  assertWritable(attempt, now);
  const { questionId, optionId } = req.body;

  if (!attempt.questionOrder.some((id) => String(id) === questionId)) {
    throw new ApiError(400, 'Question is not part of this attempt', 'BAD_QUESTION');
  }

  if (optionId === null) {
    await Attempt.updateOne({ _id: attempt._id, status: 'in_progress' }, { $pull: { answers: { question: questionId } } });
  } else {
    const q = await Question.findOne({ _id: questionId, competition: attempt.competition }).select('options');
    if (!q || !q.options.some((o) => String(o._id) === optionId)) {
      throw new ApiError(400, 'Invalid option for this question', 'BAD_OPTION');
    }
    const updated = await Attempt.updateOne(
      { _id: attempt._id, status: 'in_progress', 'answers.question': questionId },
      { $set: { 'answers.$.option': optionId, 'answers.$.savedAt': now } }
    );
    if (updated.matchedCount === 0) {
      await Attempt.updateOne(
        { _id: attempt._id, status: 'in_progress', 'answers.question': { $ne: questionId } },
        { $push: { answers: { question: questionId, option: optionId, savedAt: now } } }
      );
    }
  }
  const fresh = await Attempt.findById(attempt._id).select('answers deadline');
  res.json({ saved: true, savedAt: now, serverTime: new Date(), deadline: fresh.deadline, answered: fresh.answers.length });
});

exports.submitAttempt = asyncHandler(async (req, res) => {
  const attempt = await loadOwnAttempt(req);
  const now = new Date();

  if (attempt.status !== 'in_progress') {
    // idempotent: a second submit (retry after network drop) just returns the confirmation
    return res.json(await confirmationShape(attempt));
  }
  if (now.getTime() > attempt.deadline.getTime() + graceMs()) {
    const done = await finalizeAttempt(attempt._id, { type: 'auto' });
    return res.json(await confirmationShape(done));
  }

  // Final sync of answers from the client (covers failed autosaves). Server validates every one.
  if (req.body.answers?.length) {
    const qs = await Question.find({ _id: { $in: attempt.questionOrder } }).select('options');
    const optionsByQ = new Map(qs.map((q) => [String(q._id), new Set(q.options.map((o) => String(o._id)))]));
    const merged = new Map(attempt.answers.map((a) => [String(a.question), { question: a.question, option: a.option, savedAt: a.savedAt }]));
    for (const a of req.body.answers) {
      const valid = optionsByQ.get(a.questionId);
      if (!valid) continue;
      if (a.optionId === null) merged.delete(a.questionId);
      else if (valid.has(a.optionId)) merged.set(a.questionId, { question: a.questionId, option: a.optionId, savedAt: now });
    }
    await Attempt.updateOne({ _id: attempt._id, status: 'in_progress' }, { $set: { answers: [...merged.values()] } });
  }

  const done = await finalizeAttempt(attempt._id, { type: 'manual', now });
  await audit(req, 'ATTEMPT_SUBMITTED', { entityType: 'Attempt', entityId: attempt._id, meta: { competition: String(attempt.competition), at: done.submittedAt } });
  res.json(await confirmationShape(done));
});

/** Submission receipt - deliberately contains NO score. */
async function confirmationShape(attempt) {
  const comp = await Competition.findById(attempt.competition).select(STUDENT_FIELDS);
  const results = comp ? releaseState(comp, 'results') : {};
  return {
    attemptId: String(attempt._id),
    competitionId: String(attempt.competition),
    competitionTitle: comp?.title,
    status: attempt.status,
    submissionType: attempt.status === 'auto_submitted' ? 'auto' : attempt.status === 'admin_submitted' ? 'admin' : 'manual',
    submittedAt: attempt.submittedAt,
    startedAt: attempt.startedAt,
    answered: attempt.answers.length,
    totalQuestions: attempt.questionOrder.length,
    receipt: String(attempt._id).slice(-8).toUpperCase(),
    resultsReleased: results.released || false,
    resultsScheduledAt: results.released ? null : results.scheduledAt || null,
  };
}

exports.attemptSummary = asyncHandler(async (req, res) => {
  const attempt = await loadOwnAttempt(req);
  if (attempt.status === 'in_progress') throw new ApiError(409, 'This attempt is still in progress', 'IN_PROGRESS');
  res.json(await confirmationShape(attempt));
});

/* -------------------- results / review / leaderboard -------------------- */
async function releasedOr403(comp, kind) {
  const state = releaseState(comp, kind);
  if (!state.released) {
    const label = kind === 'results' ? 'Results' : 'The answer key';
    const closed = getPhase(comp) === 'closed';
    throw new ApiError(
      403,
      state.scheduledAt ? `${label} will be published on ${new Date(state.scheduledAt).toUTCString()}.` : closed ? `${label} have not been published yet.` : `${label} are not available until the competition has closed.`,
      kind === 'results' ? 'RESULTS_NOT_RELEASED' : 'ANSWERS_NOT_RELEASED',
      { scheduledAt: state.scheduledAt }
    );
  }
}

async function bestOwnAttempt(comp, userId) {
  const attempts = await Attempt.find({ competition: comp._id, user: userId, status: { $in: FINAL } }).sort({ score: -1, timeTakenSeconds: 1 });
  if (!attempts.length) throw new ApiError(404, 'You did not submit an attempt for this competition', 'NO_ATTEMPT');
  return attempts[0];
}

exports.myResult = asyncHandler(async (req, res) => {
  await finalizeExpired({ competition: req.params.id });
  const comp = await loadAccessible(req);
  await releasedOr403(comp, 'results');
  const attempt = await bestOwnAttempt(comp, req.user._id);
  const board = await computeLeaderboard(comp._id);
  const mine = board.find((r) => String(r.userId) === String(req.user._id));
  res.json({
    competition: { id: String(comp._id), title: comp.title, showLeaderboard: comp.showLeaderboard, answersReleased: isReleased(comp, 'answers') },
    result: {
      attemptNumber: attempt.attemptNumber,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage: attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 10000) / 100 : 0,
      correct: attempt.correctCount,
      wrong: attempt.wrongCount,
      unanswered: attempt.unansweredCount,
      timeTakenSeconds: attempt.timeTakenSeconds,
      submittedAt: attempt.submittedAt,
      status: attempt.status,
      rank: comp.showLeaderboard ? mine?.rank ?? null : null,
      totalParticipants: comp.showLeaderboard ? board.length : null,
    },
  });
});

exports.review = asyncHandler(async (req, res) => {
  await finalizeExpired({ competition: req.params.id });
  const comp = await loadAccessible(req);
  await releasedOr403(comp, 'answers');
  const attempt = await bestOwnAttempt(comp, req.user._id);

  // The ONLY place correct answers/explanations are read for a student - gated by the release check above
  const questions = await Question.find({ _id: { $in: attempt.questionOrder } }).select('+correctOption +explanation');
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  const chosen = new Map(attempt.answers.map((a) => [String(a.question), String(a.option)]));
  const resultsOut = isReleased(comp, 'results');
  const grade = gradeAnswers(attempt.answers, questions, comp.negativeMarking);

  res.json({
    competition: { id: String(comp._id), title: comp.title },
    attemptNumber: attempt.attemptNumber,
    score: resultsOut ? attempt.score : null,
    maxScore: resultsOut ? attempt.maxScore : null,
    questions: attempt.questionOrder
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map((q) => {
        const sel = chosen.get(String(q._id)) || null;
        return {
          id: String(q._id),
          text: q.text,
          marks: q.marks,
          options: q.options.map((o) => ({ id: String(o._id), text: o.text })),
          selectedOptionId: sel,
          correctOptionId: String(q.correctOption),
          isCorrect: sel ? sel === String(q.correctOption) : null,
          explanation: q.explanation || '',
          awarded: resultsOut ? grade.perQuestion.get(String(q._id)) ?? 0 : null,
        };
      }),
  });
});

exports.leaderboard = asyncHandler(async (req, res) => {
  await finalizeExpired({ competition: req.params.id });
  const comp = await loadAccessible(req);
  await releasedOr403(comp, 'results');
  if (!comp.showLeaderboard) throw new ApiError(403, 'The leaderboard is not enabled for this competition', 'LEADERBOARD_OFF');
  const board = await computeLeaderboard(comp._id);
  res.json({
    competition: { id: String(comp._id), title: comp.title, totalMarks: comp.totalMarks },
    // Only public-safe fields: no answers, no attempt ids, and NEVER participant IDs (they are login identifiers)
    items: board.map((r) => ({
      rank: r.rank,
      name: r.name,
      score: r.score,
      maxScore: r.maxScore,
      timeTakenSeconds: r.timeTakenSeconds,
      isMe: String(r.userId) === String(req.user._id),
    })),
  });
});
