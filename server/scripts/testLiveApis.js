/**
 * Complete Live End-to-End API Test Suite for QuizMaster
 * Tests EVERY endpoint on the live running server (http://localhost:5000/api)
 */
const BASE = 'http://localhost:5000/api';

let adminCookie = '';
let studentCookie = '';
let testCompId = '';
let testAttemptId = '';
let questionIds = [];
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failCount++;
    throw new Error(message);
  }
  console.log(`  ✅ PASSED: ${message}`);
  passCount++;
}

async function req(method, path, body = null, cookie = '') {
  const headers = {
    'content-type': 'application/json',
    'x-requested-with': 'quizmaster',
  };
  if (cookie) headers['cookie'] = cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Extract set-cookie
  const setCookies = res.headers.getSetCookie?.() || [];
  const tokenCookie = setCookies.find((c) => c.startsWith('qm_token='));
  let newCookie = cookie;
  if (tokenCookie) {
    newCookie = tokenCookie.split(';')[0];
  }

  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {}

  return { status: res.status, json, text, cookie: newCookie };
}

async function run() {
  console.log('\n=============================================================');
  console.log('🧪 Starting Comprehensive Live API Test Suite for QuizMaster');
  console.log('=============================================================\n');

  // 1. Server time endpoint
  console.log('[1] Testing Public Server Time');
  const t1 = await req('GET', '/time');
  assert(t1.status === 200 && t1.json?.serverTime, 'GET /api/time returns current server time');

  // 2. Admin Login
  console.log('\n[2] Testing Admin Authentication');
  const lAdmin = await req('POST', '/auth/login', { identifier: 'admin', password: 'AdminPassword123!' });
  assert(lAdmin.status === 200, 'POST /api/auth/login succeeds with status 200');
  assert(lAdmin.json?.user?.role === 'admin', 'User role is "admin"');
  adminCookie = lAdmin.cookie;
  assert(Boolean(adminCookie), 'Session cookie qm_token was issued');

  // 3. Admin Verify Session
  console.log('\n[3] Testing /auth/me Session Verification');
  const me = await req('GET', '/auth/me', null, adminCookie);
  assert(me.status === 200 && me.json?.user?.username === 'admin', 'GET /api/auth/me returns admin user');

  // 4. Admin Stats & Audit Logs
  console.log('\n[4] Testing Admin Monitoring APIs');
  const stats = await req('GET', '/admin/stats', null, adminCookie);
  assert(stats.status === 200 && typeof stats.json?.participants?.total === 'number', 'GET /api/admin/stats returns statistics');

  const logs = await req('GET', '/admin/audit-logs', null, adminCookie);
  assert(logs.status === 200 && Array.isArray(logs.json?.items), 'GET /api/admin/audit-logs returns log items');

  // 5. Admin User Management
  console.log('\n[5] Testing Admin User Management APIs');
  const users = await req('GET', '/admin/users', null, adminCookie);
  assert(users.status === 200 && Array.isArray(users.json?.items), 'GET /api/admin/users returns user list');

  const newUser = await req('POST', '/admin/users', { name: `Test User ${Date.now()}` }, adminCookie);
  assert(newUser.status === 201 && newUser.json?.user?.participantId, 'POST /api/admin/users creates new participant');

  const bulkUsers = await req(
    'POST',
    '/admin/users/bulk',
    {
      participants: [
        { name: `Bulk Student A ${Date.now()}` },
        { name: `Bulk Student B ${Date.now()}` },
      ],
    },
    adminCookie
  );
  assert(bulkUsers.status === 201 && bulkUsers.json?.created?.length === 2, 'POST /api/admin/users/bulk creates multiple participants');

  // 6. Admin Competition Management
  console.log('\n[6] Testing Competition Creation & Configuration');
  const now = Date.now();
  const newComp = await req(
    'POST',
    '/admin/competitions',
    {
      title: `E2E Live Test Quiz ${Date.now()}`,
      description: 'Automated test competition created by test runner',
      instructions: 'Answer all questions carefully.',
      startTime: new Date(now - 5 * 60 * 1000).toISOString(),
      endTime: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      durationMinutes: 20,
      negativeMarking: { enabled: true, fraction: 0.25 },
      shuffleQuestions: true,
      shuffleOptions: true,
      maxAttempts: 1,
      visibility: 'all',
      showLeaderboard: true,
    },
    adminCookie
  );
  assert(newComp.status === 201 && newComp.json?.competition?.id, 'POST /api/admin/competitions creates new competition');
  testCompId = newComp.json.competition.id;

  // 7. Admin Questions Creation & Bulk Import
  console.log('\n[7] Testing Question Creation & Bulk Question Import');
  const qSingle = await req(
    'POST',
    `/admin/competitions/${testCompId}/questions`,
    {
      text: 'What is the powerhouse of the cell?',
      options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi apparatus'],
      correctIndex: 1,
      explanation: 'Mitochondria produce ATP for cellular energy.',
      marks: 2,
    },
    adminCookie
  );
  assert(qSingle.status === 201 && qSingle.json?.question?.id, 'POST /api/admin/competitions/:id/questions creates single question');

  const bulkQuestionsPayload = {
    questions: [
      {
        text: 'What is the atomic number of Carbon?',
        options: ['4', '6', '8', '12'],
        correctIndex: 1,
        explanation: 'Carbon has 6 protons.',
        marks: 1,
      },
      {
        text: 'Which planet is known as the Red Planet?',
        options: ['Venus', 'Mars', 'Jupiter', 'Mercury'],
        correctIndex: 1,
        explanation: 'Mars appears red due to iron oxide on its surface.',
        marks: 1,
      },
      {
        text: 'Which programming language executes inside the web browser?',
        options: ['C++', 'JavaScript', 'Python', 'Java'],
        correctIndex: 1,
        explanation: 'JavaScript is native to web browsers.',
        marks: 1,
      },
    ],
  };
  const qImport = await req('POST', `/admin/competitions/${testCompId}/questions/import`, bulkQuestionsPayload, adminCookie);
  assert(qImport.status === 201 && qImport.json?.imported === 3, 'POST /api/admin/competitions/:id/questions/import bulk-imports 3 questions');

  // List questions
  const qList = await req('GET', `/admin/competitions/${testCompId}/questions`, null, adminCookie);
  assert(qList.status === 200 && qList.json?.items?.length === 4, 'GET /api/admin/competitions/:id/questions returns 4 total questions');
  questionIds = qList.json.items.map((q) => q.id);

  // Reorder questions
  const qReorder = await req('PUT', `/admin/competitions/${testCompId}/questions/order`, { ids: [...questionIds].reverse() }, adminCookie);
  assert(qReorder.status === 200 && qReorder.json?.ok, 'PUT /api/admin/competitions/:id/questions/order reorders questions');

  // 8. Publish Competition
  console.log('\n[8] Publishing Competition');
  const pub = await req('POST', `/admin/competitions/${testCompId}/status`, { status: 'published' }, adminCookie);
  assert(pub.status === 200 && pub.json?.competition?.status === 'published', 'POST /api/admin/competitions/:id/status publishes competition');

  // 9. Student Login
  console.log('\n[9] Testing Student Authentication');
  const lStudent = await req('POST', '/auth/login', { identifier: 'student', password: 'Student12345!' });
  assert(lStudent.status === 200, 'POST /api/auth/login succeeds for student');
  assert(lStudent.json?.user?.role === 'student', 'User role is "student"');
  studentCookie = lStudent.cookie;

  // 10. Student Views Competitions & Lobby
  console.log('\n[10] Testing Student Competition Browsing & Lobby');
  const stComps = await req('GET', '/student/competitions', null, studentCookie);
  assert(stComps.status === 200 && Array.isArray(stComps.json?.items), 'GET /api/student/competitions returns list');
  const found = stComps.json.items.find((c) => c.id === testCompId);
  assert(Boolean(found), 'Student can see the published test competition');

  const stLobby = await req('GET', `/student/competitions/${testCompId}`, null, studentCookie);
  assert(stLobby.status === 200 && stLobby.json?.competition?.id === testCompId, 'GET /api/student/competitions/:id returns lobby details');

  // 11. Student Starts Attempt
  console.log('\n[11] Testing Student Quiz Attempt & Security');
  const start = await req('POST', `/student/competitions/${testCompId}/start`, null, studentCookie);
  const attemptId = start.json?.attempt?.id || start.json?.attemptId;
  assert(start.status === 201 && Boolean(attemptId), 'POST /api/student/competitions/:id/start creates attempt');
  testAttemptId = attemptId;

  // Verify answer keys are NOT leaked in question payload
  const exam = await req('GET', `/student/attempts/${testAttemptId}`, null, studentCookie);
  assert(exam.status === 200 && Array.isArray(exam.json?.questions), 'GET /api/student/attempts/:id returns exam questions');
  const hasLeakedKey = exam.json.questions.some((q) => q.correctIndex !== undefined || q.correctOption !== undefined);
  assert(!hasLeakedKey, 'CRITICAL SECURITY: Question payload does NOT leak correct answers to student');

  // 12. Student Answers Questions (Autosave)
  console.log('\n[12] Testing Live Autosave of Answers');
  const examQ1 = exam.json.questions[0];
  const examQ2 = exam.json.questions[1];
  const ans1 = await req('PUT', `/student/attempts/${testAttemptId}/answer`, { questionId: examQ1.id, optionId: examQ1.options[0].id }, studentCookie);
  assert(ans1.status === 200 && ans1.json?.saved, 'PUT /api/student/attempts/:id/answer successfully autosaves question 1');

  const ans2 = await req('PUT', `/student/attempts/${testAttemptId}/answer`, { questionId: examQ2.id, optionId: examQ2.options[1].id }, studentCookie);
  assert(ans2.status === 200 && ans2.json?.saved, 'PUT /api/student/attempts/:id/answer successfully autosaves question 2');

  // 13. Student Submits Quiz
  console.log('\n[13] Testing Quiz Submission & Server Scoring');
  const sub = await req('POST', `/student/attempts/${testAttemptId}/submit`, {}, studentCookie);
  assert(sub.status === 200 && (sub.json?.status === 'submitted' || Boolean(sub.json?.submittedAt)), 'POST /api/student/attempts/:id/submit finalizes the quiz');

  // Check post-submission summary receipt
  const summary = await req('GET', `/student/attempts/${testAttemptId}/summary`, null, studentCookie);
  assert(summary.status === 200 && summary.json?.answered === 2 && Boolean(summary.json?.receipt), 'GET /api/student/attempts/:id/summary accurately returns receipt & answered count');

  // 14. Admin Monitors Attempts & Releases Results
  console.log('\n[14] Testing Admin Monitoring & Result Release');
  const attempts = await req('GET', `/admin/competitions/${testCompId}/attempts`, null, adminCookie);
  assert(attempts.status === 200 && attempts.json?.items?.length > 0, 'GET /api/admin/competitions/:id/attempts shows student attempt');

  // Admin closes competition so results can be released
  const closePatch = await req('PATCH', `/admin/competitions/${testCompId}`, { endTime: new Date(Date.now() - 10000).toISOString() }, adminCookie);
  assert(closePatch.status === 200, 'PATCH /api/admin/competitions/:id closes competition');

  // Admin releases results
  const relRes = await req('POST', `/admin/competitions/${testCompId}/release`, { kind: 'results', action: 'publish' }, adminCookie);
  assert(relRes.status === 200, 'POST /api/admin/competitions/:id/release publishes results');

  // Admin releases answers
  const relAns = await req('POST', `/admin/competitions/${testCompId}/release`, { kind: 'answers', action: 'publish' }, adminCookie);
  assert(relAns.status === 200, 'POST /api/admin/competitions/:id/release publishes answer explanations');

  // 15. Student Views Results, Explanations & Leaderboard
  console.log('\n[15] Testing Student Result, Review & Leaderboard');
  const stResult = await req('GET', `/student/competitions/${testCompId}/result`, null, studentCookie);
  assert(stResult.status === 200 && typeof stResult.json?.result?.score === 'number', 'GET /api/student/competitions/:id/result shows calculated score');

  const stReview = await req('GET', `/student/competitions/${testCompId}/review`, null, studentCookie);
  assert(stReview.status === 200 && Array.isArray(stReview.json?.questions), 'GET /api/student/competitions/:id/review shows question explanations');

  const stBoard = await req('GET', `/student/competitions/${testCompId}/leaderboard`, null, studentCookie);
  assert(stBoard.status === 200 && Array.isArray(stBoard.json?.items), 'GET /api/student/competitions/:id/leaderboard shows rankings');

  // 16. Admin CSV Export
  console.log('\n[16] Testing CSV Report Export');
  const csvRes = await req('GET', `/admin/competitions/${testCompId}/export.csv`, null, adminCookie);
  assert(csvRes.status === 200 && csvRes.text.includes('Rank'), 'GET /api/admin/competitions/:id/export.csv returns CSV report');

  // 17. Logout
  console.log('\n[17] Testing Logout');
  const logout = await req('POST', '/auth/logout', null, studentCookie);
  assert(logout.status === 200 && logout.json?.ok, 'POST /api/auth/logout clears session');

  console.log('\n=============================================================');
  console.log(`🎉 ALL LIVE API TESTS COMPLETED!`);
  console.log(`Passed: ${passCount} | Failed: ${failCount}`);
  console.log('=============================================================\n');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Test suite aborted due to error:', err);
    process.exit(1);
  });
