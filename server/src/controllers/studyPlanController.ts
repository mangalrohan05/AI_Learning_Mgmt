import { Request, Response, NextFunction } from 'express';
import { studyPlanService } from '../services/studyPlanService';

export class StudyPlanController {
  public async createOrReplace(req: Request, res: Response, next: NextFunction) {
    try {
      const plan = await studyPlanService.createOrReplaceStudyPlan(
        req.params.id as string,
        req.user!.id,
        req.body
      );
      res.status(201).json(plan);
    } catch (error) {
      next(error);
    }
  }

  public async getPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const plan = await studyPlanService.getStudyPlan(
        req.params.id as string,
        req.user!.id
      );
      res.json(plan);
    } catch (error) {
      next(error);
    }
  }
}

export const studyPlanController = new StudyPlanController();
