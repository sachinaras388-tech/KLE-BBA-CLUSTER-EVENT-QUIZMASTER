const jwt = require('jsonwebtoken');
const env = require('../config/env');

const COOKIE_NAME = 'qm_token';

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd || env.COOKIE_SAMESITE === 'none',
  sameSite: env.COOKIE_SAMESITE,
  path: '/',
  domain: env.COOKIE_DOMAIN || undefined,
});

function issueSession(res, user) {
  const seconds = Math.floor(env.JWT_EXPIRES_HOURS * 3600);
  const token = jwt.sign({ sub: String(user._id), role: user.role, tv: user.tokenVersion }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: seconds,
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: seconds * 1000 });
}

const clearSession = (res) => res.clearCookie(COOKIE_NAME, cookieOptions());

const verifyToken = (token) => jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });

module.exports = { COOKIE_NAME, issueSession, clearSession, verifyToken };
