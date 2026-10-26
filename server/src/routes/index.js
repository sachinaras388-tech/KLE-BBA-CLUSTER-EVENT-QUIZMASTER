const express = require('express');
const v = require('../validators');
const { requireAuth, requireRole, requirePasswordChanged } = require('../middleware/auth');
const { validate, objectIdParam, loginIpLimiter, loginAccountLimiter, answerLimiter, adminWriteLimiter } = require('../middleware/common');

const auth = require('../controllers/auth.controller');
const users = require('../controllers/admin.users.controller');
const comps = require('../controllers/admin.competitions.controller');
const questions = require('../controllers/admin.questions.controller');
const monitor = require('../controllers/admin.monitor.controller');
const student = require('../controllers/student.controller');

const router = express.Router();

router.get('/time', (_req, res) => res.json({ serverTime: new Date() }));

/* ------------------------------ auth ------------------------------ */
const authRouter = express.Router();
authRouter.post('/login', loginIpLimiter, loginAccountLimiter, validate({ body: v.login }), auth.login);
authRouter.post('/logout', auth.logout);
authRouter.get('/me', requireAuth, auth.me);
authRouter.post('/change-password', requireAuth, validate({ body: v.changePassword }), auth.changePassword);
router.use('/auth', authRouter);

/* ------------------------------ admin ------------------------------ */
const admin = express.Router();
admin.use(requireAuth, requireRole('admin'), adminWriteLimiter);
['id', 'qid', 'attemptId'].forEach((p) => admin.param(p, objectIdParam));

admin.get('/stats', monitor.stats);
admin.get('/audit-logs', validate({ query: v.auditQuery }), monitor.auditLogs);

admin.get('/users', validate({ query: v.listUsersQuery }), users.list);
admin.post('/users', validate({ body: v.createUser }), users.create);
admin.post('/users/bulk', validate({ body: v.bulkUsers }), users.bulkCreate);
admin.get('/users/:id', users.get);
admin.patch('/users/:id', validate({ body: v.updateUser }), users.update);
admin.post('/users/:id/reset-password', users.resetPassword);

admin.get('/competitions', comps.list);
admin.post('/competitions', validate({ body: v.createCompetition }), comps.create);
admin.get('/competitions/:id', comps.get);
admin.patch('/competitions/:id', validate({ body: v.updateCompetition }), comps.update);
admin.delete('/competitions/:id', comps.remove);
admin.post('/competitions/:id/status', validate({ body: v.setStatus }), comps.setStatus);
admin.put('/competitions/:id/assignments', validate({ body: v.assignments }), comps.setAssignments);
admin.post('/competitions/:id/release', validate({ body: v.releaseAction }), comps.release);
admin.post('/competitions/:id/grant-attempt', validate({ body: v.grantAttempt }), comps.grantAttempt);
admin.post('/competitions/:id/recalculate', comps.recalculate);

admin.get('/competitions/:id/questions', questions.list);
admin.post('/competitions/:id/questions', validate({ body: v.questionBody }), questions.create);
admin.post('/competitions/:id/questions/import', validate({ body: v.importQuestions }), questions.importMany);
admin.put('/competitions/:id/questions/order', validate({ body: v.reorderQuestions }), questions.reorder);
admin.put('/competitions/:id/questions/:qid', validate({ body: v.updateQuestion }), questions.update);
admin.delete('/competitions/:id/questions/:qid', questions.remove);

admin.get('/competitions/:id/attempts', validate({ query: v.attemptsQuery }), monitor.attempts);
admin.get('/competitions/:id/results', monitor.results);
admin.get('/competitions/:id/export.csv', monitor.exportCsv);
admin.get('/attempts/:attemptId', monitor.attemptDetail);
admin.post('/attempts/:attemptId/force-submit', monitor.forceSubmit);

router.use('/admin', admin);

/* ----------------------------- student ----------------------------- */
const st = express.Router();
st.use(requireAuth, requireRole('student'), requirePasswordChanged);
['id', 'attemptId'].forEach((p) => st.param(p, objectIdParam));

st.get('/competitions', student.listCompetitions);
st.get('/competitions/:id', student.getCompetition);
st.post('/competitions/:id/start', answerLimiter, student.startAttempt);
st.get('/competitions/:id/result', student.myResult);
st.get('/competitions/:id/review', student.review);
st.get('/competitions/:id/leaderboard', student.leaderboard);

st.get('/attempts/:attemptId', student.getAttempt);
st.get('/attempts/:attemptId/summary', student.attemptSummary);
st.put('/attempts/:attemptId/answer', answerLimiter, validate({ body: v.saveAnswer }), student.saveAnswer);
st.post('/attempts/:attemptId/submit', answerLimiter, validate({ body: v.submitAttempt }), student.submitAttempt);

router.use('/student', st);

module.exports = router;
