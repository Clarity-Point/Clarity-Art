-- Track the reward high-water mark separately so users may uncheck lessons
-- without enabling repeated point awards when they check them again.
ALTER TABLE "CourseProgress"
ADD COLUMN "rewardedProgress" INTEGER NOT NULL DEFAULT 0;

UPDATE "CourseProgress"
SET "rewardedProgress" = "progress";
