import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export class CourseService {
  /**
   * List courses the user owns or is enrolled in
   */
  public async getUserCourses(userId: string) {
    const courses = await prisma.course.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { enrollments: { some: { userId } } },
        ],
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { materials: true, enrollments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return courses.map((c) => ({
      ...c,
      isOwner: c.ownerId === userId,
    }));
  }

  /**
   * List courses the user neither owns nor is enrolled in (Explore)
   */
  public async getExploreCourses(userId: string) {
    return prisma.course.findMany({
      where: {
        AND: [
          { ownerId: { not: userId } },
          { enrollments: { none: { userId } } },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        owner: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a new course where creator is the owner
   */
  public async createCourse(userId: string, data: { title: string; description?: string }) {
    return prisma.course.create({
      data: {
        title: data.title,
        description: data.description,
        ownerId: userId,
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  /**
   * Get single course details with owner or enrolled permission check
   */
  public async getCourseById(courseId: string, userId: string) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        enrollments: {
          select: { userId: true, enrolledAt: true },
        },
        materials: {
          include: {
            uploader: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { enrollments: true, materials: true },
        },
      },
    });

    if (!course) {
      throw new AppError(404, 'Course not found');
    }

    const isOwner = course.ownerId === userId;
    const isEnrolled = course.enrollments.some((e) => e.userId === userId);

    if (!isOwner && !isEnrolled) {
      throw new AppError(403, 'Access denied: You must be enrolled or the course owner');
    }

    return {
      ...course,
      isOwner,
    };
  }

  /**
   * Update course (Owner only)
   */
  public async updateCourse(
    courseId: string,
    userId: string,
    data: { title?: string; description?: string }
  ) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new AppError(404, 'Course not found');
    }

    if (course.ownerId !== userId) {
      throw new AppError(403, 'Access denied: Only the course owner can modify this course');
    }

    return prisma.course.update({
      where: { id: courseId },
      data,
    });
  }

  /**
   * Delete course (Owner only)
   */
  public async deleteCourse(courseId: string, userId: string) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new AppError(404, 'Course not found');
    }

    if (course.ownerId !== userId) {
      throw new AppError(403, 'Access denied: Only the course owner can delete this course');
    }

    await prisma.course.delete({
      where: { id: courseId },
    });

    return { success: true, message: 'Course deleted successfully' };
  }

  /**
   * Enroll in course (non-owner only, prevent duplicates)
   */
  public async enrollInCourse(courseId: string, userId: string) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        enrollments: {
          where: { userId },
        },
      },
    });

    if (!course) {
      throw new AppError(404, 'Course not found');
    }

    if (course.ownerId === userId) {
      throw new AppError(400, 'Course owner cannot enroll in their own course');
    }

    if (course.enrollments.length > 0) {
      throw new AppError(400, 'Already enrolled in this course');
    }

    return prisma.enrollment.create({
      data: {
        courseId,
        userId,
      },
    });
  }

  /**
   * Unenroll from a course (enrolled non-owners only)
   */
  public async unenrollFromCourse(courseId: string, userId: string) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, ownerId: true },
    });

    if (!course) {
      throw new AppError(404, 'Course not found');
    }

    if (course.ownerId === userId) {
      throw new AppError(400, 'Course owner cannot unenroll from their own course');
    }

    const deleted = await prisma.enrollment.deleteMany({
      where: { courseId, userId },
    });

    if (deleted.count === 0) {
      throw new AppError(400, 'You are not enrolled in this course');
    }

    return { success: true, message: 'Unenrolled from course' };
  }
}

export const courseService = new CourseService();
