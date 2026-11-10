import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { pageQuerySchema } from '../schemas';
import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createLogger } from '../config/logger';
import { recordAudit } from '../services/auditService';

const log = createLogger('therapistController');

export const getAvailableTherapists = async (_req: AuthRequest, res: Response) => {
  const therapists = await prisma.user.findMany({
    where: { role: 'THERAPIST' },
    select: { id: true, profile: { select: { name: true } } },
    orderBy: { profile: { name: 'asc' } },
  });
  res.json(
    therapists.map((therapist) => ({
      id: therapist.id,
      name: therapist.profile?.name || 'Терапевт',
    })),
  );
};

const patientPageSchema = pageQuerySchema.extend({ q: z.string().trim().max(120).default('') });
export const getPatients = async (req: AuthRequest, res: Response) => {
  // Role is enforced by the `isTherapist` middleware (fresh DB role check); the
  // query below further scopes results to this therapist's consenting patients.
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const query = patientPageSchema.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Некорректный фильтр подопечных' });
  const { cursor, limit, q } = query.data;
  const where: Prisma.UserWhereInput = {
    therapistId: req.user.id,
    profile: { isSharedWithTherapist: true },
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { profile: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  try {
    const patients = await prisma.user.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      // This endpoint handles especially sensitive data. Keep an explicit
      // allow-list so account credentials and newly-added User/Profile columns
      // can never become part of the response by accident.
      select: {
        id: true,
        email: true,
        streak: true,
        points: true,
        profile: {
          select: { name: true, attentionScore: true, sleepHours: true },
        },
        diaryEntries: {
          orderBy: { date: 'desc' },
          take: 10,
          select: { id: true, content: true, date: true, riskLevel: true, tags: true },
        },
        chatSessions: {
          take: 5,
          orderBy: { date: 'desc' },
          select: { id: true, date: true, riskLevel: true },
        },
      },
      orderBy: [{ profile: { attentionScore: 'desc' } }, { id: 'asc' }],
    });
    const [total, attention] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.count({ where: { AND: [where, { profile: { attentionScore: { gt: 50 } } }] } }),
    ]);
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Attention-Count', String(attention));
    if (patients.length > limit) res.setHeader('X-Next-Cursor', patients[limit - 1].id);
    res.json(patients.slice(0, limit));
  } catch (error) {
    log.error({ err: error }, 'getPatients error');
    res.status(500).json({ error: 'Error fetching patients' });
  }
};

export const updateTherapistAccess = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { isSharedWithTherapist, therapistId } = req.body;

  if (typeof isSharedWithTherapist !== 'boolean') {
    return res.status(400).json({ error: 'isSharedWithTherapist must be a boolean' });
  }
  if (isSharedWithTherapist && (typeof therapistId !== 'string' || !therapistId)) {
    return res.status(400).json({ error: 'A therapist must be selected before sharing access' });
  }

  try {
    if (isSharedWithTherapist) {
      const therapist = await prisma.user.findFirst({
        where: { id: therapistId, role: 'THERAPIST' },
        select: { id: true },
      });
      if (!therapist) return res.status(400).json({ error: 'Selected therapist is not available' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        therapistId: isSharedWithTherapist ? therapistId : null,
        profile: { update: { isSharedWithTherapist } },
      },
    });
    /*
     * Sharing is the point at which a third party gains standing access to a
     * person's diary, chat history and safety signals. Both the grant and the
     * revocation belong in the audit trail: a complaint about "my therapist
     * read my diary" is only answerable if both boundaries were recorded.
     */
    recordAudit({
      action: isSharedWithTherapist
        ? 'privacy.therapist_access_granted'
        : 'privacy.therapist_access_revoked',
      actorId: req.user.id,
      subjectId: isSharedWithTherapist ? therapistId : undefined,
      outcome: 'success',
      requestId: req.id,
      ip: req.ip,
    });
    res.json({ message: 'Therapist access updated' });
  } catch {
    res.status(500).json({ error: 'Error updating therapist access' });
  }
};
