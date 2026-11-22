import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { generateQuizQuestions, QuizQuestion } from '../lib/ai';

export interface GenerateQuizInput {
  materialId?: string;
  numQuestions?: number;
}

export class QuizService {
  /**
   * Generates multiple-choice questions from course materials via Google Gemini
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

    // 3. Fetch chunks for quiz generation
    const whereClause: any = {
      material: {
        courseId,
        status: 'READY',
      },
    };
    if (input.materialId) {
      whereClause.materialId = input.materialId;
    }

    const chunks = await prisma.documentChunk.findMany({
      where: whereClause,
      select: { content: true },
      take: 20,
    });

    if (chunks.length === 0) {
      throw new AppError(
        400,
        'No processed materials available in this course to generate quiz questions'
      );
    }

    const numQuestions = Math.min(Math.max(input.numQuestions || 5, 3), 10);
    const contextTexts = chunks.map((c) => c.content);

    // 4. Generate structured questions via Gemini
    const questions = await generateQuizQuestions(contextTexts, numQuestions);

    // 5. Store Quiz in DB
    const quizTitle = `${materialName.replace(/\.[^/.]+$/, '')} Practice Quiz`;
    const quiz = await prisma.quiz.create({
      data: {
        courseId,
        title: quizTitle,
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
}

export const quizService = new QuizService();
