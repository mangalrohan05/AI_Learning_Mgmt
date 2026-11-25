import { z } from 'zod';
import dotenv from 'dotenv';

// Reads server/.env when the process is started
dotenv.config();

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(8000),
  // Pooled connection — used by the Express runtime
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Direct (non-pooled) connection — used by Prisma CLI for migrations
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required'),
  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
  CLIENT_URL: z
    .string()
    .default('http://localhost:3000')
    .refine(
      (val) =>
        val
          .split(',')
          .map((u) => u.trim())
          .filter(Boolean)
          .every((u) => z.string().url().safeParse(u).success),
      'CLIENT_URL must be a valid URL or comma-separated list of URLs'
    ),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(50),
  MAX_AUDIO_FILE_SIZE_MB: z.coerce.number().default(25),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error('❌  Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
