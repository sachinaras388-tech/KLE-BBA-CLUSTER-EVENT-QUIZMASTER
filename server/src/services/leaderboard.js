const mongoose = require('mongoose');
const Attempt = require('../models/Attempt');

/**
 * Best finalised attempt per participant, ranked by score (desc), time taken (asc), submission time (asc).
 */
async function computeLeaderboard(competitionId) {
  const rows = await Attempt.aggregate([
    {
      $match: {
        competition: new mongoose.Types.ObjectId(String(competitionId)),
        status: { $in: Attempt.FINAL_STATUSES },
      },
    },
    { $sort: { score: -1, timeTakenSeconds: 1, submittedAt: 1 } },
    {
      $group: {
        _id: '$user',
        attemptId: { $first: '$_id' },
        attemptNumber: { $first: '$attemptNumber' },
        score: { $first: '$score' },
        maxScore: { $first: '$maxScore' },
        correctCount: { $first: '$correctCount' },
        wrongCount: { $first: '$wrongCount' },
        unansweredCount: { $first: '$unansweredCount' },
        timeTakenSeconds: { $first: '$timeTakenSeconds' },
        submittedAt: { $first: '$submittedAt' },
        status: { $first: '$status' },
        attempts: { $sum: 1 },
      },
    },
    { $sort: { score: -1, timeTakenSeconds: 1, submittedAt: 1 } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
    { $unwind: '$u' },
    {
      $project: {
        userId: '$_id',
        _id: 0,
        name: '$u.name',
        participantId: '$u.participantId',
        attemptId: 1,
        attemptNumber: 1,
        attempts: 1,
        score: 1,
        maxScore: 1,
        correctCount: 1,
        wrongCount: 1,
        unansweredCount: 1,
        timeTakenSeconds: 1,
        submittedAt: 1,
        status: 1,
      },
    },
  ]);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

module.exports = { computeLeaderboard };
