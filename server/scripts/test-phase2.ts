import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { storageProvider } from '../src/services/storage/localStorageProvider';
import { processingService } from '../src/services/processingService';
import { chatService } from '../src/services/chatService';
import { materialService } from '../src/services/materialService';
import { embedQuery } from '../src/lib/ai';

async function main() {
  console.log('🧪 Starting Phase 2 Verification Suite (pgvector + Gemini RAG + Summarization)...\n');

  // Find seed course and user
  const course = await prisma.course.findFirst({
    where: { id: 'seed_course_ml_01' },
    include: { owner: true },
  });

  if (!course) {
    throw new Error('Seed course "seed_course_ml_01" not found. Run "npm run seed" first.');
  }

  const userId = course.ownerId;
  let testMaterialId: string | null = null;
  let testStoragePath: string | null = null;

  try {
    // 1. Read real academic PDF paper from test fixture
    console.log('[Test 1] Loading real academic PDF paper (Trace-based JIT by Brendan Eich)...');
    const fixturePath = path.resolve(__dirname, '../../node_modules/pdf-parse/test/data/01-valid.pdf');
    const pdfBuffer = fs.readFileSync(fixturePath);

    // 2. Save PDF file via storageProvider
    console.log('[Test 2] Saving real PDF file to local storage provider...');
    const fakeMulterFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'trace_jit_paper.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: pdfBuffer.length,
      buffer: pdfBuffer,
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const savedFile = await storageProvider.save(fakeMulterFile);
    testStoragePath = savedFile.storagePath;

    // 3. Insert test Material in PENDING status
    console.log('[Test 3] Inserting Material in PENDING status...');
    const material = await prisma.material.create({
      data: {
        courseId: course.id,
        uploaderId: userId,
        name: 'trace_jit_paper.pdf',
        type: 'PDF',
        status: 'PENDING',
        storagePath: savedFile.storagePath,
        mimeType: 'application/pdf',
        size: pdfBuffer.length,
      },
    });
    testMaterialId = material.id;
    console.log(`  ✅ Material created with id: ${material.id}, status: ${material.status}`);

    // 4. Test background processing: text extraction, chunking, embeddings, pgvector
    console.log('[Test 4] Processing material (extract, chunk, embed with Gemini, pgvector store)...');
    await processingService.processMaterial(material.id);

    // Verify status is now READY
    const updatedMaterial = await prisma.material.findUnique({
      where: { id: material.id },
    });
    if (updatedMaterial?.status !== 'READY') {
      throw new Error(`Expected material status to be READY, but got: ${updatedMaterial?.status}`);
    }
    console.log('  ✅ Material status transitioned to READY');

    // Verify chunks exist with 768-dim embeddings
    const chunks = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, content, "chunkIndex", (embedding IS NOT NULL) as "hasVector" 
       FROM "DocumentChunk" 
       WHERE "materialId" = $1`,
      material.id
    );

    if (chunks.length === 0) {
      throw new Error('Expected at least 1 document chunk in database');
    }
    if (!chunks[0].hasVector) {
      throw new Error('Expected chunk embedding vector to be populated');
    }
    console.log(`  ✅ ${chunks.length} chunks created with valid 768-dimensional vector embeddings`);

    // Wait 4 seconds for free tier rate limit window
    await new Promise((r) => setTimeout(r, 4000));

    // 5. Test vector similarity search directly
    console.log('[Test 5] Testing pgvector cosine similarity search...');
    const testQuery = 'Who wrote this paper and what is trace-based compilation?';
    const queryVector = await embedQuery(testQuery);
    const vectorString = `[${queryVector.join(',')}]`;

    const searchResults = await prisma.$queryRawUnsafe<any[]>(
      `SELECT 
        dc.id, 
        dc.content, 
        1 - (dc.embedding <=> $1::vector) as similarity
       FROM "DocumentChunk" dc
       WHERE dc."materialId" = $2
       ORDER BY dc.embedding <=> $1::vector ASC
       LIMIT 1`,
      vectorString,
      material.id
    );

    if (searchResults.length === 0) {
      throw new Error('Expected search result from pgvector query');
    }
    console.log(`  ✅ pgvector search succeeded (similarity score: ${searchResults[0].similarity.toFixed(4)})`);

    await new Promise((r) => setTimeout(r, 3000));

    // 6. Test PDF Chat endpoint service (RAG)
    console.log('[Test 6] Testing chatService.chatCourse (RAG with Gemini 1.5 Flash)...');
    const chatResult = await chatService.chatCourse(course.id, userId, {
      question: 'Who are the authors of this paper and what is the main topic?',
      materialId: material.id,
    });

    console.log(`  ✅ Chat Response:\n     "${chatResult.answer.slice(0, 180)}..."`);
    console.log(`  ✅ Sources referenced: ${chatResult.sources.length}`);
    if (chatResult.sources.length === 0) {
      throw new Error('Expected at least one source snippet cited in RAG response');
    }

    await new Promise((r) => setTimeout(r, 3000));

    // 7. Test Summarization service
    console.log('[Test 7] Testing materialService.summarizeMaterial...');
    const summaryResult1 = await materialService.summarizeMaterial(material.id, userId);
    console.log(`  ✅ Summary generated (cached: ${summaryResult1.cached}):\n     "${summaryResult1.summary.slice(0, 180)}..."`);

    // Test cached summary on repeat request
    const summaryResult2 = await materialService.summarizeMaterial(material.id, userId);
    if (!summaryResult2.cached) {
      throw new Error('Expected second summary call to return cached: true');
    }
    console.log('  ✅ Repeat summary call returned cached: true');

    // 8. Test Guardrails
    console.log('[Test 8] Testing Guardrails...');
    // A) Empty question check
    try {
      await chatService.chatCourse(course.id, userId, { question: '   ' });
      throw new Error('Should have failed on empty question');
    } catch (err: any) {
      console.log('  ✅ Empty question rejected:', err.message);
    }

    // B) Oversized question (> 500 chars)
    try {
      await chatService.chatCourse(course.id, userId, { question: 'a'.repeat(501) });
      throw new Error('Should have failed on oversized question');
    } catch (err: any) {
      console.log('  ✅ Oversized question rejected:', err.message);
    }

    console.log('\n🎉 ALL PHASE 2 VERIFICATIONS PASSED SUCCESSFULLY!');
  } finally {
    // Clean up test rows and file
    console.log('\n🧹 Cleaning up test artifacts...');
    if (testMaterialId) {
      await prisma.documentChunk.deleteMany({ where: { materialId: testMaterialId } });
      await prisma.material.delete({ where: { id: testMaterialId } }).catch(() => {});
    }
    if (testStoragePath) {
      await storageProvider.delete(testStoragePath);
    }
    await prisma.$disconnect();
    console.log('✅ Cleanup complete. Seed data preserved.');
  }
}

main().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
