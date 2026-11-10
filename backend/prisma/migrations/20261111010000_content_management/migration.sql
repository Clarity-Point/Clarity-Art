BEGIN;
ALTER TABLE "Course" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "ImageAnalysis" ADD COLUMN "moderationVersion" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "Submission_submissionDate_id_idx" ON "Submission"("submissionDate", "id");
COMMIT;
