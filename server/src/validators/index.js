const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password is too long')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/\d/, 'Password needs a number');

const trimmed = (min, max) => z.string().trim().min(min).max(max);
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

/* ---------------- auth ---------------- */
const login = z.object({
  identifier: trimmed(3, 200),
  password: z.string().min(1).max(200),
});

const changePassword = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

/* ---------------- users ---------------- */
const participantBase = {
  name: trimmed(2, 100),
  email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal('').transform(() => undefined)),
  organization: optionalText(120),
};
const createUser = z.object(participantBase);
const bulkUsers = z.object({ participants: z.array(z.object(participantBase)).min(1).max(50) });
const updateUser = z
  .object({
    name: trimmed(2, 100),
    email: z.string().trim().toLowerCase().email().max(200).nullable().or(z.literal('')),
    organization: z.string().trim().max(120).nullable(),
    isActive: z.boolean(),
  })
  .partial();

const listUsersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

/* ---------------- competitions ---------------- */
const competitionFields = {
  title: trimmed(3, 160),
  description: z.string().trim().max(2000),
  instructions: z.string().trim().max(5000),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(1).max(600),
  negativeMarking: z.object({ enabled: z.boolean(), fraction: z.coerce.number().min(0).max(1) }),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  maxAttempts: z.coerce.number().int().min(1).max(10),
  visibility: z.enum(['all', 'assigned']),
  showLeaderboard: z.boolean(),
};
const createCompetition = z
  .object(competitionFields)
  .partial({ description: true, instructions: true, negativeMarking: true, shuffleQuestions: true, shuffleOptions: true, maxAttempts: true, visibility: true, showLeaderboard: true })
  .refine((d) => d.endTime > d.startTime, { message: 'End time must be after start time', path: ['endTime'] });
const updateCompetition = z.object(competitionFields).partial();

const setStatus = z.object({ status: z.enum(['draft', 'published', 'archived']) });
const assignments = z.object({
  visibility: z.enum(['all', 'assigned']),
  participantIds: z.array(objectId).max(5000).default([]),
});
const releaseAction = z.object({
  kind: z.enum(['results', 'answers']),
  action: z.enum(['publish', 'unpublish', 'schedule', 'clear_schedule']),
  scheduledAt: z.coerce.date().optional(),
});
const grantAttempt = z.object({ userId: objectId, extra: z.coerce.number().int().min(1).max(5).default(1) });

/* ---------------- questions ---------------- */
const questionBody = z
  .object({
    text: trimmed(3, 2000),
    options: z.array(trimmed(1, 500)).min(2, 'Add at least 2 options').max(6, 'At most 6 options'),
    correctIndex: z.coerce.number().int().min(0),
    explanation: z.string().trim().max(3000).default(''),
    marks: z.coerce.number().min(0.25).max(100).default(1),
  })
  .refine((d) => d.correctIndex < d.options.length, { message: 'Choose which option is correct', path: ['correctIndex'] })
  .refine((d) => new Set(d.options.map((o) => o.toLowerCase())).size === d.options.length, {
    message: 'Options must be different from each other',
    path: ['options'],
  });
const updateQuestion = questionBody;
const importQuestions = z.object({ questions: z.array(questionBody).min(1).max(300) });
const reorderQuestions = z.object({ ids: z.array(objectId).min(1).max(500) });

/* ---------------- student quiz ---------------- */
const saveAnswer = z.object({ questionId: objectId, optionId: objectId.nullable() });
const submitAttempt = z.object({
  answers: z.array(z.object({ questionId: objectId, optionId: objectId.nullable() })).max(500).optional(),
});

/* ---------------- misc queries ---------------- */
const attemptsQuery = z.object({
  status: z.enum(['all', 'in_progress', 'submitted', 'not_started']).default('all'),
  q: z.string().trim().max(100).optional(),
});
const auditQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  action: z.string().trim().max(60).optional(),
  q: z.string().trim().max(100).optional(),
});

module.exports = {
  login,
  changePassword,
  createUser,
  bulkUsers,
  updateUser,
  listUsersQuery,
  createCompetition,
  updateCompetition,
  setStatus,
  assignments,
  releaseAction,
  grantAttempt,
  questionBody,
  updateQuestion,
  importQuestions,
  reorderQuestions,
  saveAnswer,
  submitAttempt,
  attemptsQuery,
  auditQuery,
  password,
};
