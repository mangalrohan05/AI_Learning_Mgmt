/**
 * Idempotent seed script.
 * Safe to re-run: every record is upserted on its unique key.
 * Run with:  npm run seed  (from monorepo root)
 *        or: npx prisma db seed  (from server/)
 */
import { PrismaClient, Role, MaterialType, MaterialStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Seeding database...');

  // ── Users ──────────────────────────────────────────────────
  // Note: clerkIds are fake seed values. Real users are created
  // on first sign-in via the auth upsert in the Express middleware.
  const alice = await prisma.user.upsert({
    where: { clerkId: 'seed_user_instructor_01' },
    update: {},
    create: {
      clerkId: 'seed_user_instructor_01',
      email:   'alice@example.com',
      name:    'Alice Smith',
      role:    Role.INSTRUCTOR,
    },
  });

  const bob = await prisma.user.upsert({
    where: { clerkId: 'seed_user_student_01' },
    update: {},
    create: {
      clerkId: 'seed_user_student_01',
      email:   'bob@example.com',
      name:    'Bob Jones',
      role:    Role.STUDENT,
    },
  });

  console.log(`  ✔ Users: ${alice.name}, ${bob.name}`);

  // ── Courses ────────────────────────────────────────────────
  const mlCourse = await prisma.course.upsert({
    where: { id: 'seed_course_ml_01' },
    update: {},
    create: {
      id:          'seed_course_ml_01',
      title:       'Introduction to Machine Learning',
      description: 'Learn the fundamentals of ML with practical Python examples.',
      ownerId:     alice.id,
    },
  });

  const dsCourse = await prisma.course.upsert({
    where: { id: 'seed_course_ds_01' },
    update: {},
    create: {
      id:          'seed_course_ds_01',
      title:       'Data Structures & Algorithms',
      description: 'Master core CS concepts through hands-on problem solving.',
      ownerId:     alice.id,
    },
  });

  console.log(`  ✔ Courses: "${mlCourse.title}", "${dsCourse.title}"`);

  // ── Enrollments ────────────────────────────────────────────
  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: bob.id, courseId: mlCourse.id } },
    update: {},
    create: { userId: bob.id, courseId: mlCourse.id },
  });

  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: bob.id, courseId: dsCourse.id } },
    update: {},
    create: { userId: bob.id, courseId: dsCourse.id },
  });

  console.log(`  ✔ Enrollments: Bob enrolled in both courses`);

  // ── Materials (metadata only — no real files) ───────────────
  await prisma.material.upsert({
    where: { id: 'seed_mat_01' },
    update: {},
    create: {
      id:          'seed_mat_01',
      courseId:    mlCourse.id,
      uploaderId:  alice.id,
      name:        'Week 1 – Intro to ML.pdf',
      type:        MaterialType.PDF,
      status:      MaterialStatus.READY,
      storagePath: 'uploads/seed/week1-intro-ml.pdf',
      mimeType:    'application/pdf',
      size:        2_048_000,
    },
  });

  await prisma.material.upsert({
    where: { id: 'seed_mat_02' },
    update: {},
    create: {
      id:          'seed_mat_02',
      courseId:    mlCourse.id,
      uploaderId:  alice.id,
      name:        'Linear Regression Notes.txt',
      type:        MaterialType.TXT,
      status:      MaterialStatus.READY,
      storagePath: 'uploads/seed/linear-regression.txt',
      mimeType:    'text/plain',
      size:        15_000,
    },
  });

  await prisma.material.upsert({
    where: { id: 'seed_mat_03' },
    update: {},
    create: {
      id:          'seed_mat_03',
      courseId:    dsCourse.id,
      uploaderId:  alice.id,
      name:        'Big O Notation.pdf',
      type:        MaterialType.PDF,
      status:      MaterialStatus.READY,
      storagePath: 'uploads/seed/big-o-notation.pdf',
      mimeType:    'application/pdf',
      size:        1_024_000,
    },
  });

  console.log(`  ✔ Materials: 3 rows (metadata only, no real files)`);
  console.log('✅  Seed complete.');
}

main()
  .catch((err) => {
    console.error('❌  Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
