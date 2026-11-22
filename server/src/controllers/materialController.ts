import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { materialService } from '../services/materialService';
import { processingService } from '../services/processingService';

export class MaterialController {
  public async getMaterials(req: Request, res: Response, next: NextFunction) {
    try {
      const materials = await materialService.getCourseMaterials(
        req.params.courseId as string,
        req.user!.id
      );
      res.json(materials);
    } catch (error) {
      next(error);
    }
  }

  public async streamFile(req: Request, res: Response, next: NextFunction) {
    try {
      const { fullPath, fileName, mimeType, size } =
        await materialService.getMaterialForDownload(
          req.params.materialId as string,
          req.user!.id
        );

      const encodedName = encodeURIComponent(fileName);
      res.setHeader('Content-Type', mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`
      );
      res.setHeader('Content-Length', size);

      const stream = fs.createReadStream(fullPath);
      stream.on('error', (err) => next(err));
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  public async uploadMaterial(req: Request, res: Response, next: NextFunction) {
    try {
      const material = await materialService.uploadMaterial(
        req.params.courseId as string,
        req.user!.id,
        req.file
      );

      // Fire-and-forget background document processing (text extraction, chunking, embedding)
      processingService.processMaterial(material.id).catch((err) => {
        console.error(
          `[Upload] Background processing error for material ${material.id}:`,
          err?.message || err
        );
      });

      res.status(201).json(material);
    } catch (error) {
      next(error);
    }
  }

  public async summarizeMaterial(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await materialService.summarizeMaterial(
        req.params.materialId as string,
        req.user!.id
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  public async deleteMaterial(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await materialService.deleteMaterial(
        req.params.materialId as string,
        req.user!.id
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/materials/:materialId/reprocess
   * Re-runs background processing for a FAILED or PENDING material.
   * Only the uploader or course owner may trigger this.
   */
  public async reprocessMaterial(req: Request, res: Response, next: NextFunction) {
    try {
      const { materialId } = req.params as { materialId: string };
      const userId = req.user!.id;

      // Verify material exists and user has permission
      const material = await (await import('../lib/prisma')).prisma.material.findUnique({
        where: { id: materialId },
        include: { course: { select: { ownerId: true } } },
      });

      if (!material) {
        res.status(404).json({ error: 'Material not found' });
        return;
      }
      if (material.uploaderId !== userId && material.course.ownerId !== userId) {
        res.status(403).json({ error: 'Access denied: Only the uploader or course owner can reprocess' });
        return;
      }
      if (material.type === 'AUDIO') {
        res.status(400).json({ error: 'Audio files cannot be reprocessed (Whisper integration coming soon)' });
        return;
      }

      // Reset to PENDING so the UI shows processing state immediately
      const { prisma } = await import('../lib/prisma');
      await prisma.material.update({ where: { id: materialId }, data: { status: 'PENDING' } });

      // Fire-and-forget reprocessing
      processingService.processMaterial(materialId).catch((err) => {
        console.error(
          `[Reprocess] Background processing error for material ${materialId}:`,
          err?.message || err
        );
      });

      res.json({ success: true, message: 'Reprocessing started', status: 'PENDING' });
    } catch (error) {
      next(error);
    }
  }
}

export const materialController = new MaterialController();
