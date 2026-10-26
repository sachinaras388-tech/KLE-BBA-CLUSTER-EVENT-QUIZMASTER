const Competition = require('../models/Competition');
const Question = require('../models/Question');
const User = require('../models/User');
const env = require('../config/env');

const graceMs = () => env.SUBMIT_GRACE_SECONDS * 1000;

/** upcoming | open | closed  (based on SERVER time) */
function getPhase(comp, now = new Date()) {
  if (now < comp.startTime) return 'upcoming';
  if (now >= comp.endTime) return 'closed';
  return 'open';
}

/**
 * Whether results (score + leaderboard) or the answer key are visible to participants.
 * Never before the competition has closed (plus network grace), regardless of the flags.
 */
function isReleased(comp, kind, now = new Date()) {
  const rel = kind === 'results' ? comp.resultsRelease : comp.answerRelease;
  if (!rel) return false;
  if (now.getTime() < new Date(comp.endTime).getTime() + graceMs()) return false;
  if (rel.published) return true;
  return Boolean(rel.scheduledAt && new Date(rel.scheduledAt) <= now);
}

function releaseState(comp, kind, now = new Date()) {
  const rel = (kind === 'results' ? comp.resultsRelease : comp.answerRelease) || {};
  return {
    released: isReleased(comp, kind, now),
    published: Boolean(rel.published),
    publishedAt: rel.publishedAt || null,
    scheduledAt: rel.scheduledAt || null,
  };
}

const canAccess = (comp, userId) =>
  comp.status === 'published' &&
  (comp.visibility === 'all' || (comp.assignedParticipants || []).some((id) => String(id) === String(userId)));

function allowedAttempts(comp, userId) {
  const o = (comp.attemptOverrides || []).find((x) => String(x.user) === String(userId));
  return comp.maxAttempts + (o ? o.extraAttempts : 0);
}

async function refreshStats(competitionId) {
  const [agg] = await Question.aggregate([
    { $match: { competition: competitionId } },
    { $group: { _id: null, count: { $sum: 1 }, marks: { $sum: '$marks' } } },
  ]);
  await Competition.updateOne(
    { _id: competitionId },
    { $set: { questionCount: agg?.count || 0, totalMarks: agg?.marks || 0 } }
  );
}

/** Users who are expected to take part (for absentee reporting) */
async function eligibleUsers(comp) {
  const filter =
    comp.visibility === 'all'
      ? { role: 'student', isActive: true }
      : { role: 'student', _id: { $in: comp.assignedParticipants || [] } };
  return User.find(filter).select('name participantId email isActive').lean();
}

module.exports = { getPhase, isReleased, releaseState, canAccess, allowedAttempts, refreshStats, eligibleUsers, graceMs };
