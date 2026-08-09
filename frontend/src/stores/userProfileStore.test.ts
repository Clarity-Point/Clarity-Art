import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({ post: vi.fn(), recordActivity: vi.fn() }));

vi.mock('axios', () => ({ default: { post: mocks.post } }));
vi.mock('./analyticsStore', () => ({
  useAnalyticsStore: () => ({ recordActivity: mocks.recordActivity }),
}));

import { useUserProfileStore } from './userProfileStore';

describe('user profile course progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { removeItem: vi.fn() },
    });
  });

  it('sends only lesson ids and stores the canonical progress returned by the server', async () => {
    const lessonId = '28bf2c7d-c1d3-4325-bad5-3943ddfead27';
    mocks.post.mockResolvedValue({
      data: { progress: 50, completedLessons: [lessonId] },
    });
    const store = useUserProfileStore();

    const saved = await store.updateCourseProgress({
      courseId: 'course-slug',
      courseName: 'Course',
      progress: 100,
      completedLessons: [lessonId],
      lastAccessed: '2026-08-01T00:00:00Z',
    });

    expect(saved).toBe(true);
    expect(mocks.post).toHaveBeenCalledWith('/api/courses/course-slug/progress', {
      completedLessons: [lessonId],
    });
    expect(store.profile.courseProgress[0]).toEqual(
      expect.objectContaining({ progress: 50, completedLessons: [lessonId] }),
    );
  });

  it('hydrates server-recalculated course progress after homework submission', async () => {
    mocks.post.mockResolvedValue({
      data: {
        submission: { submissionDate: '2026-08-02T00:00:00Z' },
        courseProgress: {
          courseId: 'course-slug',
          courseName: 'Course',
          progress: 50,
          completedLessons: [],
          lastAccessed: '2026-08-02T00:00:00Z',
        },
      },
    });
    const store = useUserProfileStore();

    const saved = await store.addHomeworkSubmission({
      homeworkId: '72225da8-3fa7-40ac-90ab-cd87ed7ea103',
      homeworkTitle: 'Reflection',
      submittedContent: 'Done',
    });

    expect(saved).toBe(true);
    expect(store.profile.courseProgress).toEqual([
      expect.objectContaining({ courseId: 'course-slug', progress: 50 }),
    ]);
  });
});
