const User = require('../models/User');
const { ApiError, generateParticipantId, generateTempPassword } = require('../utils/helpers');

async function uniqueParticipantId() {
  for (let i = 0; i < 10; i++) {
    const id = generateParticipantId();
    // eslint-disable-next-line no-await-in-loop
    if (!(await User.exists({ participantId: id }))) return id;
  }
  throw new ApiError(500, 'Could not generate a unique participant ID');
}

/** Creates a student with a generated ID + temporary password. The password is returned ONCE. */
async function createParticipant({ name, email, organization }, createdBy) {
  if (email && (await User.exists({ email: email.toLowerCase() }))) {
    throw new ApiError(409, `A user with the email ${email} already exists`, 'EMAIL_TAKEN');
  }
  const temporaryPassword = generateTempPassword();
  const user = await User.create({
    name,
    ...(email ? { email } : {}),
    ...(organization ? { organization } : {}),
    role: 'student',
    participantId: await uniqueParticipantId(),
    passwordHash: await User.hashPassword(temporaryPassword),
    mustChangePassword: true,
    createdBy: createdBy?._id,
  });
  return { user, temporaryPassword };
}

module.exports = { createParticipant };
