import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { materialService } from '../src/services/materialService';
import { processingService } from '../src/services/processingService';
import { chatService } from '../src/services/chatService';

async function main() {
  console.log('🧪 Starting Final Phase Verification Suite...\n');

  const course = await prisma.course.findFirst({
    where: { id: 'seed_course_ml_01' },
    include: { owner: true },
  });

  if (!course) {
    throw new Error('Course seed_course_ml_01 not found');
  }

  const userId = course.ownerId;
  const audioFilePath = path.resolve(__dirname, '../test_lecture.wav');

  let materialId: string | null = null;

  try {
    // 1. Prepare Multer-like upload payload
    console.log('[Step 1] Uploading real audio file (test_lecture.wav)...');
    const audioBuffer = await fs.readFile(audioFilePath);
    const fakeFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'test_lecture.wav',
      encoding: '7bit',
      mimetype: 'audio/wav',
      size: audioBuffer.length,
      destination: '',
      filename: '',
      path: '',
      buffer: audioBuffer,
      stream: null as any,
    };

    const uploadedMaterial = await materialService.uploadMaterial(
      course.id,
      userId,
      fakeFile
    );
    materialId = uploadedMaterial.id;
    console.log(`  ✅ Material record created: ID ${materialId}, Status: ${uploadedMaterial.status}`);
    if (uploadedMaterial.status !== 'PENDING') {
      throw new Error(`Expected PENDING status on upload, got ${uploadedMaterial.status}`);
    }

    // 2. Process audio with Groq Whisper & text embeddings
    console.log('\n[Step 2] Processing audio via Groq Whisper (whisper-large-v3-turbo)...');
    await processingService.processMaterial(materialId);

    const processedMaterial = await prisma.material.findUniqueOrThrow({
      where: { id: materialId },
      include: { documentChunks: true },
    });

    console.log(`  ✅ Status transitioned to: ${processedMaterial.status}`);
    if (processedMaterial.status !== 'READY') {
      throw new Error(
        `Processing failed with reason: ${processedMaterial.failureReason || 'unknown'}`
      );
    }

    console.log(`  ✅ Audio Transcript stored: "${processedMaterial.transcript}"`);
    if (!processedMaterial.transcript || processedMaterial.transcript.length < 5) {
      throw new Error('Transcript was empty or missing');
    }

    console.log(`  ✅ Stored DocumentChunks count: ${processedMaterial.documentChunks.length}`);
    if (processedMaterial.documentChunks.length === 0) {
      throw new Error('No document chunks created for audio transcript');
    }

    // 3. Test Summarize on the Audio Material
    console.log('\n[Step 3] Summarizing audio material from transcript chunks...');
    const summaryResult = await materialService.summarizeMaterial(
      materialId,
      userId,
      course.id
    );
    console.log(`  ✅ AI Summary generated (${summaryResult.cached ? 'cached' : 'fresh'}):`);
    console.log(`  "${summaryResult.summary.slice(0, 150)}..."`);
    if (!summaryResult.summary) {
      throw new Error('Summary generation failed for audio material');
    }

    // 4. Test Chat Caching on Course Queries
    console.log('\n[Step 4] Testing Course Chat with In-Memory Caching...');
    const testQuestion = 'What topics are covered in the machine learning lecture?';

    // 4a. First query -> cache miss
    console.log('  [4a] Executing first chat query (expecting cache miss)...');
    const firstChat = await chatService.chatCourse(course.id, userId, {
      question: testQuestion,
    });
    console.log(`  ✅ Response received. cached=${firstChat.cached}`);
    console.log(`  Answer snippet: "${firstChat.answer.slice(0, 100)}..."`);
    console.log(`  Sources cited: ${firstChat.sources.map((s) => s.materialName).join(', ')}`);
    if (firstChat.cached !== false) {
      throw new Error(`Expected cached: false on first query, got ${firstChat.cached}`);
    }

    // 4b. Second query with same normalized question -> cache hit
    console.log('\n  [4b] Executing repeated chat query (expecting cache hit)...');
    const secondChat = await chatService.chatCourse(course.id, userId, {
      question: '   what topics are covered in the machine learning lecture?  ',
    });
    console.log(`  ✅ Response received. cached=${secondChat.cached}`);
    if (secondChat.cached !== true) {
      throw new Error(`Expected cached: true on second query, got ${secondChat.cached}`);
    }

    // 5. Test Cache Invalidation on Material Delete
    console.log('\n[Step 5] Deleting material and verifying cache invalidation...');
    await materialService.deleteMaterial(materialId, userId);
    materialId = null; // cleaned up

    const afterDeleteChat = await chatService.chatCourse(course.id, userId, {
      question: testQuestion,
    });
    console.log(`  ✅ Query after material deletion: cached=${afterDeleteChat.cached} (cache successfully cleared)`);
    if (afterDeleteChat.cached !== false) {
      throw new Error(`Expected cache miss after deletion, got cached=${afterDeleteChat.cached}`);
    }

    console.log('\n🎉 ALL FINAL PHASE VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  } finally {
    if (materialId) {
      await materialService.deleteMaterial(materialId, userId).catch(() => {});
    }
    // Remove local test audio file
    await fs.unlink(audioFilePath).catch(() => {});
    await prisma.$disconnect();
    console.log('🧹 Verification cleanup complete. Seed data preserved.');
  }
}

main().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
