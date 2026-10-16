import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('../config/prisma', () => ({
  default: { user: { findMany } },
}));

import { getPatients } from '../controllers/therapistController';

describe('therapist patient privacy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries only the patient fields used by the therapist UI', async () => {
    findMany.mockResolvedValue([]);
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    await getPatients({ user: { id: 'therapist-1' } } as never, { json, status } as never);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          email: true,
          streak: true,
          points: true,
          profile: {
            select: { name: true, attentionScore: true, sleepHours: true },
          },
          diaryEntries: expect.objectContaining({
            select: { id: true, content: true, date: true, riskLevel: true, tags: true },
          }),
          chatSessions: expect.objectContaining({
            select: { id: true, date: true, riskLevel: true },
          }),
        },
      }),
    );
    const query = findMany.mock.calls[0][0];
    expect(query.include).toBeUndefined();
    expect(query.select.password).toBeUndefined();
    expect(query.select.sessionVersion).toBeUndefined();
  });
});
