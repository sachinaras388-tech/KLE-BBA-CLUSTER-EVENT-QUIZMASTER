const mongoose = require('mongoose');

const { Schema } = mongoose;

const FINAL_STATUSES = ['submitted', 'auto_submitted', 'admin_submitted'];

const answerSchema = new Schema(
  {
    question: { type: Schema.Types.ObjectId, required: true },
    option: { type: Schema.Types.ObjectId, required: true },
    savedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const attemptSchema = new Schema(
  {
    competition: { type: Schema.Types.ObjectId, ref: 'Competition', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['in_progress', 'grading', ...FINAL_STATUSES], default: 'in_progress' },

    startedAt: { type: Date, required: true },
    deadline: { type: Date, required: true }, // min(start + duration, competition end) - server computed
    submittedAt: { type: Date },
    finalizedAt: { type: Date },
    timeTakenSeconds: { type: Number },

    questionOrder: [{ type: Schema.Types.ObjectId }],
    optionOrders: [
      new Schema({ question: Schema.Types.ObjectId, options: [Schema.Types.ObjectId] }, { _id: false }),
    ],
    answers: [answerSchema],

    // Computed ONLY on the server when the attempt is finalised
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    unansweredCount: { type: Number, default: 0 },

    ip: { type: String },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true }
);

attemptSchema.index({ competition: 1, user: 1, attemptNumber: 1 }, { unique: true });
// At most one live attempt per participant per competition (prevents duplicate parallel starts)
attemptSchema.index(
  { competition: 1, user: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress' }, name: 'one_active_attempt' }
);
attemptSchema.index({ status: 1, deadline: 1 });
attemptSchema.index({ competition: 1, status: 1, score: -1 });

const Attempt = mongoose.model('Attempt', attemptSchema);
Attempt.FINAL_STATUSES = FINAL_STATUSES;
module.exports = Attempt;
