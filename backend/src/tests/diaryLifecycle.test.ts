import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  upsertTrend: vi.fn(),
  deleteTrends: vi.fn(),
  transaction: vi.fn(),
  analyzeRisk: vi.fn(),
  extractTags: vi.fn(),
  updateAttentionScore: vi.fn(),
}));

vi.mock('../config/prisma', () => ({
  default: {
    diaryEntry: { findUnique: mocks.findUnique },
    $transaction: mocks.transaction,
  },
}));
vi.mock('../services/crisisService', () => ({ analyzeCrisisRisk: mocks.analyzeRisk }));
vi.mock('../services/aiService', () => ({ AIService: { extractTags: mocks.extractTags } }));
vi.mock('../services/aiConsentService', () => ({
  canUseConfiguredAI: vi.fn().mockResolvedValue(true),
}));
vi.mock('../services/analyticsService', () => ({
  AnalyticsService: {
    scoreForRisk: (risk: string) => (risk === 'high' ? 10 : undefined),
    updateAttentionScore: mocks.updateAttentionScore,
  },
}));
vi.mock('../middleware/gamification', () => ({ checkAchievements: vi.fn() }));

import { updateDiaryEntry } from '../controllers/diaryController';

describe('diary derived-data lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ id: 'entry-1', userId: 'user-1' });
    mocks.analyzeRisk.mockResolvedValue('high');
    mocks.extractTags.mockResolvedValue(['Тревога']);
    mocks.update.mockResolvedValue({ id: 'entry-1', riskLevel: 'high', tags: ['Тревога'] });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        diaryEntry: { update: mocks.update },
        sentimentTrend: { upsert: mocks.upsertTrend, deleteMany: mocks.deleteTrends },
      }),
    );
  });

  it('reclassifies edited content and replaces the linked sentiment trend', async () => {
    const req = {
      user: { id: 'user-1' },
      params: { id: 'entry-1' },
      body: { content: 'Мне очень тяжело, я не хочу жить' },
    } as unknown as AuthRequest;
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { json, status } as unknown as Response;

    await updateDiaryEntry(req, res);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({ riskLevel: 'high', tags: ['Тревога'] }),
      }),
    );
    expect(mocks.upsertTrend).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { diaryEntryId: 'entry-1' },
        update: expect.objectContaining({ riskLevel: 'high', score: 10 }),
      }),
    );
    expect(mocks.updateAttentionScore).toHaveBeenCalledWith('user-1');
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ id: 'entry-1' }));
  });
});
