import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createLogger } from '../config/logger';

const log = createLogger('analyticsController');

export const getMoodStats = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const sessions = await prisma.chatSession.findMany({
      where: { userId: req.user.id, riskLevel: { in: ['low', 'medium', 'high'] } },
      orderBy: { date: 'desc' },
      take: 30, // Last 30 sessions
      select: { date: true, riskLevel: true },
    });

    // Map riskLevel to numeric sentiment (low=3, medium=2, high=1)
    const stats = sessions.reverse().map((s) => ({
      date: s.date,
      score: s.riskLevel === 'high' ? 1 : s.riskLevel === 'medium' ? 2 : 3,
    }));

    res.json(stats);
  } catch {
    res.status(500).json({ error: 'Error fetching mood stats' });
  }
};

export const getCorrelations = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
    if (!profile) {
      return res.json({ message: 'Insufficient data for correlation' });
    }

    const sleepHours = profile.sleepHours || 0;
    const stepsCount = profile.stepsCount || 0;
    const heartRateAvg = profile.heartRateAvg || 0;

    // Show only user-supplied values. This Community Edition does not infer
    // mood, stress, diagnosis or health status from sleep/activity/pulse data.
    res.json({
      healthData: { sleepHours, stepsCount, heartRateAvg },
      insights: [],
      disclaimer:
        'Показаны только введённые вами значения. Приложение не делает медицинских или психологических выводов на их основе.',
    });
  } catch (error) {
    log.error({ err: error }, 'getCorrelations error');
    res.status(500).json({ error: 'Error calculating correlations' });
  }
};
