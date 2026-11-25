import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { embedQuery, answerWithContext, answerAsTutor } from '../lib/ai';
import { chatCache } from '../lib/chatCache';

export interface ChatRequestData {
  question: string;
  materialId?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  mode?: 'strict' | 'tutor';
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
   * Unified semantic search + Q&A over course materials.
   * - mode='strict' (default): answers strictly from course excerpts (with 1h cache for single-turn queries)
   * - mode='tutor': step-by-step explanations with examples, history, and [General Knowledge] fallback
   */
  public async chatCourse(
    courseId: string,
    userId: string,
    data: ChatRequestData
  ): Promise<ChatResponse> {
    const mode = data.mode === 'tutor' ? 'tutor' : 'strict';
    const hasHistory = Array.isArray(data.history) && data.history.length > 0;

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

    // 2. Validate materialId and check ready materials
    let hasReadyTarget = false;
    if (data.materialId) {
      const targetMaterial = course.materials.find((m) => m.id === data.materialId);
      if (!targetMaterial) {
        throw new AppError(404, 'Specified material not found in this course');
      }
      if (targetMaterial.status !== 'READY') {
        if (mode === 'strict') {
          return {
            answer: `The selected material ("${targetMaterial.name}") is currently ${targetMaterial.status.toLowerCase()} and cannot be queried yet. Please wait until processing finishes.`,
            sources: [],
          };
        }
      } else {
        hasReadyTarget = true;
      }
    } else {
      const readyMaterials = course.materials.filter((m) => m.status === 'READY');
      if (readyMaterials.length === 0) {
        if (mode === 'strict') {
          return {
            answer:
              'There are no ready materials in this course yet. Upload a file or write a note in Materials and wait until it finishes processing.',
            sources: [],
          };
        }
      } else {
        hasReadyTarget = true;
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

    // Only use cache for single-turn strict queries
    const canUseCache = mode === 'strict' && !hasHistory;
    if (canUseCache) {
      const cachedHit = chatCache.get(courseId, data.materialId, trimmedQuestion);
      if (cachedHit) {
        return cachedHit;
      }
    }

    // 4. Retrieve top 4 matching chunks using pgvector cosine distance (<=>)
    let chunks: ChunkQueryResult[] = [];
    if (hasReadyTarget) {
      const queryVector = await embedQuery(trimmedQuestion);
      const vectorString = `[${queryVector.join(',')}]`;

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
    }

    const mappedChunks = chunks.map((c) => ({
      materialName: c.materialName,
      content: c.content,
    }));

    let answer: string;
    if (mode === 'tutor') {
      answer = await answerAsTutor(trimmedQuestion, mappedChunks, data.history);
    } else {
      if (chunks.length === 0) {
        return {
          answer: "I couldn't find anything about that in your uploaded course materials.",
          sources: [],
        };
      }
      answer = await answerWithContext(trimmedQuestion, mappedChunks);
    }

    const sources = chunks.map((c) => ({
      materialName: c.materialName,
      snippet: c.content.length > 250 ? c.content.slice(0, 250) + '...' : c.content,
    }));

    if (canUseCache) {
      chatCache.set(courseId, data.materialId, trimmedQuestion, { answer, sources });
    }

    return { answer, sources, cached: false };
  }
}

export const chatService = new ChatService();
