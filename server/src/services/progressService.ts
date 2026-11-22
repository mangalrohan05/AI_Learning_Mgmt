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
          select: { id: true, title: true },
        }),
        prisma.enrollment.findMany({
          where: { userId },
          select: { course: { select: { id: true, title: true } } },
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
    const allCoursesMap = new Map<string, string>();
    ownedCourses.forEach((c) => allCoursesMap.set(c.id, c.title));
    enrollments.forEach((e) => allCoursesMap.set(e.course.id, e.course.title));

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
      .map((att, idx) => ({
        id: att.id,
        name: `Quiz ${idx + 1}`,
        quizTitle: att.quiz.title,
        courseTitle: att.quiz.course.title,
        score: att.score ?? 0,
        date: att.createdAt.toISOString().slice(0, 10),
      }));

    // 4. Per-course completion calculation:
    // quizzes attempted at least once / quizzes available in that course
    const courseCompletionList = await Promise.all(
      Array.from(allCoursesMap.entries()).map(async ([cId, cTitle]) => {
        const totalQuizzes = await prisma.quiz.count({
          where: { courseId: cId },
        });

        const attemptedDistinct = await prisma.quizAttempt.findMany({
          where: {
            studentId: userId,
            quiz: { courseId: cId },
          },
          select: { quizId: true },
          distinct: ['quizId'],
        });

        const completedQuizzes = attemptedDistinct.length;
        const completionRate =
          totalQuizzes === 0
            ? 0
            : Math.min(Math.round((completedQuizzes / totalQuizzes) * 100), 100);

        return {
          courseId: cId,
          courseTitle: cTitle,
          totalQuizzes,
          completedQuizzes,
          completionPercentage: completionRate,
        };
      })
    );

    return {
      counts: {
        courses: allCoursesMap.size,
        materialsUploaded,
        quizzesAttempted,
        assignmentsEvaluated,
      },
      averageQuizScore,
      recentScores,
      courseProgress: courseCompletionList,
    };
  }
}

export const progressService = new ProgressService();
