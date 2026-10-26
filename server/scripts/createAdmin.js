/**
 * Secure initial-admin creation. There is NO public admin registration endpoint.
 *
 * Interactive (recommended):   npm run create-admin
 * Non-interactive (CI/Render shell):
 *   ADMIN_USERNAME=yourname ADMIN_NAME="Your Name" ADMIN_PASSWORD='...' npm run create-admin   (ADMIN_EMAIL optional)
 *
 * Run it from a trusted terminal that has MONGODB_URI + JWT_SECRET set (server/.env or the Render Shell).
 * Passwords are bcrypt-hashed; the plain text is never stored or logged.
 */
const readline = require('readline');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');
const { password: passwordSchema } = require('../src/validators');
const { z } = require('zod');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else if (s === '\r\n' || s === '\n') rl.output.write(s);
        else rl.output.write('*');
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const interactive = !process.env.ADMIN_PASSWORD;
  let email = process.env.ADMIN_EMAIL;
  let username = process.env.ADMIN_USERNAME;
  let name = process.env.ADMIN_NAME || process.env.ADMIN_USERNAME;
  let password = process.env.ADMIN_PASSWORD;

  if (interactive) {
    if (!process.stdin.isTTY) throw new Error('No TTY available. Provide ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD env vars.');
    console.log('\n== QuizMaster: create admin account ==\n');
    username = await ask('Admin username (sign-in name): ');
    email = await ask('Admin email (optional, press Enter to skip): ');
    name = await ask('Full name: ');
    password = await ask('Password (min 10 chars, upper+lower+number): ', { hidden: true });
    const confirm = await ask('Confirm password: ', { hidden: true });
    if (password !== confirm) throw new Error('Passwords do not match');
  }

  email = email ? z.string().trim().toLowerCase().email().parse(email) : undefined;
  username = username ? z.string().trim().toLowerCase().min(3).max(60).parse(username) : undefined;
  if (!email && !username) throw new Error('Provide ADMIN_USERNAME and/or ADMIN_EMAIL');
  name = z.string().trim().min(2).max(100).parse(name);
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) throw new Error(pw.error.issues.map((i) => i.message).join('; '));

  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const clash = await User.findOne({ $or: [...(email ? [{ email }] : []), ...(username ? [{ username }] : [])] }).select('_id');
  if (clash) throw new Error('A user with that username or email already exists');
  const existingAdmins = await User.countDocuments({ role: 'admin' });

  const admin = await User.create({
    ...(email ? { email } : {}),
    ...(username ? { username } : {}),
    name,
    role: 'admin',
    passwordHash: await User.hashPassword(password),
    mustChangePassword: false,
    isActive: true,
  });
  await AuditLog.create({ actor: admin._id, actorLabel: username || email, action: 'ADMIN_CREATED_VIA_CLI', entityType: 'User', entityId: String(admin._id), meta: { existingAdmins } });

  console.log(`\nAdmin created: ${username || email}`);
  console.log('Sign in at the website using this username (or email) and your password.');
  if (!interactive) console.log('Remember to remove ADMIN_PASSWORD from your shell history / environment.');
}

main()
  .catch((err) => {
    console.error(`\nFailed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
