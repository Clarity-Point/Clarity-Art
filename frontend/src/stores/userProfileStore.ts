import { ref } from 'vue';
import { defineStore } from 'pinia';
import { useAnalyticsStore } from './analyticsStore';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export type UserCategory = 'adult' | 'child' | 'svo_participant' | 'general';

export interface ImageAnalysisEntry {
  id?: string;
  isPublic?: boolean;
  timestamp: string;
  imagePreviewUrl: string;
  analysisText: string;
  originalImageName?: string;
  extendedQuestions?: Array<{
    questionText: string;
    rationale?: string;
    answer: string;
  }>;
  extendedAnalysisText?: string;
}

export interface CourseProgressEntry {
  courseId: string;
  courseName: string;
  progress: number;
  completedDate?: string;
  lastAccessed: string;
  completedLessons?: string[];
}

export interface HomeworkEntry {
  homeworkId: string;
  homeworkTitle: string;
  submissionDate: string;
  submittedContent: string;
  analysisText?: string;
  grade?: string;
}

export interface DiaryEntry {
  id: string;
  date: string;
  text: string;
  analysis?: {
    mood?: string;
    keyThemes?: string[];
    sentimentScore?: number;
  };
}

export interface AchievementEntry {
  id: string;
  title: string;
  description: string;
  icon: string;
  earned: boolean;
  earnedAt?: string;
}

export interface UserProfile {
  organizationId?: string;
  role?: string;
  name: string;
  age: number | null;
  therapyGoals: string;
  mainConcerns: string;
  preferredStyle: string;
  category: UserCategory;
  interests: string[];
  preferences: string;
  additionalInfo: string;
  points: number;
  streak: number;
  avatarLevel: number;
  // Health
  sleepHours: number;
  stepsCount: number;
  heartRateAvg: number;
  isSharedWithTherapist: boolean;
  aiDataConsentAt?: string | null;
  therapistId?: string;
  imageAnalysisHistory: ImageAnalysisEntry[];
  courseProgress: CourseProgressEntry[];
  homeworkHistory: HomeworkEntry[];
  diaryEntries: DiaryEntry[];
  achievements: AchievementEntry[];
  chatSessions: Array<Array<{ text: string; sender: 'user' | 'ИИ'; timestamp?: string }>>;
  dataTruncated?: { diary: boolean; images: boolean; chats: boolean; homework: boolean };
}

