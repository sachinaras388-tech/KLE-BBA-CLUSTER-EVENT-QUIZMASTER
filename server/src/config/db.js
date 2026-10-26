const mongoose = require('mongoose');
const dns = require('dns');
const env = require('./env');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

mongoose.set('strictQuery', true);

async function connectDB() {
  mongoose.connection.on('error', (err) => console.error('[mongo] error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('[mongo] disconnected'));
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
    autoIndex: !env.isProd || process.env.AUTO_INDEX === 'true',
  });
  console.log('[mongo] connected');
}

module.exports = connectDB;
