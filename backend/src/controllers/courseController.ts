import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { progressSchema, homeworkSubmissionSchema } from '../schemas';
import { checkAchievements } from '../middleware/gamification';
import { asyncHandler } from '../middleware/asyncHandler';
import { calculateCourseProgress } from '../services/courseProgressService';

/**
 * @openapi
 * /api/courses:
 *   get:
 *     summary: Retrieve a list of all courses
 *     tags: [Courses]
 *     responses:
 *       200:
 *         description: A list of courses.
 */
export const getAllCourses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const courses = await prisma.course.findMany({
    include: {
      modules: { include: { lessons: true }, orderBy: { order: 'asc' } },
      homework: true,
    },
  });

  const formatted = courses.map((c) => ({
    ...c,
    modules: c.modules.map((m) => ({
      ...m,
      lessons: m.lessons,
    })),
    relatedHomework: c.homework,
  }));

  res.json(formatted);
});

/**
 * @openapi
 * /api/courses/{slug}:
 *   get:
 *     summary: Get a course by slug
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course details.
 *       404:
 *         description: Course not found.
 */
export const getCourseBySlug = asyncHandler(async (req: AuthRequest, res: Response) => {
  const slug = req.params.slug as string;
  const course = await prisma.course.findUnique({
    where: { slug },
    include: {
      modules: { include: { lessons: true }, orderBy: { order: 'asc' } },
      homework: true,
    },
  });

  if (!course) return res.status(404).json({ error: 'Course not found' });

  res.json({
    ...course,
    id: course.slug,
    relatedHomework: course.homework,
  });
});

/**
 * @openapi
 * /api/courses/{courseSlug}/progress:
 *   post:
 *     summary: Update course progress
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseSlug
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               progress:
 *                 type: number
 *               lastAccessed:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Progress updated.
 */
export const updateProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const courseSlug = req.params.courseSlug as string;
  const validation = progressSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error.format() });

  const { completedLessons } = validation.data;

  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    include: {
      modules: { select: { lessons: { select: { id: true } } } },
      homework: { select: { id: true } },
    },
  });
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const courseLessonIds = course.modules.flatMap((module) =>
    module.lessons.map((lesson) => lesson.id),
  );
  const submittedHomeworkCount = await prisma.submission.count({
    where: { userId: req.user.id, homework: { courseId: course.id } },
  });
  const canonical = calculateCourseProgress(
    completedLessons,
    courseLessonIds,
    submittedHomeworkCount,
    course.homework.length,
  );

  if (canonical.completedLessons.length !== new Set(completedLessons).size) {
    return res.status(400).json({ error: 'One or more lessons do not belong to this course' });
  }

  const diff = await prisma.$transaction(
    async (tx) => {
      const oldProgress = await tx.courseProgress.findUnique({
        where: { userId_courseId: { userId: req.user!.id, courseId: course.id } },
      });
      const previousRewarded = oldProgress?.rewardedProgress || 0;
      const nextRewarded = Math.max(previousRewarded, canonical.progress);

      await tx.courseProgress.upsert({
        where: { userId_courseId: { userId: req.user!.id, courseId: course.id } },
        update: {
          progress: canonical.progress,
          rewardedProgress: nextRewarded,
          completedLessons: canonical.completedLessons,
          lastAccessed: new Date(),
        },
        create: {
          userId: req.user!.id,
          courseId: course.id,
          progress: canonical.progress,
          rewardedProgress: nextRewarded,
          completedLessons: canonical.completedLessons,
          lastAccessed: new Date(),
        },
      });

      const earnedProgress = nextRewarded - previousRewarded;
      if (earnedProgress > 0) {
        await tx.user.update({
          where: { id: req.user!.id },
          data: { points: { increment: earnedProgress * 2 } },
        });
      }
      return earnedProgress;
    },
    { isolationLevel: 'Serializable' },
  );
  if (diff > 0) await Promise.allSettled([checkAchievements(req.user.id)]);

  res.json({
    message: 'Progress updated',
    progress: canonical.progress,
    completedLessons: canonical.completedLessons,
  });
});

/**
 * @openapi
 * /api/homework:
 *   post:
 *     summary: Submit homework
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               homeworkId:
 *                 type: string
 *               submittedContent:
 *                 type: string
 *     responses:
 *       200:
 *         description: Homework submitted.
 */
export const submitHomework = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const validation = homeworkSubmissionSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error.format() });

  const { homeworkId, submittedContent } = validation.data;

  const homework = await prisma.homework.findUnique({
    where: { id: homeworkId },
    include: {
      course: {
        include: {
          modules: { select: { lessons: { select: { id: true } } } },
          homework: { select: { id: true } },
        },
      },
    },
  });
  if (!homework) return res.status(404).json({ error: 'Homework not found' });
  const courseLessonIds = homework.course.modules.flatMap((module) =>
    module.lessons.map((lesson) => lesson.id),
  );

  // Homework is one submission per user (schema @@unique). Allow re-submission by
  // updating in place, but award the 30 points only the first time so they can't
  // be farmed by submitting repeatedly.
  const result = await prisma.$transaction(
    async (tx) => {
      const inserted = await tx.submission.createMany({
        data: {
          userId: req.user!.id,
          homeworkId,
          submittedContent,
          submissionDate: new Date(),
        },
        skipDuplicates: true,
      });
      const submission = await tx.submission.update({
        where: { userId_homeworkId: { userId: req.user!.id, homeworkId } },
        data: { submittedContent, submissionDate: new Date() },
      });
      const currentProgress = await tx.courseProgress.findUnique({
        where: {
          userId_courseId: { userId: req.user!.id, courseId: homework.courseId },
        },
      });
      const submittedHomeworkCount = await tx.submission.count({
        where: { userId: req.user!.id, homework: { courseId: homework.courseId } },
      });
      const canonical = calculateCourseProgress(
        currentProgress?.completedLessons || [],
        courseLessonIds,
        submittedHomeworkCount,
        homework.course.homework.length,
      );
      const previousRewarded = currentProgress?.rewardedProgress || 0;
      const nextRewarded = Math.max(previousRewarded, canonical.progress);
      const progressPointsAwarded = (nextRewarded - previousRewarded) * 2;
      const courseProgress = await tx.courseProgress.upsert({
        where: {
          userId_courseId: { userId: req.user!.id, courseId: homework.courseId },
        },
        update: {
          ...canonical,
          rewardedProgress: nextRewarded,
          lastAccessed: new Date(),
        },
        create: {
          userId: req.user!.id,
          courseId: homework.courseId,
          ...canonical,
          rewardedProgress: nextRewarded,
          lastAccessed: new Date(),
        },
      });
      const homeworkPointsAwarded = inserted.count === 1 ? 30 : 0;
      const totalPointsAwarded = homeworkPointsAwarded + progressPointsAwarded;
      if (totalPointsAwarded > 0) {
        await tx.user.update({
          where: { id: req.user!.id },
          data: { points: { increment: totalPointsAwarded } },
        });
      }
      return {
        submission,
        pointsAwarded: homeworkPointsAwarded,
        progressPointsAwarded,
        courseProgress: {
          courseId: homework.course.slug,
          courseName: homework.course.title,
          progress: courseProgress.progress,
          completedLessons: courseProgress.completedLessons,
          lastAccessed: courseProgress.lastAccessed,
        },
      };
    },
    { isolationLevel: 'Serializable' },
  );

  if (result.pointsAwarded + result.progressPointsAwarded > 0) {
    await Promise.allSettled([checkAchievements(req.user.id)]);
  }
  res.json({ message: 'Homework submitted', ...result });
});
