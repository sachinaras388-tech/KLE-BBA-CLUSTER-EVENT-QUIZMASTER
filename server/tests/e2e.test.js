/**
 * End-to-end API tests against a throw-away in-memory MongoDB.
 *   cd server && npm install && npm test
 * (first run downloads a mongod binary for mongodb-memory-server)
 *
 * Covers the "critical competition rules": no public registration, backend role enforcement, no answer-key
 * leakage, server-side scoring, duplicate-attempt prevention, deadline enforcement, privacy between participants,
 * and separate scheduling of results vs answer key.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let server;
let base;
let mongoose;
let models;

const ADMIN = { email: 'admin@test.local', password: 'Sup3rSecretAdmin!' };
const clients = {};

/** tiny cookie-aware client */
function client(name) {
  clients[name] = { cookie: '' };
  return async (method, path, body) => {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'quizmaster',
        ...(clients[name].cookie ? { cookie: clients[name].cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.getSetCookie?.() || [];
    const tok = sc.find((c) => c.startsWith('qm_token='));
    if (tok) clients[name].cookie = tok.split(';')[0];
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* csv etc. */
    }
    return { status: res.status, json, text };
  };
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongod.getUri('quizmaster_test'),
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    CLIENT_URL: 'http://localhost:5173',
    BCRYPT_ROUNDS: '10',
    SUBMIT_GRACE_SECONDS: '0',
  });
  mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  models = {
    User: require('../src/models/User'),
    Competition: require('../src/models/Competition'),
    Question: require('../src/models/Question'),
    Attempt: require('../src/models/Attempt'),
  };
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await models.User.create({ email: ADMIN.email, name: 'Test Admin', role: 'admin', passwordHash: await models.User.hashPassword(ADMIN.password) });
  server = require('../src/app').listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongod.stop();
});

const state = {};

test('there is no public registration or public admin creation', async () => {
  const anon = client('anon');
  for (const path of ['/auth/register', '/auth/signup', '/admin/register', '/users']) {
    const r = await anon('POST', path, { name: 'x', email: 'x@x.io', password: 'Aa1aaaaaaaa', role: 'admin' });
    assert.ok([401, 404].includes(r.status), `${path} -> ${r.status}`);
  }
  assert.equal((await anon('POST', '/admin/users', { name: 'Nope' })).status, 401);
});

