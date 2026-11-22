import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { env } from '../../config/env';

export interface StorageFile {
  originalName: string;
  storagePath: string;
  mimeType: string;
  size: number;
}

export class LocalStorageProvider {
  private uploadDir: string;

  constructor(uploadDir?: string) {
    this.uploadDir = path.resolve(process.cwd(), uploadDir || env.UPLOAD_DIR);
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  public async save(file: Express.Multer.File): Promise<StorageFile> {
    await this.ensureDir();

    // Sanitize extension and base name
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 50);

    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const storedFileName = `${Date.now()}_${randomSuffix}_${baseName}${ext}`;
    const destinationPath = path.join(this.uploadDir, storedFileName);

    // If multer stored it in temp disk, move/rename it; otherwise write from buffer
    if (file.path) {
      await fs.rename(file.path, destinationPath);
    } else if (file.buffer) {
      await fs.writeFile(destinationPath, file.buffer);
    } else {
      throw new Error('Multer file contains neither path nor buffer');
    }

    // Relative path stored in database
    const relativeStoragePath = path.join(env.UPLOAD_DIR, storedFileName).replace(/\\/g, '/');

    return {
      originalName: file.originalname,
      storagePath: relativeStoragePath,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  public async delete(storagePath: string): Promise<void> {
    try {
      const fileName = path.basename(storagePath);
      const fullPath = path.join(this.uploadDir, fileName);
      await fs.unlink(fullPath);
    } catch (err: any) {
      // Must not crash if file is missing (e.g. seed data metadata rows)
      if (err.code !== 'ENOENT') {
        console.warn(`Warning: Failed to delete storage file at ${storagePath}:`, err.message);
      }
    }
  }

  public async getUrl(storagePath: string): Promise<string> {
    const fileName = path.basename(storagePath);
    return `/uploads/${fileName}`;
  }

  public getAbsolutePath(storagePath: string): string {
    const fileName = path.basename(storagePath);
    return path.join(this.uploadDir, fileName);
  }

  public async read(storagePath: string): Promise<Buffer> {
    const fullPath = this.getAbsolutePath(storagePath);
    return await fs.readFile(fullPath);
  }
}

export const storageProvider = new LocalStorageProvider();