export const useUserProfileStore = defineStore('userProfile', () => {
  const getInitialProfile = (): UserProfile => {
    // Do not restore sensitive profile, diary or chat data from browser storage.
    // Remove stale data written by pre-hardening versions on next application load.
    localStorage.removeItem('userProfileData');

    return {
      name: '',
      age: null,
      therapyGoals: '',
      mainConcerns: '',
      preferredStyle: 'neutral',
      category: 'general',
      interests: [],
      preferences: '',
      additionalInfo: '',
      points: 0,
      streak: 0,
      avatarLevel: 1,
      sleepHours: 0,
      stepsCount: 0,
      heartRateAvg: 0,
      isSharedWithTherapist: false,
      imageAnalysisHistory: [],
      courseProgress: [],
      homeworkHistory: [],
      diaryEntries: [],
      achievements: [],
      chatSessions: [],
    };
  };

  const profile = ref<UserProfile>(getInitialProfile());
  let profileRevision = 0;
  const analyticsStore = useAnalyticsStore();
  const moodTheme = ref('default');

  /**
   * Reflects crisis risk in the UI via a `data-mood` attribute on <html>.
   *
   * This previously wrote --primary-color/--bg-soft as INLINE styles on the root
   * element. Inline styles outrank every stylesheet rule and were never cleared,
   * so a single call permanently pinned the palette to hardcoded light-theme
   * values and the light/dark toggle stopped having any effect. Driving an
   * attribute instead lets theme.css define mood palettes per theme, and the
   * state is fully reversible.
   */
  function updateMoodTheme(riskLevel: string) {
    if (riskLevel === 'high') moodTheme.value = 'crisis';
    else if (riskLevel === 'medium') moodTheme.value = 'warn';
    else moodTheme.value = 'calm';

    document.documentElement.setAttribute('data-mood', moodTheme.value);
  }

  /** Clear the mood tint and fall back to the plain theme palette. */
  function resetMoodTheme() {
    moodTheme.value = 'default';
    document.documentElement.removeAttribute('data-mood');
  }

  /**
   * Merge server-provided profile data into local state WITHOUT writing back.
   * Use when hydrating from GET /api/profile or a login response — echoing that
   * payload through updateProfile would issue a pointless PUT on every page load.
   */
  function hydrateProfile(serverProfile: Partial<UserProfile>) {
    profile.value = {
      ...getInitialProfile(),
      ...serverProfile,
      name: serverProfile.name || '',
      age: serverProfile.age ?? null,
      therapyGoals: serverProfile.therapyGoals || '',
      mainConcerns: serverProfile.mainConcerns || '',
      preferences: serverProfile.preferences || '',
      additionalInfo: serverProfile.additionalInfo || '',
      sleepHours: serverProfile.sleepHours ?? 0,
      stepsCount: serverProfile.stepsCount ?? 0,
      heartRateAvg: serverProfile.heartRateAvg ?? 0,
      interests: Array.isArray(serverProfile.interests) ? serverProfile.interests : [],
      imageAnalysisHistory: Array.isArray(serverProfile.imageAnalysisHistory)
        ? serverProfile.imageAnalysisHistory
        : [],
      courseProgress: Array.isArray(serverProfile.courseProgress)
        ? serverProfile.courseProgress
        : [],
      homeworkHistory: Array.isArray(serverProfile.homeworkHistory)
        ? serverProfile.homeworkHistory
        : [],
      diaryEntries: Array.isArray(serverProfile.diaryEntries) ? serverProfile.diaryEntries : [],
      achievements: Array.isArray(serverProfile.achievements) ? serverProfile.achievements : [],
      chatSessions: Array.isArray(serverProfile.chatSessions) ? serverProfile.chatSessions : [],
    };
  }

  function resetProfile() {
    profileRevision++;
    profile.value = getInitialProfile();
    resetMoodTheme();
  }

  async function updateProfile(newProfile: Partial<UserProfile>): Promise<boolean> {
    const revision = profileRevision;
    try {
      await axios.put(`${API_URL}/profile`, newProfile);
      if (revision !== profileRevision) return false;
      profile.value = { ...profile.value, ...newProfile };
      return true;
    } catch (e) {
      console.error('Failed to sync profile with backend', e);
      return false;
    }
  }

  async function updateCourseProgress(progressEntry: CourseProgressEntry): Promise<boolean> {
    const revision = profileRevision;
    try {
      const response = await axios.post(`${API_URL}/courses/${progressEntry.courseId}/progress`, {
        completedLessons: progressEntry.completedLessons || [],
      });
      if (revision !== profileRevision) return false;
      progressEntry = {
        ...progressEntry,
        progress: response.data.progress,
        completedLessons: response.data.completedLessons,
        completedDate: response.data.progress === 100 ? new Date().toISOString() : undefined,
        lastAccessed: new Date().toISOString(),
      };
    } catch (e) {
      console.error('Failed to sync course progress with backend', e);
      return false;
    }

    if (!Array.isArray(profile.value.courseProgress)) {
      profile.value.courseProgress = [];
    }
    const index = profile.value.courseProgress.findIndex(
      (cp) => cp.courseId === progressEntry.courseId,
    );
    if (index > -1) {
      profile.value.courseProgress[index] = {
        ...profile.value.courseProgress[index],
        ...progressEntry,
      };
    } else {
      profile.value.courseProgress.push(progressEntry);
    }

    analyticsStore.recordActivity();
    return true;
  }

  async function addHomeworkSubmission(
    submission: Omit<HomeworkEntry, 'submissionDate'>,
  ): Promise<boolean> {
    const revision = profileRevision;
    const newSubmission: HomeworkEntry = {
      ...submission,
      submissionDate: new Date().toISOString(),
    };

    try {
      const response = await axios.post(`${API_URL}/homework`, submission);
      if (revision !== profileRevision) return false;
      newSubmission.submissionDate =
        response.data.submission?.submissionDate || newSubmission.submissionDate;
      if (response.data.courseProgress) {
        const canonicalProgress = response.data.courseProgress as CourseProgressEntry;
        const progressIndex = profile.value.courseProgress.findIndex(
          (item) => item.courseId === canonicalProgress.courseId,
        );
        if (progressIndex >= 0) profile.value.courseProgress[progressIndex] = canonicalProgress;
        else profile.value.courseProgress.push(canonicalProgress);
      }
    } catch (e) {
      console.error('Failed to sync homework with backend', e);
      return false;
    }

    if (!Array.isArray(profile.value.homeworkHistory)) profile.value.homeworkHistory = [];
    profile.value.homeworkHistory = profile.value.homeworkHistory.filter(
      (item) => item.homeworkId !== submission.homeworkId,
    );
    profile.value.homeworkHistory.unshift(newSubmission);
    analyticsStore.recordActivity();
    return true;
  }

  async function addDiaryEntry(entryText: string): Promise<boolean> {
    const revision = profileRevision;
    try {
      const response = await axios.post(`${API_URL}/diary`, { content: entryText });
      if (revision !== profileRevision) return false;
      const newEntry: DiaryEntry = {
        id: response.data.id,
        date: response.data.date,
        text: response.data.content,
        analysis: { mood: response.data.riskLevel },
      };
      profile.value.diaryEntries.unshift(newEntry);
      profile.value.points += 10; // Immediate feedback
      analyticsStore.recordActivity();
      return true;
    } catch (e) {
      console.error('Failed to sync diary with backend', e);
      return false;
    }
  }

  async function updateDiaryEntry(entryId: string, updates: Partial<DiaryEntry>): Promise<boolean> {
    const revision = profileRevision;
    const index = profile.value.diaryEntries.findIndex((e) => e.id === entryId);
    if (index > -1) {
      try {
        const response = await axios.put(`${API_URL}/diary/${entryId}`, { content: updates.text });
        if (revision !== profileRevision) return false;
        // Use the authoritative original date and refreshed analysis. Editing
        // a past entry must not silently move it to today's calendar cell.
        const currentIndex = profile.value.diaryEntries.findIndex((entry) => entry.id === entryId);
        if (currentIndex < 0) return false;
        const current = profile.value.diaryEntries[currentIndex];
        profile.value.diaryEntries[currentIndex] = {
          ...current,
          text: response.data.content,
          date: response.data.date,
          analysis: { ...current.analysis, mood: response.data.riskLevel },
        };
      } catch (e) {
        console.error('Failed to update diary on backend', e);
        return false;
      }

      analyticsStore.recordActivity();
      return true;
    }
    return false;
  }

  async function deleteDiaryEntry(entryId: string): Promise<boolean> {
    const revision = profileRevision;
    try {
      await axios.delete(`${API_URL}/diary/${entryId}`);
      if (revision !== profileRevision) return false;
    } catch (e) {
      console.error('Failed to delete diary from backend', e);
      return false;
    }

    profile.value.diaryEntries = profile.value.diaryEntries.filter((e) => e.id !== entryId);
    analyticsStore.recordActivity();
    return true;
  }

  function addImageAnalysis(entry: Omit<ImageAnalysisEntry, 'timestamp'> & { timestamp?: string }) {
    const newEntry: ImageAnalysisEntry = {
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    };
    if (!Array.isArray(profile.value.imageAnalysisHistory)) {
      profile.value.imageAnalysisHistory = [];
    }
    profile.value.imageAnalysisHistory.unshift(newEntry);
    profile.value.points += 15; // Local points
    analyticsStore.recordActivity();
  }

  function updateImageAnalysis(timestamp: string, updates: Partial<ImageAnalysisEntry>) {
    if (!Array.isArray(profile.value.imageAnalysisHistory)) return;
    const index = profile.value.imageAnalysisHistory.findIndex((e) => e.timestamp === timestamp);
    if (index > -1) {
      profile.value.imageAnalysisHistory[index] = {
        ...profile.value.imageAnalysisHistory[index],
        ...updates,
      };
    }
  }

  return {
    profile,
    moodTheme,
    updateMoodTheme,
    resetMoodTheme,
    updateProfile,
    hydrateProfile,
    resetProfile,
    updateCourseProgress,
    addHomeworkSubmission,
    addDiaryEntry,
    updateDiaryEntry,
    deleteDiaryEntry,
    addImageAnalysis,
    updateImageAnalysis,
  };
});
