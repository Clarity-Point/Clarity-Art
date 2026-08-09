import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { checkAchievements } from '../middleware/gamification';
import { analyzeCrisisRisk } from '../services/crisisService';
import { AIService } from '../services/aiService';
import { AnalyticsService } from '../services/analyticsService';
import { validateTextInput } from '../security/inputValidation';
import { canUseConfiguredAI } from '../services/aiConsentService';

export const createDiaryEntry = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const { content } = req.body;
  const contentValidation = validateTextInput(content, 5_000);
  if (!contentValidation.ok) return res.status(400).json({ error: contentValidation.error });
  const safeContent = contentValidation.value;

  try {
    const allowProvider = await canUseConfiguredAI(req.user.id);
    const riskLevel = await analyzeCrisisRisk(safeContent, allowProvider);
    const tags = await AIService.extractTags(safeContent, allowProvider);

    const score = AnalyticsService.scoreForRisk(riskLevel);
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.diaryEntry.create({
        data: {
          userId: req.user!.id,
          content: safeContent,
          riskLevel,
          tags,
          date: new Date(),
        },
      });
      if (score !== undefined) {
        await tx.sentimentTrend.create({
          data: {
            userId: req.user!.id,
            diaryEntryId: created.id,
            riskLevel,
            score,
            tags,
          },
        });
      }
      await tx.user.update({
        where: { id: req.user!.id },
        data: { points: { increment: 10 } },
      });
      return created;
    });

    // Derived notifications and achievements are deliberately post-commit: a
    // secondary calculation must not roll back an already valid diary entry.
    await Promise.allSettled([
      ...(score !== undefined ? [AnalyticsService.checkAndNotify(req.user.id, score)] : []),
      AnalyticsService.updateAttentionScore(req.user.id),
      checkAchievements(req.user.id),
    ]);

    res.status(201).json(entry);
  } catch {
    res.status(500).json({ error: 'Error creating diary entry' });
  }
};

export const getDiaryEntries = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const entries = await prisma.diaryEntry.findMany({
      where: { userId: req.user.id },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (entries.length > limit) res.setHeader('X-Next-Cursor', entries[limit - 1].id);
    res.json(entries.slice(0, limit));
  } catch {
    res.status(500).json({ error: 'Error fetching diary entries' });
  }
};

export const updateDiaryEntry = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const id = req.params.id as string;
  const { content } = req.body;
  const contentValidation = validateTextInput(content, 5_000);
  if (!contentValidation.ok) return res.status(400).json({ error: contentValidation.error });

  try {
    const entry = await prisma.diaryEntry.findUnique({ where: { id } });
    if (!entry || entry.userId !== req.user.id) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const allowProvider = await canUseConfiguredAI(req.user.id);
    const riskLevel = await analyzeCrisisRisk(contentValidation.value, allowProvider);
    const tags = await AIService.extractTags(contentValidation.value, allowProvider);
    const score = AnalyticsService.scoreForRisk(riskLevel);

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.diaryEntry.update({
        where: { id },
        data: { content: contentValidation.value, riskLevel, tags, updatedAt: new Date() },
      });
      if (score === undefined) {
        await tx.sentimentTrend.deleteMany({ where: { diaryEntryId: id } });
      } else {
        await tx.sentimentTrend.upsert({
          where: { diaryEntryId: id },
          update: { riskLevel, score, tags, date: new Date() },
          create: { userId: req.user!.id, diaryEntryId: id, riskLevel, score, tags },
        });
      }
      return saved;
    });

    await Promise.allSettled([AnalyticsService.updateAttentionScore(req.user.id)]);

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Error updating diary entry' });
  }
};

export const deleteDiaryEntry = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const id = req.params.id as string;

  try {
    const entry = await prisma.diaryEntry.findUnique({ where: { id } });
    if (!entry || entry.userId !== req.user.id) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    await prisma.diaryEntry.delete({ where: { id } });
    // The linked SentimentTrend is removed by the database cascade.
    await Promise.allSettled([AnalyticsService.updateAttentionScore(req.user.id)]);
    res.json({ message: 'Entry deleted' });
  } catch {
    res.status(500).json({ error: 'Error deleting diary entry' });
  }
};
