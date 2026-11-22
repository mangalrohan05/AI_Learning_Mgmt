import { Request, Response, NextFunction } from 'express';
import { progressService } from '../services/progressService';

export class ProgressController {
  public async getProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const progress = await progressService.getUserProgress(req.user!.id);
      res.json(progress);
    } catch (error) {
      next(error);
    }
  }
}

export const progressController = new ProgressController();
