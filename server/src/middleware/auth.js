const User = require('../models/User');
const env = require('../config/env');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { COOKIE_NAME, verifyToken } = require('../utils/token');

/** Authenticates from the httpOnly cookie (or a Bearer token for API tooling). */
const requireAuth = asyncHandler(async (req, _res, next) => {
  let token = req.cookies?.[COOKIE_NAME];
  const header = req.get('authorization');
  if (!token && header?.startsWith('Bearer ')) token = header.slice(7);
  if (!token) throw new ApiError(401, 'Please sign in to continue', 'UNAUTHENTICATED');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new ApiError(401, 'Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
  }

  const user = await User.findById(payload.sub);
  // tokenVersion changes on password change / reset / deactivation => old tokens die immediately
  if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
    throw new ApiError(401, 'Your session is no longer valid. Please sign in again.', 'SESSION_EXPIRED');
  }
  req.user = user;
  next();
});

const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to do that', 'FORBIDDEN'));
    }
    next();
  };

/** Participants must replace their temporary password before using anything else. */
const requirePasswordChanged = (req, _res, next) => {
  if (req.user?.mustChangePassword) {
    return next(new ApiError(403, 'Please change your temporary password first', 'PASSWORD_CHANGE_REQUIRED'));
  }
  next();
};

/** CSRF defence for cookie auth: custom header (forces CORS preflight) + Origin allow-list. */
const csrfGuard = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !env.clientOrigins.includes(origin.replace(/\/$/, ''))) {
    return next(new ApiError(403, 'Request origin not allowed', 'BAD_ORIGIN'));
  }
  if (req.get('x-requested-with') !== 'quizmaster' && !req.get('authorization')) {
    return next(new ApiError(403, 'Missing request header', 'CSRF'));
  }
  next();
};

module.exports = { requireAuth, requireRole, requirePasswordChanged, csrfGuard };
