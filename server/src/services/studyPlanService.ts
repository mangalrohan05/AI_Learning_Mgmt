import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { generateStudyPlan, QuizQuestion } from '../lib/ai';

export interface CreateStudyPlanInput {
  hoursPerWeek: number;
  examDate?: string;
  goal?: string;
}

export class StudyPlanService {
  /**
   * Generates or replaces a personalized study plan for a student in a course
   */
  public async createOrReplaceStudyPlan(
    courseId: string,
    userId: string,
    input: CreateStudyPlanInput
  ) {
    // 1. Verify course and membership
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        enrollments: { where: { userId } },
        materials: {
          select: { id: true, name: true, summary: true, status: true },
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
        'Access denied: Must be enrolled or course owner to create a study plan'
      );
    }

    // 2. Collect material topics from summaries and names
    const materialTopics = course.materials
      .filter((m) => m.status === 'READY')
      .map((m) => {
        const cleanName = m.name.replace(/\.[^/.]+$/, '');
        return m.summary ? `${cleanName}: ${m.summary.slice(0, 100)}...` : cleanName;
      });

    // 3. Collect weak topics from user's past quiz attempts in this course
    const attempts = await prisma.quizAttempt.findMany({
      where: {
        studentId: userId,
        quiz: { courseId },
      },
      include: {
        quiz: { select: { questions: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const weakTopics: string[] = [];
    for (const att of attempts) {
      const questions = (att.quiz.questions as unknown as QuizQuestion[]) || [];
      const answers = (att.answers as number[]) || [];
      questions.forEach((q, i) => {
        if (answers[i] !== undefined && answers[i] !== q.correctAnswer) {
          weakTopics.push(q.question);
        }
      });
    }

    // Limit hoursPerWeek bounds
    const hoursPerWeek = Math.min(Math.max(input.hoursPerWeek || 5, 1), 60);

    // 4. Generate structured plan via Google Gemini
    const planData = await generateStudyPlan(
      materialTopics,
      weakTopics.slice(0, 5),
      {
        hoursPerWeek,
        examDate: input.examDate?.trim() || undefined,
        goal: input.goal?.trim() || undefined,
      }
    );

    // 5. Store / Upsert as StudyPlan (one per user per course)
    const studyPlan = await prisma.studyPlan.upsert({
      where: {
        studentId_courseId: {
          studentId: userId,
          courseId,
        },
      },
      update: {
        content: planData as any,
      },
      create: {
        studentId: userId,
        courseId,
        content: planData as any,
      },
    });

    return {
      id: studyPlan.id,
      courseId: studyPlan.courseId,
      studentId: studyPlan.studentId,
      plan: planData,
      updatedAt: studyPlan.updatedAt,
    };
  }

  /**
   * Retrieves the current study plan for a student in a course
   */
  public async getStudyPlan(courseId: string, userId: string) {
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
        'Access denied: Must be enrolled or course owner to view the study plan'
      );
    }

    const studyPlan = await prisma.studyPlan.findUnique({
      where: {
        studentId_courseId: {
          studentId: userId,
          courseId,
        },
      },
    });

    if (!studyPlan) {
      return null;
    }

    return {
      id: studyPlan.id,
      courseId: studyPlan.courseId,
      studentId: studyPlan.studentId,
      plan: studyPlan.content,
      updatedAt: studyPlan.updatedAt,
    };
  }
}

export const studyPlanService = new StudyPlanService();
