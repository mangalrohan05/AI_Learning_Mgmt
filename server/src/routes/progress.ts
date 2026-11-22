import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { progressController } from '../controllers/progressController';

const router = Router();

router.use(requireAuth);

// GET /api/progress - User learning analytics & course progress
router.get('/', progressController.getProgress);

export default router;
