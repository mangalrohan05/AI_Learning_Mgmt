import { Request, Response, NextFunction } from 'express';
import { quizService } from '../services/quizService';

export class QuizController {
  public async generateQuiz(req: Request, res: Response, next: NextFunction) {
    try {
      const quiz = await quizService.generateQuiz(
        req.params.id as string,
        req.user!.id,
        req.body
      );
      res.status(201).json(quiz);
    } catch (error) {
      next(error);
    }
  }

  public async listQuizzes(req: Request, res: Response, next: NextFunction) {
    try {
      const quizzes = await quizService.listQuizzes(
        req.params.id as string,
        req.user!.id
      );
      res.json(quizzes);
    } catch (error) {
      next(error);
    }
  }

  public async getQuizForTaking(req: Request, res: Response, next: NextFunction) {
    try {
      const quiz = await quizService.getQuizForTaking(
        req.params.id as string,
        req.user!.id
      );
      res.json(quiz);
    } catch (error) {
      next(error);
    }
  }

  public async submitAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await quizService.submitQuizAttempt(
        req.params.id as string,
        req.user!.id,
        req.body.answers || []
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const quizController = new QuizController();
