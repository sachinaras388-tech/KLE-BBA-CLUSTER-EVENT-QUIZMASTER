const mongoose = require('mongoose');

const { Schema } = mongoose;

const releaseSchema = new Schema(
  {
    published: { type: Boolean, default: false },
    publishedAt: { type: Date },
    scheduledAt: { type: Date },
  },
  { _id: false }
);

const competitionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    instructions: { type: String, trim: true, maxlength: 5000, default: '' },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },

    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1, max: 600 },

    negativeMarking: {
      enabled: { type: Boolean, default: false },
      // fraction of a question's marks deducted for a wrong answer (0.25 = 25%)
      fraction: { type: Number, min: 0, max: 1, default: 0.25 },
    },
    shuffleQuestions: { type: Boolean, default: false },
    shuffleOptions: { type: Boolean, default: false },
    maxAttempts: { type: Number, default: 1, min: 1, max: 10 },

    visibility: { type: String, enum: ['all', 'assigned'], default: 'assigned' },
    assignedParticipants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // Explicit admin permission for extra attempts
    attemptOverrides: [
      new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User' }, extraAttempts: { type: Number, min: 0, max: 10 } }, { _id: false }),
    ],

    // Results (score + leaderboard) and answer key are released independently of quiz closure
    resultsRelease: { type: releaseSchema, default: () => ({}) },
    answerRelease: { type: releaseSchema, default: () => ({}) },
    showLeaderboard: { type: Boolean, default: true },

    // denormalised, maintained by services/competition.refreshStats
    questionCount: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

competitionSchema.index({ status: 1, startTime: -1 });
competitionSchema.index({ assignedParticipants: 1 });

module.exports = mongoose.model('Competition', competitionSchema);
