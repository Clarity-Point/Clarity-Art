import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { challengeActionSchema } from '../schemas';
import { checkAchievements } from '../middleware/gamification';
import { getChallengeState } from '../services/challengeService';

export const getChallenges = async (req: AuthRequest, res: Response) => {
  try {
    const challenges = await prisma.challenge.findMany({
      orderBy: { startDate: 'desc' },
    });

    const userJoined = req.user
      ? await prisma.userChallenge.findMany({
          where: { userId: req.user.id },
        })
      : [];

    res.json(
      challenges.map((c) => ({
        ...c,
        status: getChallengeState(c.startDate, c.endDate),
        joined: userJoined.some((uj) => uj.challengeId === c.id),
        completed: userJoined.some((uj) => uj.challengeId === c.id && uj.completed),
      })),
    );
  } catch {
    res.status(500).json({ error: 'Error fetching challenges' });
  }
};

export const joinChallenge = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const validation = challengeActionSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: 'Invalid challenge id' });
  const { challengeId } = validation.data;

  try {
    const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    const state = getChallengeState(challenge.startDate, challenge.endDate);
    if (state !== 'active') {
      return res.status(409).json({
        error:
          state === 'upcoming' ? 'Челлендж ещё не начался' : 'Период участия в челлендже завершён',
        code: `CHALLENGE_${state.toUpperCase()}`,
      });
    }
    const uc = await prisma.userChallenge.upsert({
      where: { userId_challengeId: { userId: req.user.id, challengeId } },
      update: {},
      create: { userId: req.user.id, challengeId },
    });
    res.json({ message: 'Joined challenge', uc });
  } catch {
    res.status(500).json({ error: 'Error joining challenge' });
  }
};

export const completeChallenge = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const validation = challengeActionSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: 'Invalid challenge id' });
  const { challengeId } = validation.data;

  try {
    const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    const state = getChallengeState(challenge.startDate, challenge.endDate);
    if (state !== 'active') {
      return res.status(409).json({
        error:
          state === 'upcoming' ? 'Челлендж ещё не начался' : 'Период завершения челленджа истёк',
        code: `CHALLENGE_${state.toUpperCase()}`,
      });
    }

    // Award points only on the first completion. Guarding the update on
    // `completed: false` makes this idempotent — repeat calls can't farm points.
    const count = await prisma.$transaction(async (tx) => {
      const updated = await tx.userChallenge.updateMany({
        where: { userId: req.user!.id, challengeId, completed: false },
        data: { completed: true },
      });
      if (updated.count > 0) {
        await tx.user.update({
          where: { id: req.user!.id },
          data: { points: { increment: challenge.pointsAward } },
        });
      }
      return updated.count;
    });

    if (count === 0) {
      return res.status(409).json({ error: 'Challenge already completed or not joined' });
    }

    await Promise.allSettled([checkAchievements(req.user.id)]);

    res.json({ message: 'Challenge completed!', pointsAwarded: challenge.pointsAward });
  } catch {
    res.status(500).json({ error: 'Error completing challenge' });
  }
};
