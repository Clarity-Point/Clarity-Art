BEGIN;

ALTER TABLE "DiaryEntry" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Submission" DROP CONSTRAINT "Submission_homeworkId_fkey";
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_homeworkId_fkey"
  FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "CourseProgress" DROP CONSTRAINT "CourseProgress_courseId_fkey";
ALTER TABLE "CourseProgress" ADD CONSTRAINT "CourseProgress_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE INDEX "Submission_userId_submissionDate_id_idx" ON "Submission"("userId", "submissionDate", "id");
CREATE INDEX "Notification_userId_date_id_idx" ON "Notification"("userId", "date", "id");

CREATE TABLE "ImageDeletion" (
  "storageKey" TEXT NOT NULL,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImageDeletion_pkey" PRIMARY KEY ("storageKey")
);
CREATE INDEX "ImageDeletion_nextAttemptAt_idx" ON "ImageDeletion"("nextAttemptAt");

COMMIT;
