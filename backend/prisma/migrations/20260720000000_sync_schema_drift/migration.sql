-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'THERAPIST';

-- AlterTable
ALTER TABLE "ChatSession" DROP COLUMN "messages",
ADD COLUMN     "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "title" TEXT,
ADD COLUMN     "tokensCompletion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tokensPrompt" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DiaryEntry" ADD COLUMN     "tags" TEXT[];

-- AlterTable
ALTER TABLE "ImageAnalysis" ADD COLUMN     "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "tokensCompletion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tokensPrompt" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "attentionScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "heartRateAvg" INTEGER,
ADD COLUMN     "isSharedWithTherapist" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sleepHours" INTEGER,
ADD COLUMN     "stepsCount" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "therapistId" TEXT;

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokensPrompt" INTEGER NOT NULL DEFAULT 0,
    "tokensCompletion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentimentTrend" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "tags" TEXT[],
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentimentTrend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeerSupportMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorTitle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeerSupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_title_key" ON "Achievement"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_userId_homeworkId_key" ON "Submission"("userId", "homeworkId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentimentTrend" ADD CONSTRAINT "SentimentTrend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerSupportMessage" ADD CONSTRAINT "PeerSupportMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

