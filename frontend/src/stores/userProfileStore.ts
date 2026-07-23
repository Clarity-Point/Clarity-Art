import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useAnalyticsStore } from './analyticsStore';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';
// The server decides whether a session cookie is valid; no browser token is read.
const shouldSyncToServer = () => true;

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
  therapistId?: string;
  imageAnalysisHistory: ImageAnalysisEntry[];
  courseProgress: CourseProgressEntry[];
  homeworkHistory: HomeworkEntry[];
  diaryEntries: DiaryEntry[];
  achievements: AchievementEntry[];
  chatSessions: Array<Array<{ text: string; sender: 'user' | 'ИИ'; timestamp?: string }>>;
}

export const useUserProfileStore = defineStore('userProfile', () => {
  const getInitialProfile = (): UserProfile => {
    // Do not restore sensitive profile, diary or chat data from browser storage.
    // Remove stale data written by pre-hardening versions on next application load.
    localStorage.removeItem('userProfileData');
    const savedProfile = null;
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        return {
          name: parsed.name || '',
          age: parsed.age || null,
          therapyGoals: parsed.therapyGoals || '',
          mainConcerns: parsed.mainConcerns || '',
          preferredStyle: parsed.preferredStyle || 'neutral',
          category: parsed.category || 'general',
          interests: Array.isArray(parsed.interests) ? parsed.interests : [],
          preferences: parsed.preferences || '',
          additionalInfo: parsed.additionalInfo || '',
          points: parsed.points || 0,
          streak: parsed.streak || 0,
          avatarLevel: parsed.avatarLevel || 1,
          sleepHours: parsed.sleepHours || 0,
          stepsCount: parsed.stepsCount || 0,
          heartRateAvg: parsed.heartRateAvg || 0,
          isSharedWithTherapist: parsed.isSharedWithTherapist || false,
          therapistId: parsed.therapistId || '',
          imageAnalysisHistory: Array.isArray(parsed.imageAnalysisHistory)
            ? parsed.imageAnalysisHistory
            : [],
          courseProgress: Array.isArray(parsed.courseProgress) ? parsed.courseProgress : [],
          homeworkHistory: Array.isArray(parsed.homeworkHistory) ? parsed.homeworkHistory : [],
          diaryEntries: Array.isArray(parsed.diaryEntries) ? parsed.diaryEntries : [],
          achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
          chatSessions: Array.isArray(parsed.chatSessions) ? parsed.chatSessions : [],
        };
      } catch (e) {
        console.error('Failed to parse user profile from localStorage', e);
      }
    }
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

  // Sensitive profile, diary and chat data are intentionally in-memory only.
  watch(profile, () => {}, { deep: true });

  /**
   * Merge server-provided profile data into local state WITHOUT writing back.
   * Use when hydrating from GET /api/profile or a login response — echoing that
   * payload through updateProfile would issue a pointless PUT on every page load.
   */
  function hydrateProfile(serverProfile: Partial<UserProfile>) {
    profile.value = { ...profile.value, ...serverProfile };
  }

  async function updateProfile(newProfile: Partial<UserProfile>) {
    profile.value = { ...profile.value, ...newProfile };
    if (shouldSyncToServer()) {
      try {
        await axios.put(`${API_URL}/profile`, newProfile);
      } catch (e) {
        console.error('Failed to sync profile with backend', e);
      }
    }
  }

  async function updateCourseProgress(progressEntry: CourseProgressEntry) {
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

    if (shouldSyncToServer()) {
      try {
        await axios.post(`${API_URL}/courses/${progressEntry.courseId}/progress`, progressEntry);
        analyticsStore.recordActivity();
      } catch (e) {
        console.error('Failed to sync course progress with backend', e);
      }
    }
  }

  async function addHomeworkSubmission(submission: Omit<HomeworkEntry, 'submissionDate'>) {
    const newSubmission: HomeworkEntry = {
      ...submission,
      submissionDate: new Date().toISOString(),
    };
    if (!Array.isArray(profile.value.homeworkHistory)) {
      profile.value.homeworkHistory = [];
    }
    profile.value.homeworkHistory.unshift(newSubmission);

    if (shouldSyncToServer()) {
      try {
        await axios.post(`${API_URL}/homework`, submission);
        analyticsStore.recordActivity();
      } catch (e) {
        console.error('Failed to sync homework with backend', e);
      }
    }
  }

  async function addDiaryEntry(entryText: string) {
    if (shouldSyncToServer()) {
      try {
        const response = await axios.post(`${API_URL}/diary`, { content: entryText });
        const newEntry: DiaryEntry = {
          id: response.data.id,
          date: response.data.date,
          text: response.data.content,
          analysis: response.data.riskLevel,
        };
        profile.value.diaryEntries.unshift(newEntry);
        profile.value.points += 10; // Immediate feedback
        analyticsStore.recordActivity();
      } catch (e) {
        console.error('Failed to sync diary with backend', e);
      }
    } else {
      const newEntry: DiaryEntry = {
        id: `diary-${Date.now()}`,
        date: new Date().toISOString(),
        text: entryText,
      };
      profile.value.diaryEntries.unshift(newEntry);
      profile.value.points += 10;
      analyticsStore.recordActivity();
    }
  }

  async function updateDiaryEntry(entryId: string, updates: Partial<DiaryEntry>) {
    const index = profile.value.diaryEntries.findIndex((e) => e.id === entryId);
    if (index > -1) {
      if (shouldSyncToServer() && !entryId.startsWith('diary-')) {
        try {
          await axios.put(`${API_URL}/diary/${entryId}`, { content: updates.text });
        } catch (e) {
          console.error('Failed to update diary on backend', e);
        }
      }

      const newUpdates = { ...updates };
      if (updates.text && profile.value.diaryEntries[index].text !== updates.text) {
        newUpdates.date = new Date().toISOString();
      }
      profile.value.diaryEntries[index] = { ...profile.value.diaryEntries[index], ...newUpdates };
      analyticsStore.recordActivity();
    }
  }

  async function deleteDiaryEntry(entryId: string) {
    if (shouldSyncToServer() && !entryId.startsWith('diary-')) {
      try {
        await axios.delete(`${API_URL}/diary/${entryId}`);
      } catch (e) {
        console.error('Failed to delete diary from backend', e);
      }
    }
    profile.value.diaryEntries = profile.value.diaryEntries.filter((e) => e.id !== entryId);
    analyticsStore.recordActivity();
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

  function updateHomeworkEntry(homeworkId: string, updates: Partial<HomeworkEntry>) {
    if (!Array.isArray(profile.value.homeworkHistory)) return;
    const index = profile.value.homeworkHistory.findIndex((e) => e.homeworkId === homeworkId);
    if (index > -1) {
      profile.value.homeworkHistory[index] = {
        ...profile.value.homeworkHistory[index],
        ...updates,
      };
    }
  }

  function saveChatSession(
    sessionMessages: Array<{ text: string; sender: 'user' | 'ИИ'; timestamp?: string }>,
  ) {
    profile.value.chatSessions.push([...sessionMessages]);
    analyticsStore.recordActivity();
  }

  return {
    profile,
    moodTheme,
    updateMoodTheme,
    resetMoodTheme,
    updateProfile,
    hydrateProfile,
    updateCourseProgress,
    addHomeworkSubmission,
    updateHomeworkEntry,
    addDiaryEntry,
    updateDiaryEntry,
    deleteDiaryEntry,
    addImageAnalysis,
    updateImageAnalysis,
    saveChatSession,
  };
});
