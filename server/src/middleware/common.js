const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { ApiError } = require('../utils/helpers');

/* ---------- validation ---------- */
const validate = (schemas) => (req, _res, next) => {
  try {
    if (schemas.params) req.params = schemas.params.parse(req.params);
    if (schemas.query) req.query = schemas.query.parse(req.query);
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    next();
  } catch (err) {
    next(err);
  }
};

/** router.param('id', objectIdParam) */
const objectIdParam = (_req, _res, next, value) => {
  if (!mongoose.isValidObjectId(value) || String(value).length !== 24) {
    return next(new ApiError(400, 'Invalid identifier', 'BAD_ID'));
  }
  next();
};

/* ---------- rate limiting ---------- */
const message = (text) => ({ message: text, code: 'RATE_LIMITED' });

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000, // generous: many participants may share one campus / lab IP
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many requests. Please slow down.'),
});

const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many sign-in attempts from this network. Try again later.'),
});

const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProd ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.identifier || '').toLowerCase().slice(0, 100)}`,
  message: message('Too many sign-in attempts for this account. Try again in a few minutes.'),
  validate: { default: false },
});

// Per-user limiter for quiz writes (autosave bursts are fine; floods are not)
const answerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 150,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `u:${req.user?._id || req.ip}`,
  message: message('Saving too quickly. Please wait a moment.'),
  validate: { default: false },
});

const adminWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `a:${req.user?._id || req.ip}`,
  skip: (req) => req.method === 'GET',
  message: message('Too many admin actions. Please wait a moment.'),
  validate: { default: false },
});

/* ---------- errors ---------- */
const notFound = (_req, _res, next) => next(new ApiError(404, 'Resource not found', 'NOT_FOUND'));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let status = err.status || 500;
  let body = { message: err.message || 'Something went wrong', code: err.code };

  if (err.name === 'ZodError') {
    status = 400;
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    body = { message: details[0] ? `${details[0].path ? `${details[0].path}: ` : ''}${details[0].message}` : 'Invalid input', code: 'VALIDATION_ERROR', details };
  } else if (err.name === 'CastError' || err.name === 'ValidationError') {
    status = 400;
    body = { message: 'Invalid input', code: 'VALIDATION_ERROR' };
  } else if (err.code === 11000) {
    status = 409;
    body = { message: 'A record with these details already exists', code: 'DUPLICATE' };
  } else if (err.type === 'entity.too.large') {
    status = 413;
    body = { message: 'Request body too large', code: 'TOO_LARGE' };
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    body = { message: 'Malformed JSON body', code: 'BAD_JSON' };
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    if (env.isProd) body = { message: 'Internal server error', code: 'SERVER_ERROR' };
  }
  if (err.details && !body.details) body.details = err.details;
  res.status(status).json(body);
};

module.exports = {
  validate,
  objectIdParam,
  apiLimiter,
  loginIpLimiter,
  loginAccountLimiter,
  answerLimiter,
  adminWriteLimiter,
  notFound,
  errorHandler,
};
