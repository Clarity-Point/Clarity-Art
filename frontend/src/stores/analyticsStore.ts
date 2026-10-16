import { ref, watch, computed } from 'vue';
import { defineStore } from 'pinia';

const ANALYTICS_STORAGE_KEY = 'appAnalyticsData';

interface AnalyticsState {
  ownerId: string | null;
  currentStreak: number;
  lastActivityDate: string | null; // Store date as YYYY-MM-DD string
  activityHistory: Record<string, { sessions: number }>; // YYYY-MM-DD -> { sessions: count }
}

export const useAnalyticsStore = defineStore('analytics', () => {
  const getInitialState = (): AnalyticsState => {
    const savedData = window.localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        return {
          ownerId: typeof parsed.ownerId === 'string' ? parsed.ownerId : null,
          currentStreak: typeof parsed.currentStreak === 'number' ? parsed.currentStreak : 0,
          lastActivityDate:
            typeof parsed.lastActivityDate === 'string' ? parsed.lastActivityDate : null,
          activityHistory:
            typeof parsed.activityHistory === 'object' && parsed.activityHistory !== null
              ? parsed.activityHistory
              : {},
        };
      } catch (e) {
        console.error('Failed to parse analytics data from localStorage', e);
      }
    }
    return {
      ownerId: null,
      currentStreak: 0, // Start at 0, first activity makes it 1
      lastActivityDate: null,
      activityHistory: {},
    };
  };

  const state = ref<AnalyticsState>(getInitialState());

  watch(
    state,
    (newStateValue) => {
      try {
        window.localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(newStateValue));
      } catch (e) {
        console.error('Failed to save analytics data to localStorage', e);
      }
    },
    { deep: true },
  );

  // Helper to get today's date as YYYY-MM-DD
  const getTodayDateString = (): string => {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  function recordActivity() {
    const todayStr = getTodayDateString();
    const lastDateStr = state.value.lastActivityDate;

    // Update activity history
    if (state.value.activityHistory[todayStr]) {
      state.value.activityHistory[todayStr].sessions += 1;
    } else {
      state.value.activityHistory[todayStr] = { sessions: 1 };
    }

    // Streak logic (only if the day has changed)
    if (lastDateStr !== todayStr) {
      if (!lastDateStr) {
        // First ever activity
        state.value.currentStreak = 1;
      } else {
        const [year, month, day] = lastDateStr.split('-').map(Number);
        const today = new Date();
        // Compare calendar days, independent of UTC parsing and DST changes.
        const previousDay = Date.UTC(year, month - 1, day);
        const currentDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
        const diffDays = (currentDay - previousDay) / 86_400_000;
        if (diffDays === 1) state.value.currentStreak += 1;
        else if (diffDays > 1) state.value.currentStreak = 1;
      }
      state.value.lastActivityDate = todayStr;
    }
    // Activity on the same day: streak doesn't change, already handled by session increment.
  }

  const currentStreak = computed(() => state.value.currentStreak);
  const activityHistory = computed(() => state.value.activityHistory);

  /** Align the client-side streak with the authoritative value from the server. */
  function hydrateStreak(serverStreak: number, ownerId: string) {
    if (state.value.ownerId !== ownerId) {
      state.value = {
        ownerId,
        currentStreak: serverStreak,
        lastActivityDate: getTodayDateString(),
        activityHistory: {},
      };
      return;
    }
    state.value.currentStreak = serverStreak;
    // GET /profile already records today’s activity on the backend.
    state.value.lastActivityDate = getTodayDateString();
  }

  function clearUserAnalytics() {
    state.value = { ownerId: null, currentStreak: 0, lastActivityDate: null, activityHistory: {} };
  }

  return {
    currentStreak,
    lastActivityDate: computed(() => state.value.lastActivityDate),
    activityHistory, // Expose the activity history
    recordActivity,
    hydrateStreak,
    clearUserAnalytics,
  };
});
