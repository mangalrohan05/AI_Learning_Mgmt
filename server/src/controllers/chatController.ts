import { Request, Response, NextFunction } from 'express';
import { chatService } from '../services/chatService';

export class ChatController {
  public async chat(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await chatService.chatCourse(
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

export const chatController = new ChatController();
