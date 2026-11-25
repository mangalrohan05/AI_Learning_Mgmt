import fs from 'fs/promises';
import path from 'path';
import { MaterialStatus, MaterialType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { storageProvider } from './storage/localStorageProvider';
import { EXTENSION_MAP, MIME_TYPE_MAP, validateFileSize } from '../middleware/upload';
import { summarizeText } from '../lib/ai';
import { chatCache } from '../lib/chatCache';

export class MaterialService {
  /**
   * Helper to clean up multer temporary file on disk if an error occurs
   */
  private async safeCleanupTempFile(filePath?: string) {
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch {
        // ignore cleanup error
      }
    }
  }

  /**
   * List materials for a course with access check (owner or enrolled)
   */
  public async getCourseMaterials(courseId: string, userId: string) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        enrollments: { where: { userId } },
      },
    });

    if (!course) {
      throw new AppError(404, 'Course not found');
    }

    const isOwner = course.ownerId === userId;
    const isEnrolled = course.enrollments.length > 0;

    if (!isOwner && !isEnrolled) {
      throw new AppError(403, 'Access denied: You must be enrolled or the course owner');
    }

    return prisma.material.findMany({
      where: { courseId },
      include: {
        uploader: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get material file info for streaming download (owner or enrolled only)
   */
  public async getMaterialForDownload(materialId: string, userId: string) {
    const material = await prisma.material.findUnique({
      where: { id: materialId },
      include: {
        course: {
          include: {
            enrollments: { where: { userId } },
          },
        },
      },
    });

    if (!material) {
      throw new AppError(404, 'Material not found');
    }

    const isOwner = material.course.ownerId === userId;
    const isEnrolled = material.course.enrollments.length > 0;

    if (!isOwner && !isEnrolled) {
      throw new AppError(
        403,
        'Access denied: You must be enrolled or the course owner to download this material'
      );
    }

    const fullPath = path.resolve(process.cwd(), material.storagePath);
    try {
      await fs.access(fullPath);
      return {
        fullPath,
        buffer: undefined as Buffer | undefined,
        fileName: material.name,
        mimeType: material.mimeType,
        size: material.size,
      };
    } catch {
      // Fallback for manual TXT notes or transcripts if ephemeral disk storage was reset
      if (material.transcript) {
        const buffer = Buffer.from(material.transcript, 'utf-8');
        return {
          fullPath: '',
          buffer,
          fileName: material.type === 'AUDIO' ? `${material.name}.transcript.txt` : material.name,
          mimeType: 'text/plain; charset=utf-8',
          size: buffer.length,
        };
      }
      throw new AppError(404, 'Material file not found on storage');
    }
  }

  /**
   * Upload and register a new course material
   */
  public async uploadMaterial(
    courseId: string,
    userId: string,
    file?: Express.Multer.File
  ) {
    if (!file) {
      throw new AppError(400, 'No file uploaded');
    }

    try {
      // 1. Verify course and membership
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          enrollments: { where: { userId } },
        },
      });

      if (!course) {
        throw new AppError(404, 'Course not found');
      }

      const isOwner = course.ownerId === userId;
      const isEnrolled = course.enrollments.length > 0;

      if (!isOwner && !isEnrolled) {
        throw new AppError(403, 'Access denied: You must be enrolled or the course owner');
      }

      // 2. Determine MaterialType
      const ext = path.extname(file.originalname).toLowerCase();
      const mimeType = file.mimetype.toLowerCase();
      const type = EXTENSION_MAP[ext] || MIME_TYPE_MAP[mimeType];

      if (!type) {
        throw new AppError(400, 'Unsupported file type');
      }

      // 3. Enforce file size limit per type
      validateFileSize(file, type);

      // 4. Save file to storage
      const storageFile = await storageProvider.save(file);

      // 5. Persist Material row; clean up storage file if DB write fails
      try {
        const material = await prisma.material.create({
          data: {
            courseId,
            uploaderId: userId,
            name: storageFile.originalName,
            type,
            status: MaterialStatus.PENDING,
            storagePath: storageFile.storagePath,
            mimeType: storageFile.mimeType,
            size: storageFile.size,
          },
          include: {
            uploader: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        // Invalidate in-memory chat cache for this course
        chatCache.clearCourse(courseId);

        return material;
      } catch (dbError) {
        // Rollback saved file if database insert fails
        await storageProvider.delete(storageFile.storagePath);
        throw dbError;
      }
    } finally {
      // Ensure temp upload file is removed if it still exists
      await this.safeCleanupTempFile(file.path);
    }
  }

  /**
   * Delete material (uploader or course owner only)
   */
  public async deleteMaterial(materialId: string, userId: string) {
    const material = await prisma.material.findUnique({
      where: { id: materialId },
      include: {
        course: {
          select: { ownerId: true },
        },
      },
    });

    if (!material) {
      throw new AppError(404, 'Material not found');
    }

    const isUploader = material.uploaderId === userId;
    const isCourseOwner = material.course.ownerId === userId;

    if (!isUploader && !isCourseOwner) {
      throw new AppError(
        403,
        'Access denied: Only the uploader or course owner can delete this material'
      );
    }

    // 1. Delete from storage (does not throw if file is missing)
    await storageProvider.delete(material.storagePath);

    // 2. Delete from database
    await prisma.material.delete({
      where: { id: materialId },
    });

    // Invalidate in-memory chat cache for this course
    chatCache.clearCourse(material.courseId);

    return { success: true, message: 'Material deleted successfully' };
  }

  /**
   * Creates a manual text/note material directly from user-entered text
   */
  public async createTextMaterial(
    courseId: string,
    userId: string,
    input: { title: string; content: string }
  ) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        enrollments: { where: { userId } },
      },
    });

    if (!course) {
      throw new AppError(404, 'Course not found');
    }

    const isOwner = course.ownerId === userId;
    const isEnrolled = course.enrollments.length > 0;
    if (!isOwner && !isEnrolled) {
      throw new AppError(403, 'Access denied: You must be enrolled or the course owner');
    }

    const cleanTitle = input.title.trim();
    const cleanContent = input.content.replace(/\x00/g, '').trim();
    const displayName = cleanTitle.toLowerCase().endsWith('.txt')
      ? cleanTitle
      : `${cleanTitle}.txt`;

    const buffer = Buffer.from(cleanContent, 'utf-8');
    const storageFile = await storageProvider.saveBuffer(buffer, displayName, 'text/plain');

    try {
      const material = await prisma.material.create({
        data: {
          courseId,
          uploaderId: userId,
          name: displayName,
          type: MaterialType.TXT,
          status: MaterialStatus.PENDING,
          storagePath: storageFile.storagePath,
          mimeType: 'text/plain',
          size: buffer.length,
          transcript: cleanContent,
        },
        include: {
          uploader: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      chatCache.clearCourse(courseId);
      return material;
    } catch (dbError) {
      await storageProvider.delete(storageFile.storagePath);
      throw dbError;
    }
  }

  /**
   * Generates or retrieves a structured study summary for a course material
   */
  public async summarizeMaterial(
    materialId: string,
    userId: string,
    courseId?: string,
    force = false
  ) {
    const material = await prisma.material.findUnique({
      where: { id: materialId },
      include: {
        course: {
          include: {
            enrollments: { where: { userId } },
          },
        },
      },
    });

    if (!material) {
      throw new AppError(404, 'Material not found');
    }

    if (courseId && material.courseId !== courseId) {
      throw new AppError(404, 'Material not found in this course');
    }

    const isOwner = material.course.ownerId === userId;
    const isEnrolled = material.course.enrollments.length > 0;

    if (!isOwner && !isEnrolled) {
      throw new AppError(
        403,
        'Access denied: You must be enrolled or the course owner to view summary'
      );
    }

    // 1. If summary already exists in database and regeneration wasn't requested, return cached
    if (!force && material.summary && material.summary.trim()) {
      return { summary: material.summary, cached: true };
    }

    // 2. Guard: Must be READY
    if (material.status !== MaterialStatus.READY) {
      throw new AppError(
        400,
        `Cannot summarize material with status "${material.status}". Material must be READY.`
      );
    }

    // 3. Fetch chunks ordered across the full material
    const chunks = await prisma.documentChunk.findMany({
      where: { materialId },
      orderBy: { chunkIndex: 'asc' },
    });

    if (chunks.length === 0) {
      throw new AppError(400, 'No extracted content found to summarize.');
    }

    // Sample evenly across the document so long PDFs aren't cut off after the opening pages
    const MAX_SUMMARY_CHARS = 45000;
    let combinedContent = chunks.map((c) => c.content).join('\n\n');
    if (combinedContent.length > MAX_SUMMARY_CHARS) {
      const targetChunkCount = Math.min(chunks.length, 32);
      const step = (chunks.length - 1) / Math.max(targetChunkCount - 1, 1);
      const sampled: string[] = [];
      for (let i = 0; i < targetChunkCount; i++) {
        sampled.push(chunks[Math.round(i * step)]!.content);
      }
      combinedContent = sampled.join('\n\n').slice(0, MAX_SUMMARY_CHARS);
    }

    // 4. Call AI summarizer via Google Gemini
    const summary = await summarizeText(combinedContent);

    // 5. Store in Material.summary
    await prisma.material.update({
      where: { id: materialId },
      data: { summary },
    });

    return { summary, cached: false };
  }
}

export const materialService = new MaterialService();
