-- AlterTable
ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'Untitled Assignment';
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StudyPlan_studentId_courseId_key" ON "StudyPlan"("studentId", "courseId");
