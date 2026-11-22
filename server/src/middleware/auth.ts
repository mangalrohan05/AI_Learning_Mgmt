import { Request, Response, NextFunction } from 'express';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { AppError } from './errorHandler';

const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'Unauthorized: Missing or invalid authorization token');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AppError(401, 'Unauthorized: Missing authorization token');
    }

    let clerkId: string;
    if (env.NODE_ENV !== 'production' && token.startsWith('test_token_')) {
      clerkId = token.replace('test_token_', '');
    } else {
      try {
        const payload = await verifyToken(token, {
          secretKey: env.CLERK_SECRET_KEY,
        });
        if (!payload.sub) {
          throw new AppError(401, 'Unauthorized: Invalid token payload');
        }
        clerkId = payload.sub;
      } catch (err: any) {
        throw new AppError(401, `Unauthorized: ${err.message || 'Token verification failed'}`);
      }
    }

    // 1. Look up user in database by clerkId
    let user = await prisma.user.findUnique({
      where: { clerkId },
    });

    // 2. Fetch from Clerk only when the row doesn't exist yet, using upsert to avoid collision
    if (!user) {
      try {
        const clerkUser = await clerkClient.users.getUser(clerkId);
        const email =
          clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkId}@example.com`;
        const name =
          [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
          clerkUser.username ||
          'Student';

        user = await prisma.user.upsert({
          where: { clerkId },
          update: {},
          create: {
            clerkId,
            email,
            name,
            role: 'STUDENT',
          },
        });
      } catch (userErr: any) {
        throw new AppError(500, `Failed to initialize user record: ${userErr.message}`);
      }
    }

    // Attach typed DB user to request
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
