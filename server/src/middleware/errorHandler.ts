import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { env } from '../config/env';

export class AppError extends Error {
  public statusCode: number;
  public details?: any;

  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // 1. Known AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // 2. Zod Validation Error
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.flatten().fieldErrors,
    });
  }

  // 3. Multer File Upload Error
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File exceeds upload limit (${env.MAX_FILE_SIZE_MB}MB documents, ${env.MAX_AUDIO_FILE_SIZE_MB}MB audio).`
        : `Upload error: ${err.message}`;
    return res.status(400).json({
      error: message,
      details: { code: err.code, field: err.field },
    });
  }

  // 4. Unexpected / Internal Server Error
  const isDev = env.NODE_ENV === 'development';
  console.error('Unhandled Server Error:', err);

  return res.status(500).json({
    error: 'Internal server error',
    ...(isDev ? { message: err.message, stack: err.stack } : {}),
  });
};
