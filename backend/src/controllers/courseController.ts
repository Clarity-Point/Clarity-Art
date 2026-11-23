import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { progressSchema, homeworkSubmissionSchema } from '../schemas';
import { checkAchievements } from '../middleware/gamification';
import {
  courseProgressContent,
  getCanonicalProgress,
  persistCourseProgress,
  runCourseWrite,
} from '../services/courseProgressService';

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
export const getAllCourses = async (req: AuthRequest, res: Response) => {
  const courses = await prisma.course.findMany({
    where: req.user?.role === 'ADMIN' ? {} : { archivedAt: null },
    include: {
      modules: {
        include: { lessons: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } },
        orderBy: { order: 'asc' },
      },
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
};

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
export const getCourseBySlug = async (req: AuthRequest, res: Response) => {
  const slug = req.params.slug as string;
  const course = await prisma.course.findUnique({
    where: { slug },
    include: {
      modules: {
        include: { lessons: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } },
        orderBy: { order: 'asc' },
      },
      homework: true,
    },
  });

  if (!course) return res.status(404).json({ error: 'Course not found' });

  res.json({
    ...course,
    id: course.slug,
    relatedHomework: course.homework,
  });
};

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
 *               completedLessons:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Progress updated.
 */
export const updateProgress = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const courseSlug = req.params.courseSlug as string;
  const validation = progressSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error.format() });

  const { completedLessons } = validation.data;
  const userId = req.user.id;
  const result = await runCourseWrite(async (tx) => {
    const course = await tx.course.findUnique({
      where: { slug: courseSlug },
      select: courseProgressContent,
    });
    if (!course) return { status: 404, error: 'Course not found' } as const;

    const canonical = await getCanonicalProgress(tx, course, userId, completedLessons);
    if (canonical.completedLessons.length !== new Set(completedLessons).size) {
      return { status: 400, error: 'One or more lessons do not belong to this course' } as const;
    }

    const previous = await tx.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
      select: { rewardedProgress: true },
    });
    const { progressPointsAwarded } = await persistCourseProgress(
      tx,
      userId,
      course.id,
      canonical,
      previous?.rewardedProgress ?? 0,
    );
    if (progressPointsAwarded > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { points: { increment: progressPointsAwarded } },
      });
    }
    return { status: 200, canonical, progressPointsAwarded } as const;
  });
  if (result.status !== 200) return res.status(result.status).json({ error: result.error });
  if (result.progressPointsAwarded > 0 || result.canonical.progress === 100)
    await Promise.allSettled([checkAchievements(userId)]);
  res.json({ message: 'Progress updated', ...result.canonical });
};

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
export const submitHomework = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const validation = homeworkSubmissionSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error.format() });

  const { homeworkId, submittedContent } = validation.data;
  const userId = req.user.id;
  const result = await runCourseWrite(async (tx) => {
    const homework = await tx.homework.findUnique({
      where: { id: homeworkId },
      select: { course: { select: { ...courseProgressContent, slug: true, title: true } } },
    });
    if (!homework) return null;
    const { course } = homework;

    const inserted = await tx.submission.createMany({
      data: { userId, homeworkId, submittedContent },
      skipDuplicates: true,
    });
    const where = { userId_homeworkId: { userId, homeworkId } };
    const previousSubmission = await tx.submission.findUniqueOrThrow({ where });
    const submission = inserted.count
      ? previousSubmission
      : await tx.submission.update({
          where,
          data: {
            submittedContent,
            submissionDate: new Date(
              Math.max(Date.now(), previousSubmission.submissionDate.getTime() + 1),
            ),
            grade: null,
            analysisText: null,
          },
        });
    const currentProgress = await tx.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
      select: { completedLessons: true, rewardedProgress: true },
    });
    const canonical = await getCanonicalProgress(
      tx,
      course,
      userId,
      currentProgress?.completedLessons ?? [],
    );
    const { courseProgress, progressPointsAwarded } = await persistCourseProgress(
      tx,
      userId,
      course.id,
      canonical,
      currentProgress?.rewardedProgress ?? 0,
    );
    const pointsAwarded = inserted.count === 1 ? 30 : 0;
    const totalPointsAwarded = pointsAwarded + progressPointsAwarded;
    if (totalPointsAwarded > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { points: { increment: totalPointsAwarded } },
      });
    }

    return {
      submission,
      pointsAwarded,
      progressPointsAwarded,
      courseProgress: {
        courseId: course.slug,
        courseName: course.title,
        progress: courseProgress.progress,
        completedLessons: courseProgress.completedLessons,
        lastLessonId: courseProgress.lastLessonId,
        lastAccessed: courseProgress.lastAccessed,
      },
    };
  });

  if (!result) return res.status(404).json({ error: 'Homework not found' });
  if (
    result.pointsAwarded + result.progressPointsAwarded > 0 ||
    result.courseProgress.progress === 100
  ) {
    await Promise.allSettled([checkAchievements(userId)]);
  }
  res.json({ message: 'Homework submitted', ...result });
};

export const saveCoursePosition = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.sendStatus(401);
  const lessonId = typeof req.body?.lessonId === 'string' ? req.body.lessonId : '';
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, module: { course: { slug: req.params.courseSlug as string } } },
    select: { id: true, module: { select: { courseId: true } } },
  });
  if (!lesson) return res.status(404).json({ error: 'Урок не найден в этом курсе' });
  await prisma.courseProgress.upsert({
    where: { userId_courseId: { userId: req.user.id, courseId: lesson.module.courseId } },
    create: { userId: req.user.id, courseId: lesson.module.courseId, lastLessonId: lesson.id },
    update: { lastLessonId: lesson.id, lastAccessed: new Date() },
  });
  res.status(204).end();
};

export const getHomework = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.sendStatus(401);
  const homework = await prisma.homework.findUnique({
    where: { id: req.params.id as string },
    include: {
      course: { select: { slug: true, title: true } },
      submissions: {
        where: { userId: req.user.id },
        select: { submittedContent: true, submissionDate: true, grade: true, analysisText: true },
      },
    },
  });
  if (!homework) return res.status(404).json({ error: 'Задание не найдено' });
  res.json({
    id: homework.id,
    title: homework.title,
    description: homework.description,
    courseSlug: homework.course.slug,
    courseTitle: homework.course.title,
    submission: homework.submissions[0] || null,
  });
};
