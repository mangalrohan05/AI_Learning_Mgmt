import { prisma } from '../lib/prisma';

export class ProgressService {
  /**
   * Calculates comprehensive student learning analytics and progress statistics
   */
  public async getUserProgress(userId: string) {
    // 1. Fetch courses owned and enrolled
    const [ownedCourses, enrollments, materialsUploaded, quizzesAttempted, assignmentsEvaluated] =
      await Promise.all([
        prisma.course.findMany({
          where: { ownerId: userId },
          select: {
            id: true,
            title: true,
            description: true,
            _count: { select: { materials: true, quizzes: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.enrollment.findMany({
          where: { userId },
          select: {
            course: {
              select: {
                id: true,
                title: true,
                description: true,
                _count: { select: { materials: true, quizzes: true } },
              },
            },
          },
          orderBy: { enrolledAt: 'desc' },
        }),
        prisma.material.count({
          where: { uploaderId: userId },
        }),
        prisma.quizAttempt.count({
          where: { studentId: userId },
        }),
        prisma.assignment.count({
          where: { studentId: userId },
        }),
      ]);

    // Consolidate unique active courses
    const courseMetaMap = new Map<
      string,
      {
        id: string;
        title: string;
        description: string | null;
        isOwner: boolean;
        materialsCount: number;
        quizzesCount: number;
      }
    >();

    ownedCourses.forEach((c) =>
      courseMetaMap.set(c.id, {
        id: c.id,
        title: c.title,
        description: c.description,
        isOwner: true,
        materialsCount: c._count.materials,
        quizzesCount: c._count.quizzes,
      })
    );
    enrollments.forEach((e) => {
      if (!courseMetaMap.has(e.course.id)) {
        courseMetaMap.set(e.course.id, {
          id: e.course.id,
          title: e.course.title,
          description: e.course.description,
          isOwner: false,
          materialsCount: e.course._count.materials,
          quizzesCount: e.course._count.quizzes,
        });
      }
    });

    // 2. Compute average quiz score
    const avgResult = await prisma.quizAttempt.aggregate({
      where: { studentId: userId, score: { not: null } },
      _avg: { score: true },
    });
    const averageQuizScore = avgResult._avg.score
      ? Math.round(avgResult._avg.score * 10) / 10
      : 0;

    // 3. Fetch last 10 quiz scores
    const recentAttempts = await prisma.quizAttempt.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        quiz: {
          select: {
            title: true,
            course: { select: { title: true } },
          },
        },
      },
    });

    const recentScores = recentAttempts
      .slice()
      .reverse()
      .map((att) => {
        const cleanTitle = att.quiz.title.trim();
        return {
          id: att.id,
          name: cleanTitle.length > 18 ? `${cleanTitle.slice(0, 17)}…` : cleanTitle,
          quizTitle: att.quiz.title,
          courseTitle: att.quiz.course.title,
          score: att.score ?? 0,
          date: att.createdAt.toISOString().slice(0, 10),
        };
      });

    // 4. Per-course completion calculation:
    // quizzes attempted at least once / quizzes available in that course
    const courseCompletionList = await Promise.all(
      Array.from(courseMetaMap.values()).map(async (meta) => {
        const [attemptedDistinct, assignmentsCount] = await Promise.all([
          prisma.quizAttempt.findMany({
            where: {
              studentId: userId,
              quiz: { courseId: meta.id },
            },
            select: { quizId: true },
            distinct: ['quizId'],
          }),
          prisma.assignment.count({
            where: { courseId: meta.id, studentId: userId },
          }),
        ]);

        const totalQuizzes = meta.quizzesCount;
        const completedQuizzes = attemptedDistinct.length;
        const completionRate =
          totalQuizzes === 0
            ? 0
            : Math.min(Math.round((completedQuizzes / totalQuizzes) * 100), 100);

        return {
          courseId: meta.id,
          courseTitle: meta.title,
          totalQuizzes,
          completedQuizzes,
          materialsCount: meta.materialsCount,
          assignmentsCount,
          completionPercentage: completionRate,
        };
      })
    );

    return {
      counts: {
        courses: courseMetaMap.size,
        materialsUploaded,
        quizzesAttempted,
        assignmentsEvaluated,
      },
      averageQuizScore,
      recentScores,
      recentCourses: Array.from(courseMetaMap.values()),
      courseProgress: courseCompletionList,
    };
  }
}

export const progressService = new ProgressService();
