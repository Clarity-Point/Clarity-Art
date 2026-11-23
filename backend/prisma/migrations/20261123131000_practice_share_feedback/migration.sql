ALTER TABLE "PracticeShare"
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "allowRecommendation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recommendedPracticeId" TEXT,
  ADD COLUMN "recommendationDismissedAt" TIMESTAMP(3);

ALTER TABLE "Notification" ADD COLUMN "practiceShareId" TEXT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_practiceShareId_fkey"
  FOREIGN KEY ("practiceShareId") REFERENCES "PracticeShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Notification_userId_practiceShareId_type_key" ON "Notification"("userId", "practiceShareId", "type");
CREATE INDEX "Notification_practiceShareId_idx" ON "Notification"("practiceShareId");
