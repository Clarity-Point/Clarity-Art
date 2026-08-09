ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImageAnalysis" ADD COLUMN "imageStorageKey" TEXT, ADD COLUMN "imageMimeType" TEXT;

CREATE TABLE "ImageLike" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "imageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImageLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImageLike_userId_imageId_key" ON "ImageLike"("userId", "imageId");
CREATE INDEX "ImageLike_imageId_idx" ON "ImageLike"("imageId");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "User_therapistId_idx" ON "User"("therapistId");
CREATE INDEX "ImageAnalysis_userId_date_idx" ON "ImageAnalysis"("userId", "date");
CREATE INDEX "ImageAnalysis_isPublic_date_idx" ON "ImageAnalysis"("isPublic", "date");
CREATE INDEX "DiaryEntry_userId_date_idx" ON "DiaryEntry"("userId", "date");
CREATE INDEX "ChatSession_userId_updatedAt_idx" ON "ChatSession"("userId", "updatedAt");
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");
CREATE INDEX "SentimentTrend_userId_date_idx" ON "SentimentTrend"("userId", "date");
CREATE INDEX "Notification_userId_isRead_date_idx" ON "Notification"("userId", "isRead", "date");
CREATE INDEX "PeerSupportMessage_organizationId_createdAt_idx" ON "PeerSupportMessage"("organizationId", "createdAt");

ALTER TABLE "ImageLike" ADD CONSTRAINT "ImageLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageLike" ADD CONSTRAINT "ImageLike_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ImageAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Profile" DROP CONSTRAINT "Profile_userId_fkey", ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageAnalysis" DROP CONSTRAINT "ImageAnalysis_userId_fkey", ADD CONSTRAINT "ImageAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserChallenge" DROP CONSTRAINT "UserChallenge_userId_fkey", ADD CONSTRAINT "UserChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserChallenge" DROP CONSTRAINT "UserChallenge_challengeId_fkey", ADD CONSTRAINT "UserChallenge_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiaryEntry" DROP CONSTRAINT "DiaryEntry_userId_fkey", ADD CONSTRAINT "DiaryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatSession" DROP CONSTRAINT "ChatSession_userId_fkey", ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Submission" DROP CONSTRAINT "Submission_userId_fkey", ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Submission" DROP CONSTRAINT "Submission_homeworkId_fkey", ADD CONSTRAINT "Submission_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseProgress" DROP CONSTRAINT "CourseProgress_userId_fkey", ADD CONSTRAINT "CourseProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseProgress" DROP CONSTRAINT "CourseProgress_courseId_fkey", ADD CONSTRAINT "CourseProgress_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAchievement" DROP CONSTRAINT "UserAchievement_userId_fkey", ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAchievement" DROP CONSTRAINT "UserAchievement_achievementId_fkey", ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SentimentTrend" DROP CONSTRAINT "SentimentTrend_userId_fkey", ADD CONSTRAINT "SentimentTrend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey", ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PeerSupportMessage" DROP CONSTRAINT "PeerSupportMessage_organizationId_fkey", ADD CONSTRAINT "PeerSupportMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
