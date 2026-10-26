/**
 * Loads SAMPLE data for development / demos: one draft competition (data/sample-quiz.json) and a few demo
 * participants with RANDOM passwords that are printed once. Requires an existing admin (npm run create-admin).
 *
 *   npm run seed
 *
 * Refuses to run in production unless ALLOW_SEED=true.
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Competition = require('../src/models/Competition');
const Question = require('../src/models/Question');
const { createParticipant } = require('../src/services/users');
const { refreshStats } = require('../src/services/competition');
const sample = require('../data/sample-quiz.json');

async function main() {
  if (env.isProd && process.env.ALLOW_SEED !== 'true') {
    throw new Error('Refusing to seed in production. Set ALLOW_SEED=true if you really want sample data.');
  }
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const admin = await User.findOne({ role: 'admin' });
  if (!admin) throw new Error('No admin exists yet. Run `npm run create-admin` first.');

  const demo = [
    { name: 'Aarav Sharma', organization: 'Demo School' },
    { name: 'Diya Patel', organization: 'Demo School' },
    { name: 'Kabir Singh', organization: 'Demo School' },
  ];
  const credentials = [];
  const ids = [];
  for (const p of demo) {
    const { user, temporaryPassword } = await createParticipant(p, admin);
    ids.push(user._id);
    credentials.push({ name: user.name, participantId: user.participantId, temporaryPassword });
  }

  const now = Date.now();
  const comp = await Competition.create({
    ...sample.competition,
    startTime: new Date(now + 60 * 60 * 1000),
    endTime: new Date(now + 26 * 60 * 60 * 1000),
    status: 'draft',
    assignedParticipants: ids,
    createdBy: admin._id,
  });

  for (const [i, d] of sample.questions.entries()) {
    const q = new Question({
      competition: comp._id,
      order: i,
      text: d.text,
      options: d.options.map((text) => ({ text })),
      explanation: d.explanation,
      marks: d.marks,
    });
    q.correctOption = q.options[d.correctIndex]._id;
    // eslint-disable-next-line no-await-in-loop
    await q.save();
  }
  await refreshStats(comp._id);

  console.log(`\nCreated draft competition "${comp.title}" with ${sample.questions.length} questions.`);
  console.log('Publish it from the admin dashboard and adjust the schedule.\n');
  console.log('Demo participants (shown once - they must change the password at first login):');
  console.table(credentials);
}

main()
  .catch((err) => {
    console.error(`\nSeed failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
