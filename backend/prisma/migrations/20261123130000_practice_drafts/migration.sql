ALTER TABLE "PracticeWork" ADD COLUMN "finalizedDraftVersion" INTEGER;

CREATE TABLE "PracticeDraft" (
    "userId" TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "practiceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL CHECK ("version" > 0),
    "mutationId" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "mode" TEXT NOT NULL CHECK ("mode" IN ('paper', 'canvas')),
    "attachmentKind" TEXT,
    "image" BYTEA,
    "imageMimeType" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PracticeDraft_pkey" PRIMARY KEY ("userId", "practiceId"),
    CONSTRAINT "PracticeDraft_attachment_check" CHECK (
      ("image" IS NULL AND "imageMimeType" IS NULL AND "attachmentKind" IS NULL) OR
      ("image" IS NOT NULL AND "imageMimeType" IS NOT NULL AND "attachmentKind" IS NOT NULL
        AND octet_length("image") BETWEEN 1 AND 1048576
        AND "imageMimeType" IN ('image/png', 'image/jpeg', 'image/webp')
        AND "attachmentKind" IN ('canvas', 'photo'))
    )
);
