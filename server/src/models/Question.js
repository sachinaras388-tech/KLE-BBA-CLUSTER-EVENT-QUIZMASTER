const mongoose = require('mongoose');

const { Schema } = mongoose;

const optionSchema = new Schema({ text: { type: String, required: true, trim: true, maxlength: 500 } });

const questionSchema = new Schema(
  {
    competition: { type: Schema.Types.ObjectId, ref: 'Competition', required: true, index: true },
    order: { type: Number, default: 0 },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    options: {
      type: [optionSchema],
      validate: [(v) => v.length >= 2 && v.length <= 6, 'A question needs between 2 and 6 options'],
    },
    // SECURITY: never selected by default - only admin endpoints and the grading/review services opt in
    correctOption: { type: Schema.Types.ObjectId, required: true, select: false },
    explanation: { type: String, trim: true, maxlength: 3000, default: '', select: false },
    marks: { type: Number, default: 1, min: 0.25, max: 100 },
  },
  { timestamps: true }
);

questionSchema.index({ competition: 1, order: 1 });

module.exports = mongoose.model('Question', questionSchema);
