const bcrypt = require('bcryptjs');
const User = require('../models/User');
const env = require('../config/env');
const audit = require('../services/audit');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { issueSession, clearSession } = require('../utils/token');

// Used to keep response time constant when the account does not exist
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.BCRYPT_ROUNDS);

const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  role: u.role,
  participantId: u.participantId,
  username: u.username,
  email: u.email,
  organization: u.organization,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt,
});

exports.login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  // participant ID (QM-XXXXXX), admin username, or email - exact matches only
  const query = { $or: [{ participantId: identifier.toUpperCase() }, { username: identifier.toLowerCase() }, { email: identifier.toLowerCase() }] };
  const user = await User.findOne(query).select('+passwordHash');

  if (user?.lockUntil && user.lockUntil > new Date()) {
    await audit(req, 'LOGIN_BLOCKED_LOCKED', { actor: user, actorLabel: identifier });
    throw new ApiError(423, 'Too many failed attempts. This account is temporarily locked - try again later.', 'ACCOUNT_LOCKED');
  }

  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    if (user) {
      const failed = user.failedLoginCount + 1;
      const set = { failedLoginCount: failed };
      if (failed >= env.MAX_LOGIN_ATTEMPTS) {
        set.lockUntil = new Date(Date.now() + env.LOCKOUT_MINUTES * 60 * 1000);
        set.failedLoginCount = 0;
      }
      await User.updateOne({ _id: user._id }, { $set: set });
    }
    await audit(req, 'LOGIN_FAILED', { actor: user || undefined, actorLabel: identifier, meta: { knownAccount: Boolean(user) } });
    throw new ApiError(401, 'Incorrect ID or password', 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'This account has been deactivated. Please contact the organiser.', 'ACCOUNT_DISABLED');
  }

  const lastLoginAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, lastLoginAt }, $unset: { lockUntil: 1 } });
  user.lastLoginAt = lastLoginAt;
  issueSession(res, user);
  await audit(req, 'LOGIN_SUCCESS', { actor: user });
  res.json({ user: publicUser(user) });
});

exports.logout = asyncHandler(async (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.verifyPassword(currentPassword))) {
    await audit(req, 'PASSWORD_CHANGE_FAILED');
    throw new ApiError(400, 'Current password is incorrect', 'WRONG_PASSWORD');
  }
  if (await user.verifyPassword(newPassword)) {
    throw new ApiError(400, 'New password must be different from the current one', 'SAME_PASSWORD');
  }
  user.passwordHash = await User.hashPassword(newPassword);
  user.mustChangePassword = false;
  user.passwordChangedAt = new Date();
  user.tokenVersion += 1; // signs out every other session
  await user.save();
  issueSession(res, user);
  await audit(req, 'PASSWORD_CHANGED');
  res.json({ user: publicUser(user) });
});
