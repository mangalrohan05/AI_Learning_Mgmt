import { prisma } from '../src/lib/prisma';
import { courseService } from '../src/services/courseService';
import { materialService } from '../src/services/materialService';
import { storageProvider } from '../src/services/storage/localStorageProvider';
import { validateFileSize, EXTENSION_MAP, MIME_TYPE_MAP } from '../src/middleware/upload';
import { MaterialType, MaterialStatus } from '@prisma/client';
import { AppError } from '../src/middleware/errorHandler';

/**
 * Step 3 & 5 Verification Suite
 *
 * NOTE ON TESTING METHODOLOGY:
 * - Tests 1-6 and 11-13 call the backend services directly in-process with the real Neon database connection.
 * - Tests 7-10 call the file-size and file-type validation functions directly.
 * - HTTP-level authentication (401 without token, 401 with invalid token) is verified over HTTP in server/api.http.
 * - Cleanup: Uses a robust try/finally block to delete all created test data (including test_user_charlie and any test courses/materials), ensuring zero database pollution while keeping seed data intact.
 */
async function runTests() {
  console.log('🧪 Starting Verification Suite...\n');

  // Purge any preexisting leftover test records from previous runs
  await prisma.user.deleteMany({
    where: { clerkId: { in: ['test_user_charlie', 'test_user_temp'] } },
  }).catch(() => { });

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} - ${detail}`);
      failed++;
    }
  }

  // Track any dynamically created IDs to ensure complete cleanup in finally
  const createdUserIds: string[] = [];
  const createdCourseIds: string[] = [];
  const createdMaterialIds: string[] = [];

  try {
    // 1. Fetch seed users and courses
    const alice = await prisma.user.findUniqueOrThrow({
      where: { clerkId: 'seed_user_instructor_01' },
    });
    const bob = await prisma.user.findUniqueOrThrow({
      where: { clerkId: 'seed_user_student_01' },
    });

    // Create a temporary 3rd user 'charlie' for permission testing (non-member)
    const charlie = await prisma.user.create({
      data: {
        clerkId: 'test_user_charlie',
        email: 'charlie@example.com',
        name: 'Charlie Brown',
        role: 'STUDENT',
      },
    });
    createdUserIds.push(charlie.id);

    const mlCourse = await prisma.course.findUniqueOrThrow({
      where: { id: 'seed_course_ml_01' },
    });

    console.log(`[Setup] Alice: ${alice.name} (Seed Owner)`);
    console.log(`[Setup] Bob: ${bob.name} (Seed Enrolled)`);
    console.log(`[Setup] Charlie: ${charlie.name} (Temporary Non-member)\n`);

    // Create a temporary material for permission testing
    const testMaterial = await prisma.material.create({
      data: {
        courseId: mlCourse.id,
        uploaderId: alice.id,
        name: 'Test Permission Doc.pdf',
        type: MaterialType.PDF,
        status: MaterialStatus.READY,
        storagePath: 'uploads/test_perm_doc.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      },
    });
    createdMaterialIds.push(testMaterial.id);

    // ── TEST 1: 403 for Non-Member Accessing Course Details ───────
    try {
      await courseService.getCourseById(mlCourse.id, charlie.id);
      assert(false, '403 for non-member accessing course details', 'Expected 403 AppError');
    } catch (err: any) {
      assert(
        err instanceof AppError && err.statusCode === 403,
        '403 for non-member accessing course details',
        `Got status: ${err.statusCode}, message: ${err.message}`
      );
    }

    // ── TEST 2: 403 for Non-Member Accessing Materials ───────────
    try {
      await materialService.getCourseMaterials(mlCourse.id, charlie.id);
      assert(false, '403 for non-member accessing materials', 'Expected 403 AppError');
    } catch (err: any) {
      assert(
        err instanceof AppError && err.statusCode === 403,
        '403 for non-member accessing materials',
        `Got status: ${err.statusCode}, message: ${err.message}`
      );
    }

    // ── TEST 3: 400 for Owner Enrolling in Own Course ────────────
    try {
      await courseService.enrollInCourse(mlCourse.id, alice.id);
      assert(false, '400 for owner enrolling in own course', 'Expected 400 AppError');
    } catch (err: any) {
      assert(
        err instanceof AppError && err.statusCode === 400,
        '400 for owner enrolling in own course',
        `Got status: ${err.statusCode}, message: ${err.message}`
      );
    }

    // ── TEST 4: 400 for Duplicate Enrollment ─────────────────────
    try {
      // Bob is already enrolled in mlCourse from seed
      await courseService.enrollInCourse(mlCourse.id, bob.id);
      assert(false, '400 for duplicate enrollment', 'Expected 400 AppError');
    } catch (err: any) {
      assert(
        err instanceof AppError && err.statusCode === 400,
        '400 for duplicate enrollment',
        `Got status: ${err.statusCode}, message: ${err.message}`
      );
    }

    // ── TEST 5: 403 for Non-Owner Modifying Course ───────────────
    try {
      await courseService.updateCourse(mlCourse.id, bob.id, { title: 'Hacked Title' });
      assert(false, '403 for non-owner modifying course', 'Expected 403 AppError');
    } catch (err: any) {
      assert(
        err instanceof AppError && err.statusCode === 403,
        '403 for non-owner modifying course',
        `Got status: ${err.statusCode}`
      );
    }

    // ── TEST 6: 403 for Non-Owner/Non-Uploader Deleting Material ──
    try {
      await materialService.deleteMaterial(testMaterial.id, charlie.id);
      assert(false, '403 for non-owner/non-uploader deleting material', 'Expected 403 AppError');
    } catch (err: any) {
      assert(
        err instanceof AppError && err.statusCode === 403,
        '403 for non-owner/non-uploader deleting material',
        `Got status: ${err.statusCode}`
      );
    }

    // ── TEST 7: Rejected File Type Validation ────────────────────
    const rejectedExts = ['.exe', '.sh', '.jpg', '.png', '.zip'];
    let allRejected = true;
    for (const ext of rejectedExts) {
      if (EXTENSION_MAP[ext] || MIME_TYPE_MAP[`application/${ext.slice(1)}`]) {
        allRejected = false;
        break;
      }
    }
    assert(allRejected, 'Rejected file types are disallowed by extension & MIME maps');

    // ── TEST 8: Oversized Document (> 50 MB) Validation ──────────
    try {
      const fakeDocFile = {
        size: 51 * 1024 * 1024,
        originalname: 'huge_book.pdf',
      } as any;
      validateFileSize(fakeDocFile, MaterialType.PDF);
      assert(false, 'Oversized document (> 50MB) rejected', 'Expected error');
    } catch (err: any) {
      assert(
        err instanceof AppError && err.statusCode === 400,
        'Oversized document (> 50MB) rejected',
        `Got status: ${err.statusCode}, message: ${err.message}`
      );
    }

    // ── TEST 9: Oversized Audio (> 25 MB) Validation ───────────
    try {
      const fakeAudioFile = {
        size: 26 * 1024 * 1024,
        originalname: 'recording.mp3',
      } as any;
      validateFileSize(fakeAudioFile, MaterialType.AUDIO);
      assert(false, 'Oversized audio (> 25MB) rejected', 'Expected error');
    } catch (err: any) {
      assert(
        err instanceof AppError && err.statusCode === 400,
        'Oversized audio (> 25MB) rejected',
        `Got status: ${err.statusCode}, message: ${err.message}`
      );
    }

    // ── TEST 10: Allowed File Sizes Accepted ─────────────────────
    try {
      const validDocFile = { size: 10 * 1024 * 1024 } as any;
      validateFileSize(validDocFile, MaterialType.PDF);
      const validAudioFile = { size: 15 * 1024 * 1024 } as any;
      validateFileSize(validAudioFile, MaterialType.AUDIO);
      assert(true, 'Files within size limits accepted');
    } catch (err: any) {
      assert(false, 'Files within size limits accepted', err.message);
    }

    // ── TEST 11: Storage Delete Does Not Crash When File Is Missing
    try {
      await storageProvider.delete('uploads/non_existent_file_12345.pdf');
      assert(true, 'Storage delete is resilient and does not throw on missing files');
    } catch (err: any) {
      assert(false, 'Storage delete does not throw on missing files', err.message);
    }

    // ── TEST 12: Explore Courses (neither owned nor enrolled) ─────
    try {
      const exploreForCharlie = await courseService.getExploreCourses(charlie.id);
      assert(
        exploreForCharlie.length >= 2,
        'Explore courses returns available un-enrolled courses for Charlie'
      );
      const exploreForBob = await courseService.getExploreCourses(bob.id);
      assert(
        exploreForBob.every(c => c.id !== 'seed_course_ml_01' && c.id !== 'seed_course_ds_01'),
        'Explore courses filters out courses Bob is already enrolled in'
      );
    } catch (err: any) {
      assert(false, 'Explore courses query failed', err.message);
    }

    // ── TEST 13: Download Permission Check (403 for non-member) ──
    try {
      await materialService.getMaterialForDownload(testMaterial.id, charlie.id);
      assert(false, '403 for non-member downloading material', 'Expected 403 AppError');
    } catch (err: any) {
      assert(
        err instanceof AppError && err.statusCode === 403,
        '403 for non-member downloading material',
        `Got status: ${err.statusCode}`
      );
    }
  } finally {
    // Complete teardown of any test data created during this run
    if (createdMaterialIds.length > 0) {
      await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } }).catch(() => { });
    }
    if (createdCourseIds.length > 0) {
      await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } }).catch(() => { });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => { });
    }
    // Also sweep for any lingering test_user_charlie
    await prisma.user.deleteMany({ where: { clerkId: 'test_user_charlie' } }).catch(() => { });
    await prisma.$disconnect();
    console.log('🧹 Cleaned up all test artifacts. Seed data preserved.');
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
