import { Request, Response, NextFunction } from 'express';
import { tutorService } from '../services/tutorService';

export class TutorController {
  public async tutor(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await tutorService.tutorCourse(
        req.params.id as string,
        req.user!.id,
        req.body
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const tutorController = new TutorController();
