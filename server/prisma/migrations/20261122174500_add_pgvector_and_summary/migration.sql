-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable Material: Add AI-generated summary column
ALTER TABLE "Material" ADD COLUMN "summary" TEXT;

-- AlterTable DocumentChunk: Add vector embedding column (768 dimensions for text-embedding-004)
ALTER TABLE "DocumentChunk" ADD COLUMN "embedding" vector(768);

-- CreateIndex: HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_idx" ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);
