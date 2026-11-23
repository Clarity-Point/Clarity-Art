import type { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import type { AuthRequest } from '../middleware/auth';
import {
  activePracticeShare,
  notifyPractice,
  practiceRecommendationNotice,
  recipientScope,
} from '../services/practiceNotifications';
import { fail, parseId, practiceIdSchema, withOwner } from '../services/practiceStorage';

async function recipientOwner(id: string, therapistId: string) {
  const share = await prisma.practiceShare.findFirst({
    where: { id, ...recipientScope(therapistId) },
    select: { ownerId: true },
  });
  if (!share) fail(404, 'Подборка недоступна.');
  return share.ownerId;
}

export async function acknowledgePracticeShare(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id);
  const scope = recipientScope(req.user!.id);
  const ownerId = await recipientOwner(id, scope.therapistId);
  const acknowledgedAt = await withOwner(ownerId, async (tx) => {
    const where = { id, ownerId, ...scope };
    await tx.practiceShare.updateMany({
      where: { ...where, acknowledgedAt: null },
      data: { acknowledgedAt: new Date() },
    });
    const share = await tx.practiceShare.findFirst({ where, select: { acknowledgedAt: true } });
    if (!share?.acknowledgedAt) fail(404, 'Подборка недоступна.');
    return share.acknowledgedAt;
  });
  res.json({ acknowledgedAt });
}

export async function recommendPractice(req: AuthRequest, res: Response) {
  const parsed = z.object({ practiceId: practiceIdSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Выберите практику из каталога.' });
  const id = parseId(req.params.id);
  const scope = recipientScope(req.user!.id);
  const ownerId = await recipientOwner(id, scope.therapistId);
  const practiceId = parsed.data.practiceId;
  await withOwner(ownerId, async (tx) => {
    const where = { id, ownerId, ...scope, allowRecommendation: true };
    const result = await tx.practiceShare.updateMany({
      where: { ...where, recommendedPracticeId: null },
      data: { recommendedPracticeId: practiceId },
    });
    const share = await tx.practiceShare.findFirst({
      where,
      select: { recommendedPracticeId: true },
    });
    if (!share) fail(404, 'Рекомендация для этой подборки недоступна.');
    if (share.recommendedPracticeId !== practiceId)
      fail(409, 'Практика для этой подборки уже предложена.');
    if (result.count) await notifyPractice(tx, ownerId, id, practiceRecommendationNotice);
  });
  res.json({ practiceId });
}

export async function disablePracticeRecommendation(req: AuthRequest, res: Response) {
  if (req.body?.allowed !== false)
    return res.status(400).json({ error: 'Укажите отключение рекомендаций.' });
  const id = parseId(req.params.id);
  const ownerId = req.user!.id;
  await withOwner(ownerId, async (tx) => {
    const { count } = await tx.practiceShare.updateMany({
      where: { id, ownerId, ...activePracticeShare },
      data: {
        allowRecommendation: false,
        recommendedPracticeId: null,
        recommendationDismissedAt: null,
      },
    });
    if (!count) fail(404, 'Подборка недоступна.');
    await tx.notification.deleteMany({
      where: { userId: ownerId, practiceShareId: id, type: practiceRecommendationNotice },
    });
  });
  res.sendStatus(204);
}

export async function dismissPracticeRecommendation(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id);
  const ownerId = req.user!.id;
  await withOwner(ownerId, async (tx) => {
    const { count } = await tx.practiceShare.updateMany({
      where: { id, ownerId, ...activePracticeShare, recommendedPracticeId: { not: null } },
      data: { recommendationDismissedAt: new Date() },
    });
    if (!count) fail(404, 'Рекомендация недоступна.');
    await tx.notification.deleteMany({
      where: { userId: ownerId, practiceShareId: id, type: practiceRecommendationNotice },
    });
  });
  res.sendStatus(204);
}
