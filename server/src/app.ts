import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import authRoutes from './routes/auth';
import courseRoutes from './routes/courses';
import materialRoutes from './routes/materials';
import quizRoutes from './routes/quizzes';
import progressRoutes from './routes/progress';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = env.CLIENT_URL.split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/+$/, '');
      if (allowedOrigins.includes(normalized)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

// ── Body parsers ──────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health Check ──────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/progress', progressRoutes);

// ── Central Error Handler ─────────────────────────────────────
app.use(errorHandler);

export { app };
