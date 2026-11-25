import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { MaterialType } from '@prisma/client';
import { AppError } from './errorHandler';
import { env } from '../config/env';

// Allowed MIME types mapped to MaterialType
export const MIME_TYPE_MAP: Record<string, MaterialType> = {
  'application/pdf': MaterialType.PDF,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': MaterialType.DOCX,
  'application/msword': MaterialType.DOCX,
  'text/plain': MaterialType.TXT,
  'audio/mpeg': MaterialType.AUDIO,
  'audio/mp3': MaterialType.AUDIO,
  'audio/wav': MaterialType.AUDIO,
  'audio/x-wav': MaterialType.AUDIO,
  'audio/wave': MaterialType.AUDIO,
  'audio/m4a': MaterialType.AUDIO,
  'audio/x-m4a': MaterialType.AUDIO,
  'audio/mp4': MaterialType.AUDIO,
  'audio/ogg': MaterialType.AUDIO,
  'audio/webm': MaterialType.AUDIO,
  'audio/aac': MaterialType.AUDIO,
  'audio/flac': MaterialType.AUDIO,
};

// Allowed file extensions mapped to MaterialType
export const EXTENSION_MAP: Record<string, MaterialType> = {
  '.pdf': MaterialType.PDF,
  '.docx': MaterialType.DOCX,
  '.doc': MaterialType.DOCX,
  '.txt': MaterialType.TXT,
  '.mp3': MaterialType.AUDIO,
  '.wav': MaterialType.AUDIO,
  '.m4a': MaterialType.AUDIO,
  '.ogg': MaterialType.AUDIO,
  '.webm': MaterialType.AUDIO,
  '.aac': MaterialType.AUDIO,
  '.flac': MaterialType.AUDIO,
};

// Ensure temporary uploads directory exists
const tempUploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR, 'temp');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `upload_${unique}${ext}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  const extType = EXTENSION_MAP[ext];
  const mimeTypeMatch = MIME_TYPE_MAP[mimeType];

  if (!extType || !mimeTypeMatch || extType !== mimeTypeMatch) {
    return cb(
      new AppError(
        400,
        `Invalid file type (${ext || 'unknown'}, ${mimeType}). Only PDF, DOCX, TXT, and Audio files are allowed.`
      )
    );
  }

  cb(null, true);
};

// Allow up to the larger of document / audio caps; validateFileSize enforces per-type limits
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Math.max(env.MAX_FILE_SIZE_MB, env.MAX_AUDIO_FILE_SIZE_MB) * 1024 * 1024,
  },
});

/**
 * Validates file size specifically based on determined material type
 */
export const validateFileSize = (file: Express.Multer.File, type: MaterialType) => {
  const docLimit = env.MAX_FILE_SIZE_MB * 1024 * 1024;
  const audioLimit = env.MAX_AUDIO_FILE_SIZE_MB * 1024 * 1024;

  if (type === MaterialType.AUDIO) {
    if (file.size > audioLimit) {
      throw new AppError(
        400,
        `Audio file exceeds the ${env.MAX_AUDIO_FILE_SIZE_MB}MB size limit.`
      );
    }
  } else {
    if (file.size > docLimit) {
      throw new AppError(
        400,
        `Document exceeds the ${env.MAX_FILE_SIZE_MB}MB size limit.`
      );
    }
  }
};
