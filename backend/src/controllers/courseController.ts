import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { progressSchema, homeworkSubmissionSchema } from '../schemas';
import { checkAchievements } from '../middleware/gamification';
import { asyncHandler } from '../middleware/asyncHandler';

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

  const { progress, lastAccessed, completedLessons } = validation.data;

  const course = await prisma.course.findUnique({ where: { slug: courseSlug } });
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const diff = await prisma.$transaction(
    async (tx) => {
      const oldProgress = await tx.courseProgress.findUnique({
        where: { userId_courseId: { userId: req.user!.id, courseId: course.id } },
      });
      const previousRewarded = oldProgress?.rewardedProgress || 0;
      const nextRewarded = Math.max(previousRewarded, progress);
      const persistedProgress = Math.max(oldProgress?.progress || 0, progress);
      const persistedLessons = completedLessons
        ? [...new Set([...(oldProgress?.completedLessons || []), ...completedLessons])]
        : oldProgress?.completedLessons || [];

      await tx.courseProgress.upsert({
        where: { userId_courseId: { userId: req.user!.id, courseId: course.id } },
        update: {
          progress: persistedProgress,
          rewardedProgress: nextRewarded,
          completedLessons: persistedLessons,
          lastAccessed: lastAccessed ? new Date(lastAccessed) : new Date(),
        },
        create: {
          userId: req.user!.id,
          courseId: course.id,
          progress: persistedProgress,
          rewardedProgress: nextRewarded,
          completedLessons: persistedLessons,
          lastAccessed: lastAccessed ? new Date(lastAccessed) : new Date(),
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
  if (diff > 0) await checkAchievements(req.user.id);

  res.json({ message: 'Progress updated' });
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
      if (inserted.count === 1) {
        await tx.user.update({
          where: { id: req.user!.id },
          data: { points: { increment: 30 } },
        });
      }
      return { submission, pointsAwarded: inserted.count === 1 ? 30 : 0 };
    },
    { isolationLevel: 'Serializable' },
  );

  if (result.pointsAwarded > 0) await checkAchievements(req.user.id);
  res.json({ message: 'Homework submitted', ...result });
});
