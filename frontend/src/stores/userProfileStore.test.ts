import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  recordActivity: vi.fn(),
}));

vi.mock('axios', () => ({ default: { post: mocks.post, put: mocks.put, delete: mocks.delete } }));
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
  it('does not insert an old account’s pending diary entry into a new profile', async () => {
    let resolve!: (value: unknown) => void;
    mocks.post.mockReturnValue(
      new Promise((yes) => {
        resolve = yes;
      }),
    );
    const store = useUserProfileStore();
    const pending = store.addDiaryEntry('Private old-account text');
    store.resetProfile();
    store.hydrateProfile({ name: 'New account' });
    resolve({ data: { id: 'entry-1', content: 'Private old-account text', date: '2026-10-16' } });
    expect(await pending).toBe(false);
    expect(store.profile.name).toBe('New account');
    expect(store.profile.diaryEntries).toEqual([]);
    expect(mocks.recordActivity).not.toHaveBeenCalled();
  });

  it('keeps an edited entry on its original day and uses server analysis', async () => {
    const store = useUserProfileStore();
    store.hydrateProfile({
      diaryEntries: [{ id: 'entry-1', text: 'Before', date: '2026-09-01T09:00:00Z' }],
    });
    mocks.put.mockResolvedValue({
      data: { content: 'After', date: '2026-09-01T09:00:00Z', riskLevel: 'low' },
    });
    expect(await store.updateDiaryEntry('entry-1', { text: 'After' })).toBe(true);
    expect(store.profile.diaryEntries[0]).toMatchObject({
      text: 'After',
      date: '2026-09-01T09:00:00Z',
      analysis: { mood: 'low' },
    });
  });
  it.each(['profile', 'course', 'homework', 'edit-diary', 'delete-diary'] as const)(
    'ignores a stale %s mutation after switching accounts',
    async (operation) => {
      let resolve!: (value: unknown) => void;
      const promise = new Promise((yes) => {
        resolve = yes;
      });
      mocks.post.mockReturnValue(promise);
      mocks.put.mockReturnValue(promise);
      mocks.delete.mockReturnValue(promise);
      const store = useUserProfileStore();
      store.hydrateProfile({
        name: 'Old user',
        diaryEntries: [{ id: 'entry-1', text: 'Old text', date: '2026-09-01' }],
      });
      const operations = {
        profile: () => store.updateProfile({ name: 'Old changed name' }),
        course: () =>
          store.updateCourseProgress({
            courseId: 'course-1',
            courseName: 'Course',
            progress: 0,
            lastAccessed: '2026-10-16',
          }),
        homework: () =>
          store.addHomeworkSubmission({
            homeworkId: 'homework-1',
            homeworkTitle: 'Homework',
            submittedContent: 'Old answer',
          }),
        'edit-diary': () => store.updateDiaryEntry('entry-1', { text: 'Old changed text' }),
        'delete-diary': () => store.deleteDiaryEntry('entry-1'),
      };
      const pending = operations[operation]();
      store.resetProfile();
      store.hydrateProfile({
        name: 'New user',
        diaryEntries: [{ id: 'entry-1', text: 'New text', date: '2026-10-16' }],
      });
      resolve({ data: {} });
      expect(await pending).toBe(false);
      expect(store.profile.name).toBe('New user');
      expect(store.profile.diaryEntries[0].text).toBe('New text');
      expect(store.profile.courseProgress).toEqual([]);
      expect(store.profile.homeworkHistory).toEqual([]);
    },
  );
});
