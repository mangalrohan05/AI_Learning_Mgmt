import { Request, Response, NextFunction } from 'express';
import { courseService } from '../services/courseService';

export class CourseController {
  public async getCourses(req: Request, res: Response, next: NextFunction) {
    try {
      const courses = await courseService.getUserCourses(req.user!.id);
      res.json(courses);
    } catch (error) {
      next(error);
    }
  }

  public async getExploreCourses(req: Request, res: Response, next: NextFunction) {
    try {
      const courses = await courseService.getExploreCourses(req.user!.id);
      res.json(courses);
    } catch (error) {
      next(error);
    }
  }

  public async createCourse(req: Request, res: Response, next: NextFunction) {
    try {
      const course = await courseService.createCourse(req.user!.id, req.body);
      res.status(201).json(course);
    } catch (error) {
      next(error);
    }
  }

  public async getCourseById(req: Request, res: Response, next: NextFunction) {
    try {
      const course = await courseService.getCourseById(req.params.id as string, req.user!.id);
      res.json(course);
    } catch (error) {
      next(error);
    }
  }

  public async updateCourse(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await courseService.updateCourse(
        req.params.id as string,
        req.user!.id,
        req.body
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  }

  public async deleteCourse(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await courseService.deleteCourse(
        req.params.id as string,
        req.user!.id
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  public async enrollInCourse(req: Request, res: Response, next: NextFunction) {
    try {
      const enrollment = await courseService.enrollInCourse(
        req.params.id as string,
        req.user!.id
      );
      res.status(201).json(enrollment);
    } catch (error) {
      next(error);
    }
  }

  public async unenrollFromCourse(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await courseService.unenrollFromCourse(
        req.params.id as string,
        req.user!.id
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const courseController = new CourseController();
