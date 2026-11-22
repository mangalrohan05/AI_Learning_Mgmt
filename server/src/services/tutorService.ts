import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { embedQuery, answerAsTutor } from '../lib/ai';

export interface TutorRequestData {
  question: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface TutorResponse {
  answer: string;
  sources: {
    materialName: string;
    snippet: string;
  }[];
}

interface ChunkQueryResult {
  id: string;
  materialId: string;
  content: string;
  chunkIndex: number;
  materialName: string;
  similarity: number;
}

export class TutorService {
  /**
   * AI Tutor endpoint: patient explanations, step-by-step reasoning, examples,
   * grounded in course materials with explicit [General Knowledge] tagging.
   */
  public async tutorCourse(
    courseId: string,
    userId: string,
    data: TutorRequestData
  ): Promise<TutorResponse> {
    // 1. Verify course and membership
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        enrollments: { where: { userId } },
        materials: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    if (!course) {
      throw new AppError(404, 'Course not found');
    }

    const isOwner = course.ownerId === userId;
    const isEnrolled = course.enrollments.length > 0;

    if (!isOwner && !isEnrolled) {
      throw new AppError(
        403,
        'Access denied: You must be enrolled or the course owner to interact with the AI Tutor'
      );
    }

    // 2. Validate question
    const trimmedQuestion = data.question?.trim();
    if (!trimmedQuestion) {
      throw new AppError(400, 'Question cannot be empty');
    }
    if (trimmedQuestion.length > 500) {
      throw new AppError(400, 'Question is too long (maximum 500 characters)');
    }

    // 3. Retrieve relevant chunks via pgvector if ready materials exist
    const readyMaterials = course.materials.filter((m) => m.status === 'READY');
    let chunks: ChunkQueryResult[] = [];

    if (readyMaterials.length > 0) {
      const queryVector = await embedQuery(trimmedQuestion);
      const vectorString = `[${queryVector.join(',')}]`;

      chunks = await prisma.$queryRawUnsafe<ChunkQueryResult[]>(
        `SELECT 
          dc.id, 
          dc."materialId", 
          dc.content, 
          dc."chunkIndex", 
          m.name as "materialName",
          1 - (dc.embedding <=> $1::vector) as similarity
        FROM "DocumentChunk" dc
        JOIN "Material" m ON m.id = dc."materialId"
        WHERE m."courseId" = $2
          AND m.status = 'READY'
          AND dc.embedding IS NOT NULL
        ORDER BY dc.embedding <=> $1::vector ASC
        LIMIT 4`,
        vectorString,
        courseId
      );
    }

    // 4. Generate response with patient-teacher prompt
    const answer = await answerAsTutor(
      trimmedQuestion,
      chunks.map((c) => ({
        materialName: c.materialName,
        content: c.content,
      })),
      data.history
    );

    const sources = chunks.map((c) => ({
      materialName: c.materialName,
      snippet: c.content.length > 250 ? c.content.slice(0, 250) + '...' : c.content,
    }));

    return { answer, sources };
  }
}

export const tutorService = new TutorService();
