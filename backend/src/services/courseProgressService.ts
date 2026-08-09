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

  return {
    completedLessons,
    progress: totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100),
  };
}
