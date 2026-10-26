const env = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');
const { startSweeper } = require('./services/attempts');
const mongoose = require('mongoose');

// make sure all models/indexes are registered
require('./models/User');
require('./models/Competition');
require('./models/Question');
require('./models/Attempt');
require('./models/AuditLog');

async function main() {
  await connectDB();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes().catch((e) => console.warn('[index]', m.modelName, e.message))));

  const server = app.listen(env.PORT, () => console.log(`[server] QuizMaster API listening on :${env.PORT} (${env.NODE_ENV})`));
  const sweeper = startSweeper();

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    clearInterval(sweeper);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

main().catch((err) => {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});
