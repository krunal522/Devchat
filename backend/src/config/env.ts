import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.preprocess((val) => (val ? Number(val) : 3001), z.number().default(3001)),
  CLIENT_URL: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().default('file:./dev.db'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().default('devchat_default_super_secret_access_jwt_key_2026'),
  JWT_REFRESH_SECRET: z.string().default('devchat_default_super_secret_refresh_jwt_key_2026'),
  JWT_ACCESS_EXPIRY: z.string().default('7d'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),

  RATE_LIMIT_WINDOW_MS: z.preprocess((val) => (val ? Number(val) : 900000), z.number().default(900000)),
  RATE_LIMIT_MAX_REQUESTS: z.preprocess((val) => (val ? Number(val) : 10000), z.number().default(10000)),

  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_API_KEY_2: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

export const env = parsed.success
  ? parsed.data
  : {
      NODE_ENV: (process.env.NODE_ENV as any) || 'production',
      PORT: Number(process.env.PORT) || 3001,
      CLIENT_URL: process.env.CLIENT_URL || '*',
      DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'devchat_default_super_secret_access_jwt_key_2026',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'devchat_default_super_secret_refresh_jwt_key_2026',
      JWT_ACCESS_EXPIRY: '7d',
      JWT_REFRESH_EXPIRY: '30d',
      RATE_LIMIT_WINDOW_MS: 900000,
      RATE_LIMIT_MAX_REQUESTS: 10000,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      GEMINI_API_KEY_2: process.env.GEMINI_API_KEY_2 || '',
    };

export type Env = typeof env;
