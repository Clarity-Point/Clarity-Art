import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAnalyticsStore } from './analyticsStore';

describe('analyticsStore account isolation', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('accepts a lower authoritative server streak after a reset', () => {
    const store = useAnalyticsStore();
    store.hydrateStreak(12, 'user-a');
    store.hydrateStreak(1, 'user-a');
    expect(store.currentStreak).toBe(1);
  });

  it('clears browser activity when another account signs in', () => {
    const store = useAnalyticsStore();
    store.hydrateStreak(5, 'user-a');
    store.recordActivity();
    expect(Object.keys(store.activityHistory)).toHaveLength(1);

    store.hydrateStreak(2, 'user-b');
    expect(store.currentStreak).toBe(2);
    expect(store.activityHistory).toEqual({});
  });
  it('preserves the server streak on the first activity after hydration', () => {
    const store = useAnalyticsStore();
    store.hydrateStreak(12, 'user-a');
    store.recordActivity();
    expect(store.currentStreak).toBe(12);
  });

  it('counts consecutive local calendar days across a daylight-saving change', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 24, 12));
    const store = useAnalyticsStore();
    store.hydrateStreak(12, 'user-a');
    vi.setSystemTime(new Date(2026, 9, 25, 12));
    store.recordActivity();
    expect(store.currentStreak).toBe(13);
    vi.setSystemTime(new Date(2026, 9, 28, 12));
    store.recordActivity();
    expect(store.currentStreak).toBe(1);
  });
});
