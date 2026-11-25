import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { generateQuizQuestions, QuizQuestion } from '../lib/ai';

export interface GenerateQuizInput {
  materialId?: string;
  numQuestions?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  topic?: string;
}

/**
 * Evenly samples up to `maxCount` items across an ordered array so early, middle,
 * and late sections of a document or course are represented.
 */
function sampleEvenly<T>(items: T[], maxCount: number): T[] {
  if (items.length <= maxCount) return items;
  const sampled: T[] = [];
  const step = (items.length - 1) / (maxCount - 1);
  for (let i = 0; i < maxCount; i++) {
    sampled.push(items[Math.round(i * step)]!);
  }
  return sampled;
}

export class QuizService {
  /**
   * Generates multiple-choice questions (1-25) from course materials via Google Gemini
   */
  public async generateQuiz(
    courseId: string,
    userId: string,
    input: GenerateQuizInput
  ) {
    // 1. Verify course and membership
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        enrollments: { where: { userId } },
        materials: {
          where: { status: 'READY' },
          select: { id: true, name: true },
        },
      },
    });

    if (!course) {
      throw new AppError(404, 'Course not found');
    }

    const isOwner = course.ownerId === userId;
    const isEnrolled = course.enrollments.length > 0;
    if (!isOwner && !isEnrolled) {
      throw new AppError(403, 'Access denied: Must be enrolled or course owner to generate quizzes');
    }

    // 2. Validate materialId if provided
    let materialName = course.title;
    if (input.materialId) {
      const targetMaterial = await prisma.material.findUnique({
        where: { id: input.materialId },
        select: { id: true, courseId: true, name: true, status: true },
      });

      if (!targetMaterial || targetMaterial.courseId !== courseId) {
        throw new AppError(404, 'Specified material not found in this course');
      }

      if (targetMaterial.status !== 'READY') {
        throw new AppError(400, 'Selected material is not yet processed (status must be READY)');
      }

      materialName = targetMaterial.name;
    }

    // 3. Fetch chunks ordered across the full material/course and sample evenly
    const whereClause: any = {
      material: {
        courseId,
        status: 'READY',
      },
    };
    if (input.materialId) {
      whereClause.materialId = input.materialId;
    }

    const allChunks = await prisma.documentChunk.findMany({
      where: whereClause,
      orderBy: [{ materialId: 'asc' }, { chunkIndex: 'asc' }],
      select: { content: true },
    });

    if (allChunks.length === 0) {
      throw new AppError(
        400,
        'No processed materials available in this course to generate quiz questions'
      );
    }

    const sampledChunks = sampleEvenly(allChunks, 35);
    const numQuestions = Math.min(Math.max(input.numQuestions || 5, 1), 25);
    const contextTexts = sampledChunks.map((c) => c.content);

    // 4. Generate structured questions via Gemini
    const questions = await generateQuizQuestions(contextTexts, numQuestions, {
      difficulty: input.difficulty,
      topic: input.topic,
    });

    if (!questions || questions.length === 0) {
      throw new AppError(
        502,
        'AI could not generate questions from these materials. Please try again.'
      );
    }

    // 5. Store Quiz in DB
    const baseName = materialName.replace(/\.[^/.]+$/, '');
    const quizTitle = input.topic?.trim()
      ? `${baseName}: ${input.topic.trim()}`
      : `${baseName} Practice Quiz`;

    const quiz = await prisma.quiz.create({
      data: {
        courseId,
        title: quizTitle.slice(0, 120),
        questions: questions as any,
      },
      include: {
        course: { select: { id: true, title: true } },
      },
    });

    return {
      id: quiz.id,
      title: quiz.title,
      courseId: quiz.courseId,
      totalQuestions: questions.length,
      createdAt: quiz.createdAt,
    };
  }

  /**
   * List all quizzes for a course with current user attempt history
   */
  public async listQuizzes(courseId: string, userId: string) {
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
      throw new AppError(403, 'Access denied: Must be enrolled or course owner to view quizzes');
    }

    const quizzes = await prisma.quiz.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
      include: {
        attempts: {
          where: { studentId: userId },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, score: true, completedAt: true, createdAt: true },
        },
      },
    });

    return quizzes.map((q) => {
      const questions = (q.questions as any[]) || [];
      return {
        id: q.id,
        courseId: q.courseId,
        title: q.title,
        questionCount: questions.length,
        createdAt: q.createdAt,
        latestAttempt: q.attempts[0] || null,
      };
    });
  }

  /**
   * Get a quiz by ID for taking: strictly strips correct answers and explanations
   */
  public async getQuizForTaking(quizId: string, userId: string) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        course: {
          include: {
            enrollments: { where: { userId } },
          },
        },
      },
    });

    if (!quiz) {
      throw new AppError(404, 'Quiz not found');
    }

    const isOwner = quiz.course.ownerId === userId;
    const isEnrolled = quiz.course.enrollments.length > 0;
    if (!isOwner && !isEnrolled) {
      throw new AppError(403, 'Access denied: Must be enrolled or course owner to take this quiz');
    }

    const rawQuestions = (quiz.questions as unknown as QuizQuestion[]) || [];

    // Strip correctAnswer and explanation to prevent student inspection
    const sanitizedQuestions = rawQuestions.map((q, index) => ({
      index,
      question: q.question,
      options: q.options,
    }));

    return {
      id: quiz.id,
      courseId: quiz.courseId,
      courseTitle: quiz.course.title,
      title: quiz.title,
      questions: sanitizedQuestions,
      totalQuestions: sanitizedQuestions.length,
    };
  }

  /**
   * Returns the full graded review breakdown for the user's latest completed attempt
   */
  public async getLatestAttemptReview(quizId: string, userId: string) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        course: {
          include: {
            enrollments: { where: { userId } },
          },
        },
      },
    });

    if (!quiz) {
      throw new AppError(404, 'Quiz not found');
    }

    const isOwner = quiz.course.ownerId === userId;
    const isEnrolled = quiz.course.enrollments.length > 0;
    if (!isOwner && !isEnrolled) {
      throw new AppError(403, 'Access denied');
    }

    const latestAttempt = await prisma.quizAttempt.findFirst({
      where: { quizId, studentId: userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestAttempt) {
      throw new AppError(404, 'No attempt found for this quiz');
    }

    const questions = (quiz.questions as unknown as QuizQuestion[]) || [];
    const answers = (latestAttempt.answers as number[]) || [];

    let correctCount = 0;
    const breakdown = questions.map((q, i) => {
      const selectedAnswer = answers[i] ?? -1;
      const isCorrect = selectedAnswer !== -1 && selectedAnswer === q.correctAnswer;
      if (isCorrect) correctCount++;

      return {
        questionIndex: i,
        question: q.question,
        options: q.options,
        selectedAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
      };
    });

    return {
      attemptId: latestAttempt.id,
      quizId,
      quizTitle: quiz.title,
      score: Math.round(latestAttempt.score ?? 0),
      totalQuestions: questions.length,
      correctCount,
      results: breakdown,
      completedAt: latestAttempt.completedAt || latestAttempt.createdAt,
    };
  }

  /**
   * Submits a quiz attempt, computes score on the server, stores attempt,
   * and returns full score breakdown with correct answers and explanations.
   */
  public async submitQuizAttempt(quizId: string, userId: string, answers: number[]) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        course: {
          include: {
            enrollments: { where: { userId } },
          },
        },
      },
    });

    if (!quiz) {
      throw new AppError(404, 'Quiz not found');
    }

    const isOwner = quiz.course.ownerId === userId;
    const isEnrolled = quiz.course.enrollments.length > 0;
    if (!isOwner && !isEnrolled) {
      throw new AppError(403, 'Access denied: Must be enrolled or course owner to submit attempt');
    }

    const questions = (quiz.questions as unknown as QuizQuestion[]) || [];
    if (questions.length === 0) {
      throw new AppError(400, 'Quiz has no questions');
    }

    // Strict validation: answer count must match question count
    if (answers.length !== questions.length) {
      throw new AppError(400, 'Validation failed', {
        answers: [
          `Expected exactly ${questions.length} answers, received ${answers.length}`,
        ],
      });
    }

    // Strict validation: each answer must be -1 (unanswered) or within valid option range for that question
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!;
      const ans = answers[i];
      const optCount = q.options ? q.options.length : 0;
      if (typeof ans !== 'number' || (ans !== -1 && (ans < 0 || ans >= optCount))) {
        throw new AppError(400, 'Validation failed', {
          answers: [
            `Question ${i + 1} answer must be -1 (unanswered) or between 0 and ${optCount - 1} (received ${ans})`,
          ],
        });
      }
    }

    let correctCount = 0;
    const breakdown = questions.map((q, i) => {
      const selectedAnswer = answers[i]!;
      const isCorrect = selectedAnswer !== -1 && selectedAnswer === q.correctAnswer;
      if (isCorrect) correctCount++;

      return {
        questionIndex: i,
        question: q.question,
        options: q.options,
        selectedAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
      };
    });

    const score = Math.round((correctCount / questions.length) * 100);

    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId,
        studentId: userId,
        answers: answers as any,
        score,
        completedAt: new Date(),
      },
    });

    return {
      attemptId: attempt.id,
      quizId,
      quizTitle: quiz.title,
      score,
      totalQuestions: questions.length,
      correctCount,
      results: breakdown,
      completedAt: attempt.completedAt,
    };
  }

  /**
   * Deletes a quiz (course owner only)
   */
  public async deleteQuiz(quizId: string, userId: string) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { course: { select: { ownerId: true } } },
    });

    if (!quiz) {
      throw new AppError(404, 'Quiz not found');
    }

    if (quiz.course.ownerId !== userId) {
      throw new AppError(403, 'Access denied: Only the course owner can delete quizzes');
    }

    await prisma.quiz.delete({ where: { id: quizId } });
    return { success: true, message: 'Quiz deleted' };
  }
}

export const quizService = new QuizService();
