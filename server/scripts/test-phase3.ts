import { Server } from 'http';
import { AddressInfo } from 'net';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { quizService } from '../src/services/quizService';
import { progressService } from '../src/services/progressService';

async function main() {
  console.log('🧪 Starting Phase 3 Automated Verification Suite...\n');

  // Find seed course & user
  const course = await prisma.course.findFirst({
    where: { id: 'seed_course_ml_01' },
    include: { owner: true },
  });

  if (!course) {
    throw new Error('Seed course "seed_course_ml_01" not found. Run "npm run seed" first.');
  }

  const userId = course.ownerId;
  const userClerkId = course.owner.clerkId;
  let tempMaterialId: string | null = null;
  let testQuizId: string | null = null;
  let httpServer: Server | null = null;

  try {
    // Create a temporary material with sample chunks for self-contained testing
    const tempMaterial = await prisma.material.create({
      data: {
        courseId: course.id,
        uploaderId: userId,
        name: 'Machine Learning Fundamentals.txt',
        type: 'TXT',
        status: 'READY',
        storagePath: 'uploads/temp_phase3_ml_guide.txt',
        mimeType: 'text/plain',
        size: 1024,
      },
    });
    tempMaterialId = tempMaterial.id;

    await prisma.documentChunk.createMany({
      data: [
        {
          materialId: tempMaterial.id,
          chunkIndex: 0,
          content: 'Supervised learning algorithms build a mathematical model of a set of data that contains both the inputs and the desired outputs. Common algorithms include linear regression, logistic regression, decision trees, and support vector machines.',
        },
        {
          materialId: tempMaterial.id,
          chunkIndex: 1,
          content: 'Unsupervised learning algorithms take a set of data that contains only inputs, and find structure in the data, like grouping or clustering of data points. Examples include K-Means clustering and Principal Component Analysis.',
        },
        {
          materialId: tempMaterial.id,
          chunkIndex: 2,
          content: 'Gradient descent is an optimization algorithm used to minimize cost functions in machine learning models. Learning rate is a hyperparameter that controls how much to change the model in response to the estimated error each time the model weights are updated.',
        },
      ],
    });

    // Start local Express server for real HTTP route testing
    httpServer = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = (httpServer.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`📡 Local test server listening on ${baseUrl}`);

    // 1. Test Quiz Generation from Course Materials (Gemini Structured Output)
    console.log('\n[Test 1] Generating 3-question MCQ quiz from course materials via Gemini...');
    const generatedQuiz = await quizService.generateQuiz(course.id, userId, {
      numQuestions: 3,
    });
    testQuizId = generatedQuiz.id;

    console.log(`  ✅ Quiz created: "${generatedQuiz.title}" (ID: ${generatedQuiz.id})`);
    console.log(`  ✅ Total questions generated: ${generatedQuiz.totalQuestions}`);
    if (generatedQuiz.totalQuestions !== 3) {
      throw new Error(`Expected 3 questions, got ${generatedQuiz.totalQuestions}`);
    }

    // 2. Test Fetching Quiz for Student (Must NOT leak correct answers)
    console.log('\n[Test 2] Fetching quiz for taking (verifying answer stripping)...');
    const takingQuiz = await quizService.getQuizForTaking(generatedQuiz.id, userId);

    console.log(`  ✅ Retrieved ${takingQuiz.questions.length} questions for taking`);
    const leakedAnswer = (takingQuiz.questions[0] as any).correctAnswer;
    const leakedExplanation = (takingQuiz.questions[0] as any).explanation;
    if (leakedAnswer !== undefined || leakedExplanation !== undefined) {
      throw new Error('SECURITY VIOLATION: Quiz taking endpoint leaked correct answers or explanations!');
    }
    console.log('  ✅ Verified: correctAnswer and explanation are stripped from student view');

    // 3. Test Quiz Attempt Submission over Real HTTP Route
    console.log('\n[Test 3] Testing Quiz Submission over real HTTP route...');

    const quizInDb = await prisma.quiz.findUniqueOrThrow({
      where: { id: generatedQuiz.id },
    });
    const dbQuestions = (quizInDb.questions as unknown as { correctAnswer: number; options: string[] }[]) || [];
    const correctAnswers = dbQuestions.map((q) => q.correctAnswer);
    const wrongAnswers = dbQuestions.map((q) => (q.correctAnswer + 1) % q.options.length);
    const unansweredPayload = [-1, correctAnswers[1] ?? 0, -1];
    const invalidPayload = [-2, 0, 0];

    // 3a. Real HTTP: Payload with out-of-range negative number (-2) -> 400 Validation Error
    console.log('  [3a] Submitting payload with invalid index -2 (expecting HTTP 400)...');
    const res400 = await fetch(`${baseUrl}/api/quizzes/${generatedQuiz.id}/attempt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test_token_${userClerkId}`,
      },
      body: JSON.stringify({ answers: invalidPayload }),
    });
    const body400 = (await res400.json()) as any;
    if (res400.status !== 400) {
      throw new Error(`Expected HTTP 400 for payload with -2, got ${res400.status}: ${JSON.stringify(body400)}`);
    }
    if (!body400.error?.includes('Validation failed') || !body400.details?.answers) {
      throw new Error(`Expected validation error details for answers, got: ${JSON.stringify(body400)}`);
    }
    console.log(`  ✅ Verified HTTP 400 on -2 payload: "${body400.error}" -> ${JSON.stringify(body400.details)}`);

    // 3b. Real HTTP: Payload with -1 (Unanswered Questions Allowed) -> 201 Success
    console.log('  [3b] Submitting payload with -1 for unanswered questions (expecting HTTP 201)...');
    const resUnanswered = await fetch(`${baseUrl}/api/quizzes/${generatedQuiz.id}/attempt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test_token_${userClerkId}`,
      },
      body: JSON.stringify({ answers: unansweredPayload }),
    });
    const bodyUnanswered = (await resUnanswered.json()) as any;
    if (resUnanswered.status !== 201) {
      throw new Error(`Expected HTTP 201 for payload with unanswered questions (-1), got ${resUnanswered.status}: ${JSON.stringify(bodyUnanswered)}`);
    }
    console.log(`  ✅ Verified HTTP 201 on payload with unanswered (-1): score=${bodyUnanswered.score}%, correct=${bodyUnanswered.correctCount}/${bodyUnanswered.totalQuestions}`);

    // 3c. Real HTTP: All-correct answers -> 100% Score
    console.log('  [3c] Submitting all-correct answers (expecting 100% score)...');
    const res100 = await fetch(`${baseUrl}/api/quizzes/${generatedQuiz.id}/attempt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test_token_${userClerkId}`,
      },
      body: JSON.stringify({ answers: correctAnswers }),
    });
    const body100 = (await res100.json()) as any;
    if (res100.status !== 201) {
      throw new Error(`Expected HTTP 201 for all-correct answers, got ${res100.status}: ${JSON.stringify(body100)}`);
    }
    if (body100.score !== 100 || body100.correctCount !== dbQuestions.length) {
      throw new Error(`Expected 100% score, got ${body100.score}% (${body100.correctCount}/${dbQuestions.length})`);
    }
    console.log(`  ✅ Verified HTTP 201 on all-correct answers: score=${body100.score}%, correct=${body100.correctCount}/${body100.totalQuestions}`);

    // 3d. Real HTTP: All-wrong answers -> 0% Score
    console.log('  [3d] Submitting all-wrong answers (expecting 0% score)...');
    const res0 = await fetch(`${baseUrl}/api/quizzes/${generatedQuiz.id}/attempt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test_token_${userClerkId}`,
      },
      body: JSON.stringify({ answers: wrongAnswers }),
    });
    const body0 = (await res0.json()) as any;
    if (res0.status !== 201) {
      throw new Error(`Expected HTTP 201 for all-wrong answers, got ${res0.status}: ${JSON.stringify(body0)}`);
    }
    if (body0.score !== 0 || body0.correctCount !== 0) {
      throw new Error(`Expected 0% score, got ${body0.score}% (${body0.correctCount}/${body0.totalQuestions})`);
    }
    console.log(`  ✅ Verified HTTP 201 on all-wrong answers: score=${body0.score}%, correct=${body0.correctCount}/${body0.totalQuestions}`);

    // 3e. Real HTTP: Incomplete answers length -> 400 Validation Error
    console.log('  [3e] Submitting incomplete answers array (expecting HTTP 400)...');
    const resIncomplete = await fetch(`${baseUrl}/api/quizzes/${generatedQuiz.id}/attempt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test_token_${userClerkId}`,
      },
      body: JSON.stringify({ answers: [0] }), // 1 answer for 3 questions
    });
    const bodyIncomplete = (await resIncomplete.json()) as any;
    if (resIncomplete.status !== 400) {
      throw new Error(`Expected HTTP 400 for incomplete answers, got ${resIncomplete.status}`);
    }
    console.log(`  ✅ Verified HTTP 400 on incomplete answers: "${bodyIncomplete.error}" -> ${JSON.stringify(bodyIncomplete.details)}`);

    // 4. Test Progress Tracking Analytics Endpoint
    console.log('\n[Test 4] Testing progress tracking analytics logic...');
    const progress = await progressService.getUserProgress(userId);

    console.log('  ✅ Progress Counts:', JSON.stringify(progress.counts));
    console.log(`  ✅ Average Quiz Score: ${progress.averageQuizScore}%`);
    console.log(`  ✅ Recent Quiz Scores count: ${progress.recentScores.length}`);
    console.log(`  ✅ Per-Course Completion entries: ${progress.courseProgress.length}`);

    if (progress.counts.courses < 1) {
      throw new Error('Expected user course count >= 1');
    }
    if (progress.counts.quizzesAttempted < 1) {
      throw new Error('Expected user quizzesAttempted count >= 1');
    }
    const thisCourseProgress = progress.courseProgress.find((c) => c.courseId === course.id);
    if (!thisCourseProgress) {
      throw new Error('Expected course completion entry for ML course');
    }
    console.log(`  ✅ Course "${thisCourseProgress.courseTitle}": ${thisCourseProgress.completedQuizzes}/${thisCourseProgress.totalQuizzes} quizzes (${thisCourseProgress.completionPercentage}%)`);

    console.log('\n🎉 ALL PHASE 3 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  } finally {
    // 5. Cleanup
    console.log('\n🧹 Cleaning up Phase 3 test artifacts...');
    if (httpServer) {
      await new Promise((resolve) => httpServer?.close(resolve));
    }
    if (testQuizId) {
      await prisma.quizAttempt.deleteMany({ where: { quizId: testQuizId } });
      await prisma.quiz.delete({ where: { id: testQuizId } }).catch(() => {});
    }
    if (tempMaterialId) {
      await prisma.documentChunk.deleteMany({ where: { materialId: tempMaterialId } }).catch(() => {});
      await prisma.material.delete({ where: { id: tempMaterialId } }).catch(() => {});
    }
    await prisma.$disconnect();
    console.log('✅ Cleanup complete. Seed data preserved.');
  }
}

main().catch((err) => {
  console.error('\n❌ Phase 3 Verification Failed:', err);
  process.exit(1);
});
