import { describe, expect, it } from 'vitest';
import { calculateCourseProgress } from '../services/courseProgressService';
import { getChallengeState } from '../services/challengeService';
import { buildPrivacySafeOrgAnalytics } from '../services/orgPrivacyService';

describe('privacy-safe organization analytics', () => {
  it('does not let one prolific member unlock an aggregate', () => {
    const signals = Array.from({ length: 12 }, (_, index) => ({
      userId: 'one-person',
      date: new Date(`2026-08-01T10:${String(index).padStart(2, '0')}:00Z`),
      riskLevel: 'high' as const,
    }));

    const result = buildPrivacySafeOrgAnalytics(signals, 8);

    expect(result.activeMemberCount).toBe(1);
    expect(result.riskStats).toEqual([]);
    expect(result.heatmapData).toEqual({});
    expect(result.trends).toEqual([]);
  });

  it('releases a bucket only when eight distinct people support that bucket', () => {
    const lowSignals = Array.from({ length: 8 }, (_, index) => ({
      userId: `member-${index}`,
      date: new Date('2026-08-01T10:00:00Z'),
      riskLevel: 'low' as const,
    }));
    const result = buildPrivacySafeOrgAnalytics([
      ...lowSignals,
      {
        userId: 'member-with-private-high',
        date: new Date('2026-08-01T11:00:00Z'),
        riskLevel: 'high',
      },
    ]);

    expect(result.riskStats).toEqual([{ riskLevel: 'low', _count: 8 }]);
    expect(result.heatmapData['6-10']).toEqual({ count: 8, totalRisk: 8 });
    expect(result.heatmapData['6-11']).toBeUndefined();
    expect(result.trends).toEqual([{ date: '2026-08-01T00:00:00.000Z', _count: 9 }]);
  });
});

describe('canonical course progress', () => {
  it('ignores foreign ids and calculates progress from server-owned course data', () => {
    const result = calculateCourseProgress(
      ['lesson-1', 'foreign-lesson', 'lesson-1'],
      ['lesson-1', 'lesson-2', 'lesson-3'],
      1,
      1,
    );

    expect(result).toEqual({ completedLessons: ['lesson-1'], progress: 50 });
  });

  it('bounds homework completion and handles an empty course', () => {
    expect(calculateCourseProgress([], [], 10, 0)).toEqual({ completedLessons: [], progress: 0 });
  });
});

describe('challenge period', () => {
  const start = new Date('2026-08-01T00:00:00Z');
  const end = new Date('2026-08-31T23:59:59Z');

  it('distinguishes upcoming, active and ended challenges including boundaries', () => {
    expect(getChallengeState(start, end, new Date('2026-07-31T23:59:59Z'))).toBe('upcoming');
    expect(getChallengeState(start, end, start)).toBe('active');
    expect(getChallengeState(start, end, end)).toBe('active');
    expect(getChallengeState(start, end, new Date('2026-09-01T00:00:00Z'))).toBe('ended');
  });
});
