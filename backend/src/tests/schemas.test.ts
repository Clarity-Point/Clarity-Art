import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  deleteAccountSchema,
  gradeSubmissionSchema,
  profileUpdateSchema,
  progressSchema,
} from '../schemas';

describe('persisted user-flow schemas', () => {
  it('accepts fractional sleep hours from the profile UI', () => {
    const result = profileUpdateSchema.safeParse({ sleepHours: 7.5 });
    expect(result.success).toBe(true);
  });

  it('keeps completed lesson titles when progress is validated', () => {
    const result = progressSchema.parse({
      progress: 25,
      completedLessons: ['Знакомство с практикой'],
    });
    expect(result.completedLessons).toEqual(['Знакомство с практикой']);
  });

  it('rejects invalid progress and excessively long lesson labels', () => {
    expect(progressSchema.safeParse({ progress: 101 }).success).toBe(false);
    expect(
      progressSchema.safeParse({ progress: 10, completedLessons: ['x'.repeat(301)] }).success,
    ).toBe(false);
  });

  it('requires a meaningful new account password', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: '12345678' }).success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'short' }).success,
    ).toBe(false);
  });

  it('validates account deletion and grading identifiers', () => {
    expect(deleteAccountSchema.safeParse({ password: 'current' }).success).toBe(true);
    expect(
      gradeSubmissionSchema.safeParse({
        userId: '28bf2c7d-c1d3-4325-bad5-3943ddfead27',
        homeworkId: '72225da8-3fa7-40ac-90ab-cd87ed7ea103',
        grade: '5/5',
      }).success,
    ).toBe(true);
    expect(gradeSubmissionSchema.safeParse({ userId: 'bad', grade: '' }).success).toBe(false);
  });
});
