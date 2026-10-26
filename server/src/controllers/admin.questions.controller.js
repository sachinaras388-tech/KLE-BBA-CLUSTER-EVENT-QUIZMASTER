const Competition = require('../models/Competition');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const audit = require('../services/audit');
const { refreshStats } = require('../services/competition');
const { regradeCompetition } = require('../services/attempts');
const { ApiError, asyncHandler } = require('../utils/helpers');

const competitionOr404 = async (id) => {
  const comp = await Competition.findById(id).select('title');
  if (!comp) throw new ApiError(404, 'Competition not found', 'NOT_FOUND');
  return comp;
};
const assertNoAttempts = async (competitionId) => {
  if (await Attempt.exists({ competition: competitionId })) {
    throw new ApiError(409, 'Attempts already exist, so questions can no longer be added, removed or reordered. You can still edit wording and fix the answer key.', 'HAS_ATTEMPTS');
  }
};

// Admin-only serializer (includes the correct answer + explanation)
const serialize = (q) => ({
  id: String(q._id),
  order: q.order,
  text: q.text,
  options: q.options.map((o) => ({ id: String(o._id), text: o.text })),
  correctIndex: q.options.findIndex((o) => String(o._id) === String(q.correctOption)),
  explanation: q.explanation || '',
  marks: q.marks,
});

function buildQuestion(competitionId, data, order) {
  const q = new Question({
    competition: competitionId,
    order,
    text: data.text,
    options: data.options.map((text) => ({ text })),
    explanation: data.explanation || '',
    marks: data.marks,
  });
  q.correctOption = q.options[data.correctIndex]._id;
  return q;
}

exports.list = asyncHandler(async (req, res) => {
  await competitionOr404(req.params.id);
  const questions = await Question.find({ competition: req.params.id })
    .sort({ order: 1, createdAt: 1 })
    .select('+correctOption +explanation');
  res.json({ items: questions.map(serialize) });
});

exports.create = asyncHandler(async (req, res) => {
  const comp = await competitionOr404(req.params.id);
  await assertNoAttempts(comp._id);
  const count = await Question.countDocuments({ competition: comp._id });
  const q = buildQuestion(comp._id, req.body, count);
  await q.save();
  await refreshStats(comp._id);
  await audit(req, 'QUESTION_CREATED', { entityType: 'Competition', entityId: comp._id, meta: { questionId: q._id } });
  res.status(201).json({ question: serialize(q) });
});

exports.importMany = asyncHandler(async (req, res) => {
  const comp = await competitionOr404(req.params.id);
  await assertNoAttempts(comp._id);
  const count = await Question.countDocuments({ competition: comp._id });
  const docs = req.body.questions.map((d, i) => buildQuestion(comp._id, d, count + i));
  await Question.insertMany(docs);
  await refreshStats(comp._id);
  await audit(req, 'QUESTIONS_IMPORTED', { entityType: 'Competition', entityId: comp._id, meta: { count: docs.length } });
  res.status(201).json({ imported: docs.length });
});

exports.update = asyncHandler(async (req, res) => {
  const q = await Question.findOne({ _id: req.params.qid, competition: req.params.id }).select('+correctOption +explanation');
  if (!q) throw new ApiError(404, 'Question not found', 'NOT_FOUND');
  const d = req.body;
  const locked = Boolean(await Attempt.exists({ competition: q.competition }));
  const oldCorrectIndex = q.options.findIndex((o) => String(o._id) === String(q.correctOption));

  if (locked && d.options.length !== q.options.length) {
    throw new ApiError(409, 'Attempts exist - the number of options cannot change. Edit the option text instead.', 'HAS_ATTEMPTS');
  }
  // Keep option ids stable by position (so saved answers stay valid); add new ones only when unlocked
  const next = d.options.map((text, i) => (q.options[i] ? { _id: q.options[i]._id, text } : { text }));
  q.text = d.text;
  q.options = next;
  q.explanation = d.explanation || '';
  q.marks = d.marks;
  q.correctOption = q.options[d.correctIndex]._id;
  await q.save();

  if (locked) await regradeCompetition(q.competition);
  await refreshStats(q.competition);
  await audit(req, 'QUESTION_UPDATED', {
    entityType: 'Competition',
    entityId: q.competition,
    meta: { questionId: q._id, answerKeyChanged: oldCorrectIndex !== d.correctIndex, regraded: locked },
  });
  res.json({ question: serialize(q) });
});

exports.remove = asyncHandler(async (req, res) => {
  await assertNoAttempts(req.params.id);
  const q = await Question.findOneAndDelete({ _id: req.params.qid, competition: req.params.id });
  if (!q) throw new ApiError(404, 'Question not found', 'NOT_FOUND');
  await refreshStats(q.competition);
  await audit(req, 'QUESTION_DELETED', { entityType: 'Competition', entityId: q.competition, meta: { questionId: q._id } });
  res.json({ ok: true });
});

exports.reorder = asyncHandler(async (req, res) => {
  await competitionOr404(req.params.id);
  await assertNoAttempts(req.params.id);
  await Question.bulkWrite(
    req.body.ids.map((id, i) => ({
      updateOne: { filter: { _id: id, competition: req.params.id }, update: { $set: { order: i } } },
    }))
  );
  await audit(req, 'QUESTIONS_REORDERED', { entityType: 'Competition', entityId: req.params.id });
  res.json({ ok: true });
});
