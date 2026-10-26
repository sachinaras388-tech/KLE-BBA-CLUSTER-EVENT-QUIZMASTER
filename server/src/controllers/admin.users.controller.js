const User = require('../models/User');
const Attempt = require('../models/Attempt');
const audit = require('../services/audit');
const { createParticipant } = require('../services/users');
const { ApiError, asyncHandler, escapeRegex, generateTempPassword } = require('../utils/helpers');

const studentOr404 = async (id) => {
  const user = await User.findOne({ _id: id, role: 'student' });
  if (!user) throw new ApiError(404, 'Participant not found', 'NOT_FOUND');
  return user;
};

exports.list = asyncHandler(async (req, res) => {
  const { q, status, page, limit } = req.query;
  const filter = { role: 'student' };
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { participantId: rx }, { email: rx }, { organization: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

exports.create = asyncHandler(async (req, res) => {
  const { user, temporaryPassword } = await createParticipant(req.body, req.user);
  await audit(req, 'PARTICIPANT_CREATED', { entityType: 'User', entityId: user._id, meta: { participantId: user.participantId } });
  res.status(201).json({ user, credentials: { participantId: user.participantId, name: user.name, temporaryPassword } });
});

exports.bulkCreate = asyncHandler(async (req, res) => {
  const created = [];
  const failed = [];
  for (const p of req.body.participants) {
    try {
      // sequential on purpose: bcrypt is CPU heavy
      // eslint-disable-next-line no-await-in-loop
      const { user, temporaryPassword } = await createParticipant(p, req.user);
      created.push({ id: String(user._id), participantId: user.participantId, name: user.name, email: user.email, temporaryPassword });
    } catch (err) {
      failed.push({ name: p.name, reason: err.message });
    }
  }
  await audit(req, 'PARTICIPANTS_BULK_CREATED', { entityType: 'User', meta: { created: created.length, failed: failed.length } });
  res.status(201).json({ created, failed });
});

exports.get = asyncHandler(async (req, res) => {
  const user = await studentOr404(req.params.id);
  const attempts = await Attempt.find({ user: user._id })
    .sort({ startedAt: -1 })
    .limit(50)
    .populate('competition', 'title')
    .select('competition status startedAt submittedAt score maxScore attemptNumber');
  res.json({ user, attempts });
});

exports.update = asyncHandler(async (req, res) => {
  const user = await studentOr404(req.params.id);
  const { name, email, organization, isActive } = req.body;

  if (name !== undefined) user.name = name;
  if (organization !== undefined) user.organization = organization || undefined;
  if (email !== undefined) {
    if (email) {
      const clash = await User.exists({ email: email.toLowerCase(), _id: { $ne: user._id } });
      if (clash) throw new ApiError(409, 'That email is already used by another account', 'EMAIL_TAKEN');
      user.email = email;
    } else {
      user.email = undefined;
    }
  }
  let action = 'PARTICIPANT_UPDATED';
  if (isActive !== undefined && isActive !== user.isActive) {
    user.isActive = isActive;
    action = isActive ? 'PARTICIPANT_ACTIVATED' : 'PARTICIPANT_DEACTIVATED';
    if (!isActive) user.tokenVersion += 1; // kick out active sessions immediately
  }
  await user.save();
  await audit(req, action, { entityType: 'User', entityId: user._id, meta: { participantId: user.participantId } });
  res.json({ user });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const user = await studentOr404(req.params.id);
  const temporaryPassword = generateTempPassword();
  user.passwordHash = await User.hashPassword(temporaryPassword);
  user.mustChangePassword = true;
  user.tokenVersion += 1;
  user.failedLoginCount = 0;
  user.lockUntil = undefined;
  await user.save();
  await audit(req, 'PARTICIPANT_PASSWORD_RESET', { entityType: 'User', entityId: user._id, meta: { participantId: user.participantId } });
  res.json({ credentials: { participantId: user.participantId, name: user.name, temporaryPassword } });
});
