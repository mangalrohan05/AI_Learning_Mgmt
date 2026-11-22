interface CacheEntry {
  answer: string;
  sources: { materialName: string; snippet: string }[];
  expiresAt: number;
}

/**
 * In-memory TTL cache for Course PDF Chat answers.
 * Keyed by: courseId:(materialId || "all"):normalizedQuestion
 * TTL: 1 hour
 * Cleared on material creation or deletion for a course.
 */
class ChatCache {
  private cache = new Map<string, CacheEntry>();
  private courseKeys = new Map<string, Set<string>>();
  private ttlMs = 60 * 60 * 1000; // 1 hour

  private buildKey(courseId: string, materialId: string | undefined, question: string): string {
    const matKey = materialId || 'all';
    const normQ = question.trim().toLowerCase().replace(/\s+/g, ' ');
    return `${courseId}:${matKey}:${normQ}`;
  }

  public get(courseId: string, materialId: string | undefined, question: string) {
    const key = this.buildKey(courseId, materialId, question);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.courseKeys.get(courseId)?.delete(key);
      return null;
    }

    return {
      answer: entry.answer,
      sources: entry.sources,
      cached: true,
    };
  }

  public set(
    courseId: string,
    materialId: string | undefined,
    question: string,
    response: { answer: string; sources: { materialName: string; snippet: string }[] }
  ): void {
    const key = this.buildKey(courseId, materialId, question);
    const entry: CacheEntry = {
      answer: response.answer,
      sources: response.sources,
      expiresAt: Date.now() + this.ttlMs,
    };
    this.cache.set(key, entry);

    if (!this.courseKeys.has(courseId)) {
      this.courseKeys.set(courseId, new Set());
    }
    this.courseKeys.get(courseId)!.add(key);
  }

  public clearCourse(courseId: string): void {
    const keys = this.courseKeys.get(courseId);
    if (keys) {
      for (const k of keys) {
        this.cache.delete(k);
      }
      this.courseKeys.delete(courseId);
    }
  }

  public clearAll(): void {
    this.cache.clear();
    this.courseKeys.clear();
  }
}

export const chatCache = new ChatCache();
