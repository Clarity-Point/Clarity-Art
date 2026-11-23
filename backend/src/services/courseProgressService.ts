import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';

export interface CanonicalCourseProgress {
  completedLessons: string[];
  progress: number;
}

/** Calculate progress exclusively from course-owned lesson IDs and DB homework. */
export function calculateCourseProgress(
  requestedLessonIds: string[],
  courseLessonIds: string[],
  submittedHomeworkCount: number,
  totalHomeworkCount: number,
): CanonicalCourseProgress {
  const validLessons = new Set(courseLessonIds);
  const completedLessons = [...new Set(requestedLessonIds)].filter((id) => validLessons.has(id));
  const boundedHomeworkCount = Math.min(Math.max(0, submittedHomeworkCount), totalHomeworkCount);
  const totalItems = courseLessonIds.length + totalHomeworkCount;
  const completedItems = completedLessons.length + boundedHomeworkCount;

  if (totalItems === 0) return { completedLessons, progress: 0 };
  const rounded = Math.round((completedItems / totalItems) * 100);
  const progress = completedItems === totalItems ? 100 : Math.min(99, rounded);
  return { completedLessons, progress };
}

export const courseProgressContent = {
  id: true,
  modules: { select: { lessons: { select: { id: true } } } },
  _count: { select: { homework: true } },
} satisfies Prisma.CourseSelect;

type CourseContent = Prisma.CourseGetPayload<{ select: typeof courseProgressContent }>;

export async function getCanonicalProgress(
  tx: Prisma.TransactionClient,
  course: CourseContent,
  userId: string,
  completedLessons: string[],
) {
  const submittedHomeworkCount = await tx.submission.count({
    where: { userId, homework: { courseId: course.id } },
  });
  return calculateCourseProgress(
    completedLessons,
    course.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id)),
    submittedHomeworkCount,
    course._count.homework,
  );
}

export async function persistCourseProgress(
  tx: Prisma.TransactionClient,
  userId: string,
  courseId: string,
  canonical: CanonicalCourseProgress,
  previousRewarded: number,
) {
  const rewardedProgress = Math.max(previousRewarded, canonical.progress);
  const data = { ...canonical, rewardedProgress, lastAccessed: new Date() };
  const courseProgress = await tx.courseProgress.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: data,
    create: { userId, courseId, ...data },
  });
  return { courseProgress, progressPointsAwarded: (rewardedProgress - previousRewarded) * 2 };
}

const COURSE_WRITE_ATTEMPTS = 5;

export async function runCourseWrite<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034')
        throw error;
      if (attempt >= COURSE_WRITE_ATTEMPTS) {
        throw Object.assign(new Error('Прогресс изменился одновременно. Повторите сохранение.'), {
          statusCode: 409,
        });
      }
    }
  }
}
