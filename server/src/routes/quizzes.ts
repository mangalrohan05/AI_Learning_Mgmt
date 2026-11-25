import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { quizController } from '../controllers/quizController';

const router = Router();

router.use(requireAuth);

const quizIdParamSchema = z.object({
  id: z.string().min(1, 'Quiz ID is required'),
});

const submitAttemptSchema = z.object({
  answers: z.array(
    z.number().int({ message: 'Answer index must be an integer' }).min(-1, { message: 'Number must be greater than or equal to -1' })
  ),
});

// GET /api/quizzes/:id/attempt/latest - Get graded breakdown for user's latest attempt
router.get(
  '/:id/attempt/latest',
  validate(quizIdParamSchema, 'params'),
  quizController.getLatestAttemptReview
);

// GET /api/quizzes/:id - Get quiz for taking (strips correct answers)
router.get('/:id', validate(quizIdParamSchema, 'params'), quizController.getQuizForTaking);

// POST /api/quizzes/:id/attempt - Submit attempt and get graded results
router.post(
  '/:id/attempt',
  validate(quizIdParamSchema, 'params'),
  validate(submitAttemptSchema),
  quizController.submitAttempt
);

// DELETE /api/quizzes/:id - Delete quiz (course owner only)
router.delete('/:id', validate(quizIdParamSchema, 'params'), quizController.deleteQuiz);

export default router;
