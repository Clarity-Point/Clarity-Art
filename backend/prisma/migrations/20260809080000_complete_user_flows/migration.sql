-- Persist fractional sleep values entered by the UI.
ALTER TABLE "Profile"
ALTER COLUMN "sleepHours" TYPE DOUBLE PRECISION
USING "sleepHours"::DOUBLE PRECISION;

-- Lesson checkmarks must survive a page reload.
ALTER TABLE "CourseProgress"
ADD COLUMN "completedLessons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Preserve artwork and the optional extended reflection as one record.
ALTER TABLE "ImageAnalysis"
ADD COLUMN "originalImageName" TEXT,
ADD COLUMN "extendedQuestions" JSONB,
ADD COLUMN "extendedAnalysisText" TEXT;
