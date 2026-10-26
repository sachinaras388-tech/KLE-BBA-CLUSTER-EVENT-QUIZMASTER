const Attempt = require('../models/Attempt');
const Competition = require('../models/Competition');
const Question = require('../models/Question');
const env = require('../config/env');
const { round2 } = require('../utils/helpers');

/** Pure grading function. Runs ONLY on the server. */
function gradeAnswers(answers, questions, negative) {
  const chosen = new Map(answers.map((a) => [String(a.question), String(a.option)]));
  const fraction = negative?.enabled ? negative.fraction : 0;
  let score = 0;
  let maxScore = 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  const perQuestion = new Map();

  for (const q of questions) {
    maxScore += q.marks;
    const sel = chosen.get(String(q._id));
    if (!sel) {
      unanswered += 1;
      perQuestion.set(String(q._id), 0);
    } else if (sel === String(q.correctOption)) {
      correct += 1;
      score += q.marks;
      perQuestion.set(String(q._id), q.marks);
    } else {
      wrong += 1;
      const penalty = -q.marks * fraction;
      score += penalty;
      perQuestion.set(String(q._id), round2(penalty));
    }
  }
  return {
    score: round2(score),
    maxScore: round2(maxScore),
    correctCount: correct,
    wrongCount: wrong,
    unansweredCount: unanswered,
    perQuestion,
  };
}

const gradeFields = ({ score, maxScore, correctCount, wrongCount, unansweredCount }) => ({
  score,
  maxScore,
  correctCount,
  wrongCount,
  unansweredCount,
});

/**
 * Atomically finalise an in-progress attempt. Safe to call concurrently / repeatedly.
 * type: 'manual' (student) | 'auto' (deadline reached) | 'admin'
 */
async function finalizeAttempt(attemptId, { type = 'manual', now = new Date() } = {}) {
  const claimed = await Attempt.findOneAndUpdate(
    { _id: attemptId, status: 'in_progress' },
    { $set: { status: 'grading' } },
    { new: true }
  );
  if (!claimed) return Attempt.findById(attemptId); // already finalised by someone else

  try {
    const comp = await Competition.findById(claimed.competition).select('negativeMarking');
    const questions = await Question.find({ _id: { $in: claimed.questionOrder } }).select('+correctOption marks');
    const grade = gradeAnswers(claimed.answers, questions, comp?.negativeMarking);

    // auto-submissions are stamped with the deadline; manual ones with the real server time
    const submittedAt = type === 'auto' ? claimed.deadline : now;
    const effectiveEnd = Math.min(submittedAt.getTime(), claimed.deadline.getTime());
    const status = type === 'auto' ? 'auto_submitted' : type === 'admin' ? 'admin_submitted' : 'submitted';

    return await Attempt.findByIdAndUpdate(
      claimed._id,
      {
        $set: {
          status,
          submittedAt,
          finalizedAt: new Date(),
          timeTakenSeconds: Math.max(0, Math.round((effectiveEnd - claimed.startedAt.getTime()) / 1000)),
          ...gradeFields(grade),
        },
      },
      { new: true }
    );
  } catch (err) {
    await Attempt.updateOne({ _id: claimed._id, status: 'grading' }, { $set: { status: 'in_progress' } });
    throw err;
  }
}

/** Finalise every in-progress attempt whose deadline (+ network grace) has passed. */
async function finalizeExpired(extraFilter = {}, limit = 500) {
  const cutoff = new Date(Date.now() - env.SUBMIT_GRACE_SECONDS * 1000);
  // recover attempts stuck mid-grading (crash)
  await Attempt.updateMany(
    { status: 'grading', updatedAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) } },
    { $set: { status: 'in_progress' } }
  );
  const stale = await Attempt.find({ status: 'in_progress', deadline: { $lt: cutoff }, ...extraFilter })
    .select('_id')
    .limit(limit)
    .lean();
  let n = 0;
  for (const a of stale) {
    try {
      await finalizeAttempt(a._id, { type: 'auto' });
      n += 1;
    } catch (err) {
      console.error('[sweeper] failed to finalise', a._id, err.message);
    }
  }
  return n;
}

function startSweeper() {
  const run = () =>
    finalizeExpired()
      .then((n) => n && console.log(`[sweeper] auto-submitted ${n} expired attempt(s)`))
      .catch((e) => console.error('[sweeper]', e.message));
  run();
  const timer = setInterval(run, 30 * 1000);
  timer.unref();
  return timer;
}

/** Re-grade every finalised attempt of a competition (after an answer-key correction). */
async function regradeCompetition(competitionId) {
  const comp = await Competition.findById(competitionId).select('negativeMarking');
  const questions = await Question.find({ competition: competitionId }).select('+correctOption marks');
  const cursor = Attempt.find({ competition: competitionId, status: { $in: Attempt.FINAL_STATUSES } }).cursor();
  let n = 0;
  for await (const attempt of cursor) {
    const qs = questions.filter((q) => attempt.questionOrder.some((id) => String(id) === String(q._id)));
    const grade = gradeAnswers(attempt.answers, qs, comp.negativeMarking);
    await Attempt.updateOne({ _id: attempt._id }, { $set: gradeFields(grade) });
    n += 1;
  }
  return n;
}

module.exports = { gradeAnswers, finalizeAttempt, finalizeExpired, startSweeper, regradeCompetition };
