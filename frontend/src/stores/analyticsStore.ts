import { ref, watch, computed } from 'vue'; // Added computed
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
        const lastDate = new Date(lastDateStr);
        const today = new Date(todayStr);

        const lastDateMidnight = new Date(
          lastDate.getFullYear(),
          lastDate.getMonth(),
          lastDate.getDate(),
        );
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        const diffTime = Math.abs(todayMidnight.getTime() - lastDateMidnight.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          state.value.currentStreak += 1;
        } else if (diffDays > 1) {
          // Gap in activity
          state.value.currentStreak = 1;
        }
        // If diffDays is 0, it means lastDateStr was not todayStr, but somehow it's the same day.
        // This case should ideally not happen if lastDateStr !== todayStr check is robust.
        // If it's a new day, streak is either incremented or reset.
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
        lastActivityDate: null,
        activityHistory: {},
      };
      return;
    }
    state.value.currentStreak = serverStreak;
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
