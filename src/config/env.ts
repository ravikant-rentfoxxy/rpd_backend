import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_NAME: z.string().default('rpd-api'),
  APP_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('90d'),
  JWT_REFRESH_TTL: z.string().default('90d'),
  OTP_DEV_CODE: z.string().regex(/^\d{6}$/).default('123456'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_SECONDS: z.coerce.number().int().positive().default(30),
  CORS_ORIGINS: z.string().default('http://localhost:4000'),
  NEARBY_DEFAULT_RADIUS_KM: z.coerce.number().positive().default(10),
  NEARBY_MAX_RADIUS_KM: z.coerce.number().positive().default(25),
  NEARBY_LIMIT: z.coerce.number().int().positive().default(20),
  S3_ENDPOINT: z.string().url().default('http://127.0.0.1:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(3).default('rpdminio'),
  S3_SECRET_KEY: z.string().min(8).default('rpd_minio_password'),
  S3_BUCKET: z.string().min(3).default('rpd-temp'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
