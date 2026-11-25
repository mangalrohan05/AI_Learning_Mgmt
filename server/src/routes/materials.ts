import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { upload } from '../middleware/upload';
import { materialController } from '../controllers/materialController';

const router = Router();

const courseIdParamSchema = z.object({
  courseId: z.string().min(1, 'Course ID is required'),
});

const materialIdParamSchema = z.object({
  materialId: z.string().min(1, 'Material ID is required'),
});

const createTextMaterialSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(120, 'Title cannot exceed 120 characters'),
  content: z
    .string()
    .trim()
    .min(20, 'Please enter at least 20 characters of notes')
    .max(100000, 'Notes cannot exceed 100,000 characters'),
});

// All material routes require authentication
router.use(requireAuth);

// GET /api/materials/file/:materialId - Stream stored file (owner or enrolled only)
// Mounted BEFORE /:courseId to prevent shadowing
router.get(
  '/file/:materialId',
  validate(materialIdParamSchema, 'params'),
  materialController.streamFile
);

// GET /api/materials/:courseId - List materials for a course (owner or enrolled)
router.get(
  '/:courseId',
  validate(courseIdParamSchema, 'params'),
  materialController.getMaterials
);

// POST /api/materials/:courseId/upload - Upload material (owner or enrolled)
router.post(
  '/:courseId/upload',
  validate(courseIdParamSchema, 'params'),
  upload.single('file'),
  materialController.uploadMaterial
);

// POST /api/materials/:courseId/text - Create manual text/note material (owner or enrolled)
router.post(
  '/:courseId/text',
  validate(courseIdParamSchema, 'params'),
  validate(createTextMaterialSchema),
  materialController.createTextMaterial
);

// POST /api/materials/:materialId/summary - Generate or get material summary (owner or enrolled)
router.post(
  '/:materialId/summary',
  validate(materialIdParamSchema, 'params'),
  materialController.summarizeMaterial
);

// POST /api/materials/:materialId/reprocess - Retry processing a FAILED material (uploader or course owner)
router.post(
  '/:materialId/reprocess',
  validate(materialIdParamSchema, 'params'),
  materialController.reprocessMaterial
);

// DELETE /api/materials/:materialId - Delete material (uploader or course owner)
router.delete(
  '/:materialId',
  validate(materialIdParamSchema, 'params'),
  materialController.deleteMaterial
);

export default router;
