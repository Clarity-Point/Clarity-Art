import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { rewardPoints } from '../middleware/gamification';
import { analyzeCrisisRisk } from '../services/crisisService';
import { AIService } from '../services/aiService';
import { AnalyticsService } from '../services/analyticsService';
import { validateTextInput } from '../security/inputValidation';

export const createDiaryEntry = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const { content } = req.body;
  const contentValidation = validateTextInput(content, 5_000);
  if (!contentValidation.ok) return res.status(400).json({ error: contentValidation.error });
  const safeContent = contentValidation.value;

  try {
    const riskLevel = await analyzeCrisisRisk(safeContent);
    const tags = await AIService.extractTags(safeContent);

    // Log trend
    await AnalyticsService.logSentiment(req.user.id, riskLevel, tags, safeContent);

    const entry = await prisma.diaryEntry.create({
      data: {
        userId: req.user.id,
        content: safeContent,
        riskLevel,
        tags,
        date: new Date(),
      },
    });

    // Award 10 points for a diary entry
    await rewardPoints(req.user.id, 10, 'Diary entry');

    res.status(201).json(entry);
  } catch {
    res.status(500).json({ error: 'Error creating diary entry' });
  }
};

export const getDiaryEntries = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const entries = await prisma.diaryEntry.findMany({
      where: { userId: req.user.id },
      orderBy: { date: 'desc' },
    });
    res.json(entries);
  } catch {
    res.status(500).json({ error: 'Error fetching diary entries' });
  }
};

export const updateDiaryEntry = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const id = req.params.id as string;
  const { content } = req.body;

  try {
    const entry = await prisma.diaryEntry.findUnique({ where: { id } });
    if (!entry || entry.userId !== req.user.id) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const updated = await prisma.diaryEntry.update({
      where: { id },
      data: { content, updatedAt: new Date() },
    });

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
    res.json({ message: 'Entry deleted' });
  } catch {
    res.status(500).json({ error: 'Error deleting diary entry' });
  }
};
