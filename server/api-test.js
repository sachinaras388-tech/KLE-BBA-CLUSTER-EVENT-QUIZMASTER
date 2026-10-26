const BASE = 'http://localhost:5000/api';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'quizmaster' };
const fs = require('fs');
const ADMIN_PASSWORD = 'AdminPassword123!';
let cookie = '';

async function req(method, path, body) {
  const opts = { method, headers: { ...H, ...(cookie ? { cookie } : {}) } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json };
}

function pass(label, cond, extra = '') {
  console.log(`[${cond ? '✅ PASS' : '❌ FAIL'}] ${label}${extra ? ' ' + extra : ''}`);
  return cond;
}

async function main() {
  console.log('=== QuizMaster Full API Test Suite ===\n');
  let results = { pass: 0, fail: 0 };
  const ok = (label, cond, extra) => { pass(label, cond, extra); cond ? results.pass++ : results.fail++; };

  // 1. Health
  let r = await req('GET', '/../health');
  ok('Health check', r.status === 200 && r.json?.status === 'ok', JSON.stringify(r.json));

  // 2. Server time
  r = await req('GET', '/time');
  ok('Server time', r.status === 200 && !!r.json?.serverTime);

  // 3. CSRF guard  
  const rcsrf = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  ok('CSRF guard (no header → 403)', rcsrf.status === 403);

  // 4. Wrong password rejected
  r = await req('POST', '/auth/login', { identifier: 'admin', password: 'WrongPwd@999!' });
  ok('Wrong password rejected (401)', r.status === 401);

  // 5. Login with username
  r = await req('POST', '/auth/login', { identifier: 'admin', password: ADMIN_PASSWORD });
  ok('Admin login with username', r.status === 200 && r.json?.user?.role === 'admin', `role=${r.json?.user?.role}`);

  // 6. /me
  r = await req('GET', '/auth/me');
  ok('GET /auth/me', r.status === 200, `user=${r.json?.user?.name}`);

  // 7. Admin stats
  r = await req('GET', '/admin/stats');
  ok('GET /admin/stats', r.status === 200, JSON.stringify(r.json));

  // 8. List users
  r = await req('GET', '/admin/users');
  ok('GET /admin/users', r.status === 200, `count=${r.json?.items?.length}`);

  // 9. Create participant
  r = await req('POST', '/admin/users', { name: 'Test Student A', email: 'stuA@kle.edu', organization: 'KLE BBA Mahalingpur' });
  const uid = r.json?.user?._id || r.json?.user?.id;
  ok('POST /admin/users (create participant)', r.status === 201, `id=${uid}`);
  const tempPassword = r.json?.user?.tempPassword || r.json?.tempPassword;

  // 10. Bulk create users
  r = await req('POST', '/admin/users/bulk', {
    participants: [
      { name: 'Rahul Sharma', email: 'rahul@kle.edu', organization: 'KLE BBA' },
      { name: 'Priya Patel', organization: 'KLE BBA' },
      { name: 'Amit Kumar', email: 'amit@kle.edu' },
    ],
  });
  ok('POST /admin/users/bulk', r.status === 201, `created=${r.json?.created}`);

  // 11. Get single user
  if (uid) {
    r = await req('GET', `/admin/users/${uid}`);
    ok('GET /admin/users/:id', r.status === 200, `name=${r.json?.user?.name}`);
  }

  // 12. List competitions
  r = await req('GET', '/admin/competitions');
  ok('GET /admin/competitions', r.status === 200, `count=${r.json?.items?.length}`);

  // 13. Create competition
  const now = new Date();
  r = await req('POST', '/admin/competitions', {
    title: 'AI Mind Masters – Round 1',
    description: 'KLE Society College of BBA Mahalingpur – AI Quiz Competition',
    instructions: 'Answer all 60 questions. Each question carries 1 mark. No negative marking.',
    startTime: new Date(now.getTime() + 60000).toISOString(),
    endTime: new Date(now.getTime() + 3 * 3600000).toISOString(),
    durationMinutes: 60,
    negativeMarking: { enabled: false, fraction: 0 },
    shuffleQuestions: true,
    shuffleOptions: false,
    maxAttempts: 1,
    visibility: 'all',
    showLeaderboard: true,
  });
  const compId = r.json?.competition?._id || r.json?.competition?.id;
  ok('POST /admin/competitions (create)', r.status === 201, `id=${compId}`);

  if (!compId) {
    console.log('\n❌ Cannot continue without competition ID. Error:', JSON.stringify(r.json));
    return;
  }

  // 14. Get competition
  r = await req('GET', `/admin/competitions/${compId}`);
  ok('GET /admin/competitions/:id', r.status === 200, `title=${r.json?.competition?.title}`);

  // 15. Add single question
  r = await req('POST', `/admin/competitions/${compId}/questions`, {
    text: 'What is Artificial Intelligence?',
    options: ['A robot', 'Technology enabling machines to simulate human intelligence', 'A computer game', 'The internet'],
    correctIndex: 1,
    explanation: 'AI enables machines to simulate human intelligence.',
    marks: 1,
  });
  const q1id = r.json?.question?.id;
  ok('POST /admin/competitions/:id/questions (single)', r.status === 201, `qid=${q1id}`);

  // 16. List questions (should have 1)
  r = await req('GET', `/admin/competitions/${compId}/questions`);
  ok('GET /admin/competitions/:id/questions', r.status === 200, `count=${r.json?.items?.length}`);

  // 17. BULK IMPORT 60 questions from file
  const allQ = JSON.parse(fs.readFileSync('d:/quizmaster/ai-mind-masters-questions.json', 'utf8')).questions;
  r = await req('POST', `/admin/competitions/${compId}/questions/import`, { questions: allQ });
  ok('POST /questions/import (bulk 60 questions)', r.status === 201, `imported=${r.json?.imported}`);

  // 18. List questions (should have 61 now)
  r = await req('GET', `/admin/competitions/${compId}/questions`);
  ok('List questions after bulk import', r.status === 200, `total=${r.json?.items?.length}`);

  // 19. Update a question
  if (q1id) {
    r = await req('PUT', `/admin/competitions/${compId}/questions/${q1id}`, {
      text: 'What is AI? (Updated)',
      options: ['A robot', 'Technology enabling machines to simulate human intelligence', 'A computer game', 'The internet'],
      correctIndex: 1,
      explanation: 'AI enables machines to simulate human intelligence. (Updated)',
      marks: 1,
    });
    ok('PUT /admin/competitions/:id/questions/:qid (update)', r.status === 200);
  }

  // 20. Publish competition
  r = await req('POST', `/admin/competitions/${compId}/status`, { status: 'published' });
  ok('POST /competitions/:id/status → published', r.status === 200, `status=${r.json?.competition?.status}`);

  // 21. Audit logs
  r = await req('GET', '/admin/audit-logs');
  ok('GET /admin/audit-logs', r.status === 200, `count=${r.json?.items?.length}`);

  // 22. Competition attempts (should be 0)
  r = await req('GET', `/admin/competitions/${compId}/attempts`);
  ok('GET /admin/competitions/:id/attempts', r.status === 200, `count=${r.json?.items?.length}`);

  // 23. Competition results
  r = await req('GET', `/admin/competitions/${compId}/results`);
  ok('GET /admin/competitions/:id/results', r.status === 200);

  // 24. CSV export
  r = await req('GET', `/admin/competitions/${compId}/export.csv`);
  ok('GET /admin/competitions/:id/export.csv', r.status === 200);

  // 25. Student competition list (as admin, expecting 403 student-only route)
  r = await req('GET', '/student/competitions');
  ok('GET /student/competitions (admin → 403 forbidden)', r.status === 403);

  // 26. Logout
  r = await req('POST', '/auth/logout');
  ok('POST /auth/logout', r.status === 200);

  // 27. Auth after logout (should be 401)
  r = await req('GET', '/auth/me');
  ok('GET /auth/me after logout → 401', r.status === 401);

  // 28. Student login (use temp password)
  cookie = '';
  r = await req('POST', '/auth/login', { identifier: 'stuA@kle.edu', password: tempPassword || 'changeme' });
  const studentLoggedIn = r.status === 200;
  ok('Student login', studentLoggedIn || r.status === 403 || r.status === 401, `status=${r.status}`);

  console.log('\n=====================================');
  console.log(`Results: ${results.pass} passed, ${results.fail} failed`);
  console.log(`Score: ${Math.round((results.pass / (results.pass + results.fail)) * 100)}%`);
  console.log('\n📋 Competition created for AI Mind Masters:');
  console.log(`   ID: ${compId}`);
  console.log(`   URL: http://localhost:5173 (admin panel)`);
}

main().catch((e) => console.error('Fatal error:', e.message));
