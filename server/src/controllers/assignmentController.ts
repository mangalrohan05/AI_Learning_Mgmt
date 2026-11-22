import { Request, Response, NextFunction } from 'express';
import { assignmentService } from '../services/assignmentService';

export class AssignmentController {
  public async evaluate(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await assignmentService.evaluateAssignment(
        req.params.id as string,
        req.user!.id,
        {
          title: req.body.title,
          text: req.body.text,
          file: req.file,
        }
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async list(req: Request, res: Response, next: NextFunction) {
    try {
      const assignments = await assignmentService.listAssignments(
        req.params.id as string,
        req.user!.id
      );
      res.json(assignments);
    } catch (error) {
      next(error);
    }
  }
}

export const assignmentController = new AssignmentController();
