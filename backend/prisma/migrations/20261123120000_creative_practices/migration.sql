BEGIN;

-- CreateTable
CREATE TABLE "PracticeWork" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "practiceId" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "image" BYTEA,
    "imageMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeWorkRemoval" (
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "PracticeWorkRemoval_pkey" PRIMARY KEY ("userId","requestId")
);

-- CreateTable
CREATE TABLE "PracticeReflection" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeReflection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeCompletion" (
    "userId" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeCompletion_pkey" PRIMARY KEY ("userId","practiceId")
);

-- CreateTable
CREATE TABLE "PracticeShare" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PracticeShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeShareItem" (
    "shareId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "reflections" JSONB NOT NULL,
    "includesImage" BOOLEAN NOT NULL,

    CONSTRAINT "PracticeShareItem_pkey" PRIMARY KEY ("shareId","workId")
);

-- CreateIndex
CREATE INDEX "PracticeWork_userId_createdAt_id_idx" ON "PracticeWork"("userId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeWork_id_userId_key" ON "PracticeWork"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeWork_userId_requestId_key" ON "PracticeWork"("userId", "requestId");

-- CreateIndex
CREATE INDEX "PracticeReflection_workId_createdAt_id_idx" ON "PracticeReflection"("workId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PracticeShare_ownerId_revokedAt_createdAt_idx" ON "PracticeShare"("ownerId", "revokedAt", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeShare_therapistId_revokedAt_createdAt_id_idx" ON "PracticeShare"("therapistId", "revokedAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeShare_id_ownerId_key" ON "PracticeShare"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeShare_ownerId_requestId_key" ON "PracticeShare"("ownerId", "requestId");

-- CreateIndex
CREATE INDEX "PracticeShareItem_workId_ownerId_idx" ON "PracticeShareItem"("workId", "ownerId");

-- AddForeignKey
ALTER TABLE "PracticeWork" ADD CONSTRAINT "PracticeWork_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeWorkRemoval" ADD CONSTRAINT "PracticeWorkRemoval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeReflection" ADD CONSTRAINT "PracticeReflection_workId_fkey" FOREIGN KEY ("workId") REFERENCES "PracticeWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeCompletion" ADD CONSTRAINT "PracticeCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeShare" ADD CONSTRAINT "PracticeShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeShare" ADD CONSTRAINT "PracticeShare_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeShareItem" ADD CONSTRAINT "PracticeShareItem_shareId_ownerId_fkey" FOREIGN KEY ("shareId", "ownerId") REFERENCES "PracticeShare"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeShareItem" ADD CONSTRAINT "PracticeShareItem_workId_ownerId_fkey" FOREIGN KEY ("workId", "ownerId") REFERENCES "PracticeWork"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PracticeWork" ADD CONSTRAINT "PracticeWork_image_pair_check" CHECK (
  ("image" IS NULL AND "imageMimeType" IS NULL)
  OR (
    "image" IS NOT NULL
    AND "imageMimeType" IS NOT NULL
    AND "imageMimeType" IN ('image/png', 'image/jpeg', 'image/webp')
    AND octet_length("image") BETWEEN 1 AND 1048576
  )
);

COMMIT;
