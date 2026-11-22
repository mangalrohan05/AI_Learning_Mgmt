import { Request, Response, NextFunction } from 'express';

export class AuthController {
  public async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      res.json({
        id: user.id,
        clerkId: user.clerkId,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
