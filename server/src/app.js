const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');

const env = require('./config/env');
const routes = require('./routes');
const { csrfGuard } = require('./middleware/auth');
const { apiLimiter, notFound, errorHandler } = require('./middleware/common');
const { ApiError } = require('./utils/helpers');

const app = express();
app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');

app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
      return cb(new ApiError(403, 'Origin not allowed by CORS', 'CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'Authorization'],
    maxAge: 600,
  })
);
app.use(compression());
if (env.NODE_ENV !== 'test') app.use(morgan(env.isProd ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(mongoSanitize()); // strips $ and . operators from user input (NoSQL injection)

// Never let browsers/proxies cache API responses (quiz data, results)
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/health', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded', time: new Date() });
});

app.use('/api', apiLimiter, csrfGuard, routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