test('CSRF guard: state-changing request without the custom header is rejected', async () => {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('admin signs in; wrong password is rejected', async () => {
  state.admin = client('admin');
  assert.equal((await state.admin('POST', '/auth/login', { identifier: ADMIN.email, password: 'wrong-password' })).status, 401);
  const ok = await state.admin('POST', '/auth/login', { identifier: ADMIN.email, password: ADMIN.password });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.role, 'admin');
  assert.equal(ok.json.user.passwordHash, undefined);
});

test('admin creates participants with generated IDs + temporary passwords', async () => {
  const r = await state.admin('POST', '/admin/users/bulk', { participants: [{ name: 'Alice Test' }, { name: 'Bob Test' }, { name: 'Eve Outsider' }] });
  assert.equal(r.status, 201);
  assert.equal(r.json.created.length, 3);
  for (const c of r.json.created) {
    assert.match(c.participantId, /^QM-[A-Z0-9]{6}$/);
    assert.ok(c.temporaryPassword.length >= 10);
  }
  [state.alice, state.bob, state.eve] = r.json.created;
});

test('temporary password must be changed before anything else works; roles are enforced on the backend', async () => {
  state.aliceApi = client('alice');
  const login = await state.aliceApi('POST', '/auth/login', { identifier: state.alice.participantId, password: state.alice.temporaryPassword });
  assert.equal(login.status, 200);
  assert.equal(login.json.user.mustChangePassword, true);
  assert.equal((await state.aliceApi('GET', '/student/competitions')).json.code, 'PASSWORD_CHANGE_REQUIRED');

  const weak = await state.aliceApi('POST', '/auth/change-password', { currentPassword: state.alice.temporaryPassword, newPassword: 'short' });
  assert.equal(weak.status, 400);
  const chg = await state.aliceApi('POST', '/auth/change-password', { currentPassword: state.alice.temporaryPassword, newPassword: 'AlicePass123' });
  assert.equal(chg.status, 200);
  assert.equal((await state.aliceApi('GET', '/student/competitions')).status, 200);

  // students can never reach admin APIs
  for (const p of ['/admin/stats', '/admin/users', '/admin/competitions', '/admin/audit-logs']) {
    assert.equal((await state.aliceApi('GET', p)).status, 403, p);
  }
  // other participants
  for (const who of ['bob', 'eve']) {
    const api = client(who);
    await api('POST', '/auth/login', { identifier: state[who].participantId, password: state[who].temporaryPassword });
    await api('POST', '/auth/change-password', { currentPassword: state[who].temporaryPassword, newPassword: `${who}Pass12345` });
    state[`${who}Api`] = api;
  }
});

test('admin builds + publishes a competition', async () => {
  const now = Date.now();
  const c = await state.admin('POST', '/admin/competitions', {
    title: 'E2E Competition',
    startTime: new Date(now - 60_000).toISOString(),
    endTime: new Date(now + 3_600_000).toISOString(),
    durationMinutes: 30,
    negativeMarking: { enabled: true, fraction: 0.25 },
    visibility: 'assigned',
  });
  assert.equal(c.status, 201);
  state.compId = c.json.competition.id;

  const imp = await state.admin('POST', `/admin/competitions/${state.compId}/questions/import`, {
    questions: [
      { text: 'Q-ONE', options: ['A1', 'B1', 'C1'], correctIndex: 0, explanation: 'SECRET-EXPLANATION-1', marks: 1 },
      { text: 'Q-TWO', options: ['A2', 'B2', 'C2'], correctIndex: 1, explanation: 'SECRET-EXPLANATION-2', marks: 1 },
      { text: 'Q-THREE', options: ['A3', 'B3', 'C3'], correctIndex: 2, explanation: 'SECRET-EXPLANATION-3', marks: 1 },
    ],
  });
  assert.equal(imp.status, 201);
  const list = await state.admin('GET', `/admin/competitions/${state.compId}/questions`);
  state.questions = Object.fromEntries(list.json.items.map((q) => [q.text, q]));

  // not visible to students until published
  assert.equal((await state.aliceApi('GET', `/student/competitions/${state.compId}`)).status, 404);
  const assign = await state.admin('PUT', `/admin/competitions/${state.compId}/assignments`, { visibility: 'assigned', participantIds: [state.alice.id, state.bob.id] });
  assert.equal(assign.status, 200);
  assert.equal((await state.admin('POST', `/admin/competitions/${state.compId}/status`, { status: 'published' })).status, 200);
});

test('participants only see competitions they are assigned to', async () => {
  assert.equal((await state.aliceApi('GET', '/student/competitions')).json.items.length, 1);
  assert.equal((await state.eveApi('GET', '/student/competitions')).json.items.length, 0);
  assert.equal((await state.eveApi('GET', `/student/competitions/${state.compId}`)).status, 404);
  assert.equal((await state.eveApi('POST', `/student/competitions/${state.compId}/start`)).status, 404);
});

test('quiz payload NEVER contains the answer key', async () => {
  const start = await state.aliceApi('POST', `/student/competitions/${state.compId}/start`);
  assert.equal(start.status, 201);
  state.attemptId = start.json.attempt.id;
  const raw = start.text;
  for (const forbidden of ['correctOption', 'correctIndex', 'SECRET-EXPLANATION', 'explanation', 'isCorrect']) {
    assert.ok(!raw.includes(forbidden), `quiz response leaked "${forbidden}"`);
  }
  assert.equal(start.json.questions.length, 3);

  // resume (second start / GET) returns the SAME attempt, not a new one
  const again = await state.aliceApi('POST', `/student/competitions/${state.compId}/start`);
  assert.equal(again.json.attempt.id, state.attemptId);
  const get = await state.aliceApi('GET', `/student/attempts/${state.attemptId}`);
  assert.ok(!get.text.includes('correctOption'));
  state.quizQ = Object.fromEntries(start.json.questions.map((q) => [q.text, q]));
});

test('participants cannot read or write another participant\'s attempt', async () => {
  assert.equal((await state.bobApi('GET', `/student/attempts/${state.attemptId}`)).status, 404);
  const q = state.quizQ['Q-ONE'];
  assert.equal((await state.bobApi('PUT', `/student/attempts/${state.attemptId}/answer`, { questionId: q.id, optionId: q.options[0].id })).status, 404);
  assert.equal((await state.bobApi('POST', `/student/attempts/${state.attemptId}/submit`, {})).status, 404);
});

test('answers autosave, invalid options are rejected, and resume restores them', async () => {
  const q1 = state.quizQ['Q-ONE'];
  const q2 = state.quizQ['Q-TWO'];
  const optId = (adminQ, idx) => state.quizQ[adminQ.text].options.find((o) => o.text === adminQ.options[idx].text).id;
  const correct1 = optId(state.questions['Q-ONE'], state.questions['Q-ONE'].correctIndex);
  const wrong2 = optId(state.questions['Q-TWO'], 0); // correct is index 1

  assert.equal((await state.aliceApi('PUT', `/student/attempts/${state.attemptId}/answer`, { questionId: q1.id, optionId: correct1 })).status, 200);
  assert.equal((await state.aliceApi('PUT', `/student/attempts/${state.attemptId}/answer`, { questionId: q2.id, optionId: wrong2 })).status, 200);
  const bad = await state.aliceApi('PUT', `/student/attempts/${state.attemptId}/answer`, { questionId: q1.id, optionId: 'a'.repeat(24) });
  assert.equal(bad.status, 400);

  const resumed = await state.aliceApi('GET', `/student/attempts/${state.attemptId}`);
  assert.equal(resumed.json.answers[q1.id], correct1);
  assert.equal(resumed.json.answers[q2.id], wrong2);
});

test('submission has no score, is idempotent, and blocks duplicate attempts', async () => {
  const sub = await state.aliceApi('POST', `/student/attempts/${state.attemptId}/submit`, {});
  assert.equal(sub.status, 200);
  assert.equal(sub.json.score, undefined);
  assert.ok(!sub.text.includes('"score"'));
  assert.equal(sub.json.answered, 2);

  const again = await state.aliceApi('POST', `/student/attempts/${state.attemptId}/submit`, {});
  assert.equal(again.status, 200);
  assert.equal(again.json.submittedAt, sub.json.submittedAt);

  assert.equal((await state.aliceApi('PUT', `/student/attempts/${state.attemptId}/answer`, { questionId: state.quizQ['Q-ONE'].id, optionId: state.quizQ['Q-ONE'].options[1].id })).json.code, 'ATTEMPT_CLOSED');
  const dup = await state.aliceApi('POST', `/student/competitions/${state.compId}/start`);
  assert.equal(dup.status, 409);
  assert.equal(dup.json.code, 'NO_ATTEMPTS_LEFT');
});

test('results and answer key stay sealed until released - and cannot be released before the competition closes', async () => {
  assert.equal((await state.aliceApi('GET', `/student/competitions/${state.compId}/result`)).json.code, 'RESULTS_NOT_RELEASED');
  assert.equal((await state.aliceApi('GET', `/student/competitions/${state.compId}/review`)).json.code, 'ANSWERS_NOT_RELEASED');
  assert.equal((await state.aliceApi('GET', `/student/competitions/${state.compId}/leaderboard`)).status, 403);

  const early = await state.admin('POST', `/admin/competitions/${state.compId}/release`, { kind: 'results', action: 'publish' });
  assert.equal(early.status, 409);
  assert.equal(early.json.code, 'NOT_CLOSED');

  // even if the flag were somehow set early, the server-side time gate still holds
  await models.Competition.updateOne({ _id: state.compId }, { $set: { 'resultsRelease.published': true } });
  assert.equal((await state.aliceApi('GET', `/student/competitions/${state.compId}/result`)).status, 403);
  await models.Competition.updateOne({ _id: state.compId }, { $set: { 'resultsRelease.published': false } });
});

test('after closing: results are released separately from the answer key; scoring is server-side', async () => {
  const past = new Date(Date.now() - 5_000);
  await models.Competition.updateOne({ _id: state.compId }, { $set: { endTime: past, startTime: new Date(Date.now() - 7_200_000) } });

  assert.equal((await state.admin('POST', `/admin/competitions/${state.compId}/release`, { kind: 'results', action: 'publish' })).status, 200);

  const result = await state.aliceApi('GET', `/student/competitions/${state.compId}/result`);
  assert.equal(result.status, 200);
  // 1 correct (+1), 1 wrong (-0.25), 1 unanswered (0)
  assert.equal(result.json.result.score, 0.75);
  assert.equal(result.json.result.correct, 1);
  assert.equal(result.json.result.wrong, 1);
  assert.equal(result.json.result.unanswered, 1);
  assert.equal(result.json.result.rank, 1);

  // answer key is STILL sealed
  assert.equal((await state.aliceApi('GET', `/student/competitions/${state.compId}/review`)).status, 403);

  // schedule the answer key for the future: still sealed
  const future = new Date(Date.now() + 3_600_000).toISOString();
  assert.equal((await state.admin('POST', `/admin/competitions/${state.compId}/release`, { kind: 'answers', action: 'schedule', scheduledAt: future })).status, 200);
  assert.equal((await state.aliceApi('GET', `/student/competitions/${state.compId}/review`)).status, 403);

  assert.equal((await state.admin('POST', `/admin/competitions/${state.compId}/release`, { kind: 'answers', action: 'publish' })).status, 200);
  const review = await state.aliceApi('GET', `/student/competitions/${state.compId}/review`);
  assert.equal(review.status, 200);
  const one = review.json.questions.find((q) => q.text === 'Q-ONE');
  assert.equal(one.isCorrect, true);
  assert.equal(one.explanation, 'SECRET-EXPLANATION-1');
});

test('leaderboard never exposes login identifiers or other participants\' answers', async () => {
  const lb = await state.aliceApi('GET', `/student/competitions/${state.compId}/leaderboard`);
  assert.equal(lb.status, 200);
  assert.ok(!lb.text.includes(state.alice.participantId));
  assert.ok(!lb.text.includes('participantId'));
  assert.ok(!lb.text.includes('selectedOptionId'));
  assert.equal(lb.json.items[0].isMe, true);
  // Bob never attempted: no result for him
  assert.equal((await state.bobApi('GET', `/student/competitions/${state.compId}/result`)).json.code, 'NO_ATTEMPT');
});

test('server enforces the deadline: late autosaves are refused and expired attempts auto-submit', async () => {
  const now = Date.now();
  const c2 = await state.admin('POST', '/admin/competitions', {
    title: 'Deadline Competition',
    startTime: new Date(now - 60_000).toISOString(),
    endTime: new Date(now + 3_600_000).toISOString(),
    durationMinutes: 10,
  });
  const id = c2.json.competition.id;
  await state.admin('POST', `/admin/competitions/${id}/questions`, { text: 'Only question', options: ['x', 'y'], correctIndex: 0, marks: 1 });
  await state.admin('PUT', `/admin/competitions/${id}/assignments`, { visibility: 'all', participantIds: [] });
  await state.admin('POST', `/admin/competitions/${id}/status`, { status: 'published' });

  const start = await state.bobApi('POST', `/student/competitions/${id}/start`);
  assert.equal(start.status, 201);
  const attemptId = start.json.attempt.id;
  // server-computed deadline is ~10 minutes out, never later than the competition end
  const dl = new Date(start.json.attempt.deadline).getTime();
  assert.ok(dl > now && dl <= now + 10 * 60_000 + 5_000);

  // simulate the clock running out
  await models.Attempt.updateOne({ _id: attemptId }, { $set: { deadline: new Date(Date.now() - 1_000) } });
  const q = start.json.questions[0];
  const late = await state.bobApi('PUT', `/student/attempts/${attemptId}/answer`, { questionId: q.id, optionId: q.options[0].id });
  assert.equal(late.status, 409);
  assert.equal(late.json.code, 'ATTEMPT_CLOSED');

  const after = await state.bobApi('GET', `/student/attempts/${attemptId}`);
  assert.equal(after.json.closed, true);
  assert.equal(after.json.status, 'auto_submitted');
});

test('admin: monitoring, CSV export (admin-only), audit trail', async () => {
  const mon = await state.admin('GET', `/admin/competitions/${state.compId}/attempts`);
  assert.equal(mon.status, 200);
  assert.ok(mon.json.summary.submitted >= 1);

  const csv = await state.admin('GET', `/admin/competitions/${state.compId}/export.csv`);
  assert.equal(csv.status, 200);
  assert.ok(csv.text.includes('Participant ID'));
  assert.ok(csv.text.includes(state.alice.participantId));
  assert.equal((await state.aliceApi('GET', `/admin/competitions/${state.compId}/export.csv`)).status, 403);

  const audit = await state.admin('GET', '/admin/audit-logs?limit=100');
  const actions = new Set(audit.json.items.map((i) => i.action));
  for (const a of ['COMPETITION_CREATED', 'PARTICIPANTS_BULK_CREATED', 'RESULTS_PUBLISH', 'ANSWERS_PUBLISH', 'RESULTS_EXPORTED', 'ATTEMPT_SUBMITTED']) {
    assert.ok(actions.has(a), `missing audit action ${a}`);
  }
});

test('deactivating a participant kills their session immediately and blocks login', async () => {
  assert.equal((await state.admin('PATCH', `/admin/users/${state.bob.id}`, { isActive: false })).status, 200);
  assert.equal((await state.bobApi('GET', '/student/competitions')).status, 401);
  const re = await client('bob2')('POST', '/auth/login', { identifier: state.bob.participantId, password: 'bobPass12345' });
  assert.equal(re.status, 403);
  assert.equal(re.json.code, 'ACCOUNT_DISABLED');
});

test('account lockout after repeated failed logins', async () => {
  const api = client('lock');
  let last;
  for (let i = 0; i < 6; i++) last = await api('POST', '/auth/login', { identifier: state.eve.participantId, password: 'definitely-wrong' });
  assert.equal(last.status, 423);
  const ok = await api('POST', '/auth/login', { identifier: state.eve.participantId, password: 'evePass12345' });
  assert.equal(ok.status, 423, 'correct password must also be refused while locked');
});
