import fs from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { evaluateAssignmentText, AssignmentFeedback } from '../lib/ai';
import { extractPdfText } from './processingService';
import { env } from '../config/env';

export interface EvaluateAssignmentInput {
  title?: string;
  text?: string;
  file?: Express.Multer.File;
}

export class AssignmentService {
  /**
   * Evaluates an assignment submission (either raw text or uploaded document),
   * grades out of 10 with actionable feedback, and persists to the database.
   */
  public async evaluateAssignment(
    courseId: string,
    userId: string,
    input: EvaluateAssignmentInput
  ) {
    try {
      // 1. Verify course and membership
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          enrollments: { where: { userId } },
          materials: {
            where: { status: 'READY' },
            select: { name: true, summary: true },
            take: 5,
          },
        },
      });

      if (!course) {
        throw new AppError(404, 'Course not found');
      }

      const isOwner = course.ownerId === userId;
      const isEnrolled = course.enrollments.length > 0;
      if (!isOwner && !isEnrolled) {
        throw new AppError(
          403,
          'Access denied: Must be enrolled or course owner to submit assignments'
        );
      }

      // 2. Extract submission text
      let submissionText = '';
      let submissionTitle = input.title?.trim() || 'Untitled Assignment';

      if (input.file) {
        const docLimit = env.MAX_FILE_SIZE_MB * 1024 * 1024;
        if (input.file.size > docLimit) {
          throw new AppError(400, `Document exceeds the ${env.MAX_FILE_SIZE_MB}MB size limit.`);
        }

        submissionTitle = input.title?.trim() || input.file.originalname;
        const ext = path.extname(input.file.originalname).toLowerCase();

        // Read from buffer (memoryStorage) or disk path (diskStorage)
        const buffer =
          input.file.buffer ||
          (input.file.path ? await fs.readFile(input.file.path) : null);

        if (!buffer) {
          throw new AppError(400, 'Uploaded assignment file could not be read');
        }

        if (ext === '.pdf' || input.file.mimetype === 'application/pdf') {
          submissionText = await extractPdfText(buffer);
        } else if (
          ext === '.docx' ||
          ext === '.doc' ||
          input.file.mimetype ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          input.file.mimetype === 'application/msword'
        ) {
          const docxResult = await mammoth.extractRawText({ buffer });
          submissionText = docxResult.value || '';
        } else if (ext === '.txt' || input.file.mimetype.startsWith('text/')) {
          submissionText = buffer.toString('utf-8');
        } else {
          throw new AppError(400, 'Unsupported file type. Allowed: PDF, DOCX, TXT');
        }
      } else if (input.text) {
        submissionText = input.text.trim();
      } else {
        throw new AppError(400, 'Please provide assignment text or upload a document');
      }

      const cleanedText = submissionText.replace(/\x00/g, '').trim();
      if (!cleanedText) {
        throw new AppError(400, 'Assignment content is empty or contains no readable text');
      }

      // 3. Assemble course context
      const materialSummaries = course.materials
        .map((m) => `${m.name}: ${m.summary || ''}`)
        .join('\n');
      const courseContext = `Course: ${course.title}\nDescription: ${course.description || ''}\nKey Topics:\n${materialSummaries}`;

      // 4. Run AI Evaluation via Google Gemini
      const feedback: AssignmentFeedback = await evaluateAssignmentText(
        cleanedText,
        courseContext
      );

      // 5. Persist to Assignment table
      const assignment = await prisma.assignment.create({
        data: {
          courseId,
          studentId: userId,
          title: submissionTitle,
          content: cleanedText.slice(0, 10000),
          score: feedback.score,
          aiFeedback: JSON.stringify(feedback),
        },
      });

      return {
        id: assignment.id,
        courseId: assignment.courseId,
        studentId: assignment.studentId,
        title: assignment.title,
        content: assignment.content,
        score: assignment.score,
        feedback,
        createdAt: assignment.createdAt,
      };
    } finally {
      if (input.file?.path) {
        await fs.unlink(input.file.path).catch(() => {});
      }
    }
  }

  /**
   * List past assignment evaluations for a user in a course
   */
  public async listAssignments(courseId: string, userId: string) {
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
      throw new AppError(
        403,
        'Access denied: Must be enrolled or course owner to view assignments'
      );
    }

    const assignments = await prisma.assignment.findMany({
      where: {
        courseId,
        studentId: userId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return assignments.map((a) => {
      let feedback: AssignmentFeedback | null = null;
      if (a.aiFeedback) {
        try {
          feedback = JSON.parse(a.aiFeedback);
        } catch {
          // fallback
        }
      }

      return {
        id: a.id,
        courseId: a.courseId,
        studentId: a.studentId,
        title: a.title,
        content: a.content,
        score: a.score,
        feedback,
        createdAt: a.createdAt,
      };
    });
  }

  /**
   * Deletes an evaluated assignment submission (submitter or course owner only)
   */
  public async deleteAssignment(courseId: string, assignmentId: string, userId: string) {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        course: { select: { ownerId: true } },
      },
    });

    if (!assignment || assignment.courseId !== courseId) {
      throw new AppError(404, 'Assignment submission not found');
    }

    if (assignment.studentId !== userId && assignment.course.ownerId !== userId) {
      throw new AppError(403, 'Access denied: Cannot delete another student assignment');
    }

    await prisma.assignment.delete({ where: { id: assignmentId } });
    return { success: true, message: 'Assignment deleted' };
  }
}

export const assignmentService = new AssignmentService();
