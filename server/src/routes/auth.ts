import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { authController } from '../controllers/authController';

const router = Router();

// GET /api/auth/me - returns current user profile
router.get('/me', requireAuth, authController.getMe);

export default router;
