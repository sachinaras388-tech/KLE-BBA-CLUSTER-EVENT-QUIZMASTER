require('dotenv').config({ override: true });
const { z } = require('zod');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

// Accept MONGO_URI as an alias for MONGODB_URI
if (!process.env.MONGODB_URI && process.env.MONGO_URI) process.env.MONGODB_URI = process.env.MONGO_URI;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(10, 'MONGODB_URI is required'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine((v) => !/replace|change.?me|secret_here|your.?secret/i.test(v), 'JWT_SECRET looks like a placeholder'),
  JWT_EXPIRES_HOURS: z.coerce.number().min(0.25).max(72).default(8),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  SUBMIT_GRACE_SECONDS: z.coerce.number().min(0).max(30).default(5),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOCKOUT_MINUTES: z.coerce.number().min(1).max(240).default(15),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('\n[config] Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  console.error('\nSee server/.env.example\n');
  process.exit(1);
}

const env = parsed.data;
env.isProd = env.NODE_ENV === 'production';
env.clientOrigins = env.CLIENT_URL.split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

module.exports = env;
