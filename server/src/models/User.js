const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

const userSchema = new mongoose.Schema(
  {
    participantId: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true, maxlength: 200 },
    // optional sign-in name for admins (stored lowercase, matched case-insensitively)
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true, minlength: 3, maxlength: 60 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    organization: { type: String, trim: true, maxlength: 120 },
    role: { type: String, enum: ['admin', 'student'], default: 'student', required: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    mustChangePassword: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    tokenVersion: { type: Number, default: 0 },
    failedLoginCount: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.tokenVersion;
        delete ret.failedLoginCount;
        return ret;
      },
    },
  }
);

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, env.BCRYPT_ROUNDS);
userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
