import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { upload } from '../middleware/upload';
import { courseController } from '../controllers/courseController';
import { chatController } from '../controllers/chatController';
import { tutorController } from '../controllers/tutorController';
import { quizController } from '../controllers/quizController';
import { studyPlanController } from '../controllers/studyPlanController';
import { assignmentController } from '../controllers/assignmentController';

const router = Router();

// Zod schemas
const createCourseSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100, 'Title cannot exceed 100 characters'),
  description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional(),
});

const updateCourseSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(100).optional(),
  description: z.string().trim().max(500).optional(),
});

const courseIdParamSchema = z.object({
  id: z.string().min(1, 'Course ID is required'),
});

const chatBodySchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'Question is required')
    .max(500, 'Question cannot exceed 500 characters'),
  materialId: z.string().optional(),
});

const tutorBodySchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'Question is required')
    .max(500, 'Question cannot exceed 500 characters'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(1000),
      })
    )
    .optional(),
});

const generateQuizSchema = z.object({
  materialId: z.string().optional(),
  numQuestions: z.number().int().min(3).max(10).optional(),
});

const studyPlanSchema = z.object({
  hoursPerWeek: z.number().min(1).max(60).default(5),
  examDate: z.string().optional(),
  goal: z.string().max(300).optional(),
});

// All course routes require authentication
router.use(requireAuth);

// GET /api/courses - List courses owned or enrolled
router.get('/', courseController.getCourses);

// GET /api/courses/explore - Explore courses (not owned & not enrolled)
// Placed before /:id to prevent shadowing
router.get('/explore', courseController.getExploreCourses);

// POST /api/courses - Create course (caller becomes owner)
router.post('/', validate(createCourseSchema), courseController.createCourse);

// GET /api/courses/:id - Details (owner or enrolled only)
router.get('/:id', validate(courseIdParamSchema, 'params'), courseController.getCourseById);

// PUT /api/courses/:id - Update course (owner only)
router.put(
  '/:id',
  validate(courseIdParamSchema, 'params'),
  validate(updateCourseSchema),
  courseController.updateCourse
);

// DELETE /api/courses/:id - Delete course (owner only)
router.delete('/:id', validate(courseIdParamSchema, 'params'), courseController.deleteCourse);

// POST /api/courses/:id/enroll - Enroll in course (non-owner only, prevents duplicate)
router.post('/:id/enroll', validate(courseIdParamSchema, 'params'), courseController.enrollInCourse);

// POST /api/courses/:id/chat - Semantic search + RAG answer from course materials (owner or enrolled)
router.post(
  '/:id/chat',
  validate(courseIdParamSchema, 'params'),
  validate(chatBodySchema),
  chatController.chat
);

// POST /api/courses/:id/tutor - Patient AI tutor explanation with step-by-step guidance
router.post(
  '/:id/tutor',
  validate(courseIdParamSchema, 'params'),
  validate(tutorBodySchema),
  tutorController.tutor
);

// POST /api/courses/:id/quizzes/generate - Generate MCQ quiz from course materials
router.post(
  '/:id/quizzes/generate',
  validate(courseIdParamSchema, 'params'),
  validate(generateQuizSchema),
  quizController.generateQuiz
);

// GET /api/courses/:id/quizzes - List quizzes for course
router.get(
  '/:id/quizzes',
  validate(courseIdParamSchema, 'params'),
  quizController.listQuizzes
);

// POST /api/courses/:id/study-plan - Generate or replace personalized study plan
router.post(
  '/:id/study-plan',
  validate(courseIdParamSchema, 'params'),
  validate(studyPlanSchema),
  studyPlanController.createOrReplace
);

// GET /api/courses/:id/study-plan - Retrieve current study plan
router.get(
  '/:id/study-plan',
  validate(courseIdParamSchema, 'params'),
  studyPlanController.getPlan
);

// POST /api/courses/:id/assignments - Evaluate assignment (text or file upload)
router.post(
  '/:id/assignments',
  validate(courseIdParamSchema, 'params'),
  upload.single('file'),
  assignmentController.evaluate
);

// GET /api/courses/:id/assignments - List past evaluations
router.get(
  '/:id/assignments',
  validate(courseIdParamSchema, 'params'),
  assignmentController.list
);

export default router;
