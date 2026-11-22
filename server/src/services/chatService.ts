import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { embedQuery, answerWithContext } from '../lib/ai';
import { chatCache } from '../lib/chatCache';

export interface ChatRequestData {
  question: string;
  materialId?: string;
}

export interface ChatResponse {
  answer: string;
  sources: {
    materialName: string;
    snippet: string;
  }[];
  cached?: boolean;
}

interface ChunkQueryResult {
  id: string;
  materialId: string;
  content: string;
  chunkIndex: number;
  materialName: string;
  similarity: number;
}

export class ChatService {
  /**
   * Performs semantic search over course materials (or specific material) and answers
   * using retrieved context via Google Gemini.
   */
  public async chatCourse(
    courseId: string,
    userId: string,
    data: ChatRequestData
  ): Promise<ChatResponse> {
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
        'Access denied: You must be enrolled or the course owner to chat with course materials'
      );
    }

    // 2. Guardrails: Verify ready materials
    if (data.materialId) {
      const targetMaterial = course.materials.find((m) => m.id === data.materialId);
      if (!targetMaterial) {
        throw new AppError(404, 'Specified material not found in this course');
      }
      if (targetMaterial.status !== 'READY') {
        return {
          answer: `The selected material ("${targetMaterial.name}") is currently ${targetMaterial.status.toLowerCase()} and cannot be queried yet. Please wait until processing completes.`,
          sources: [],
        };
      }
    } else {
      const readyMaterials = course.materials.filter((m) => m.status === 'READY');
      if (readyMaterials.length === 0) {
        return {
          answer:
            'There are no ready study materials in this course yet. Please upload a PDF, DOCX, or TXT file and wait until processing completes.',
          sources: [],
        };
      }
    }

    // 3. Question length guardrail
    const trimmedQuestion = data.question.trim();
    if (!trimmedQuestion) {
      throw new AppError(400, 'Question cannot be empty');
    }
    if (trimmedQuestion.length > 500) {
      throw new AppError(400, 'Question is too long (maximum 500 characters)');
    }

    // Check in-memory cache
    const cachedHit = chatCache.get(courseId, data.materialId, trimmedQuestion);
    if (cachedHit) {
      return cachedHit;
    }

    // 4. Generate query embedding (768-dim vector from text-embedding-004)
    const queryVector = await embedQuery(trimmedQuestion);
    const vectorString = `[${queryVector.join(',')}]`;

    // 5. Query top 4 matching chunks using cosine distance (<=>)
    let chunks: ChunkQueryResult[] = [];

    if (data.materialId) {
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
        WHERE dc."materialId" = $2
          AND m.status = 'READY'
          AND dc.embedding IS NOT NULL
        ORDER BY dc.embedding <=> $1::vector ASC
        LIMIT 4`,
        vectorString,
        data.materialId
      );
    } else {
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

    if (chunks.length === 0) {
      return {
        answer:
          'I could not find any relevant information in the course materials to answer your question.',
        sources: [],
      };
    }

    // 6. Generate answer using Gemini 1.5 Flash via LangChain
    const answer = await answerWithContext(
      trimmedQuestion,
      chunks.map((c) => ({
        materialName: c.materialName,
        content: c.content,
      }))
    );

    // 7. Format sources
    const sources = chunks.map((c) => ({
      materialName: c.materialName,
      snippet: c.content.length > 250 ? c.content.slice(0, 250) + '...' : c.content,
    }));

    // Cache the response
    chatCache.set(courseId, data.materialId, trimmedQuestion, { answer, sources });

    return { answer, sources, cached: false };
  }
}

export const chatService = new ChatService();
