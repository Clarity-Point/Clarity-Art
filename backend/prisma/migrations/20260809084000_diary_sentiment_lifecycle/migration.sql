-- Link derived diary analytics to their source entry. This lets edits replace
-- stale signals and lets account owners remove the derived data together with
-- the diary entry.
ALTER TABLE "SentimentTrend" ADD COLUMN "diaryEntryId" TEXT;

CREATE UNIQUE INDEX "SentimentTrend_diaryEntryId_key" ON "SentimentTrend"("diaryEntryId");

ALTER TABLE "SentimentTrend"
ADD CONSTRAINT "SentimentTrend_diaryEntryId_fkey"
FOREIGN KEY ("diaryEntryId") REFERENCES "DiaryEntry"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing trend rows predate source tracking and cannot be matched reliably.
-- Leave them as historical chat/general signals rather than guessing.

-- Older clients stored lesson titles in CourseProgress. Convert every title (or
-- already-canonical id) to a lesson id belonging to the same course.
UPDATE "CourseProgress" AS progress
SET "completedLessons" = COALESCE(
  (
    SELECT ARRAY_AGG(DISTINCT lesson."id")
    FROM "Lesson" AS lesson
    JOIN "Module" AS module ON module."id" = lesson."moduleId"
    WHERE module."courseId" = progress."courseId"
      AND (
        lesson."id" = ANY(progress."completedLessons")
        OR lesson."title" = ANY(progress."completedLessons")
      )
  ),
  ARRAY[]::TEXT[]
);
