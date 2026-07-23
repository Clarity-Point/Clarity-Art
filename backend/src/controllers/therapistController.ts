import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

export const getPatients = async (req: AuthRequest, res: Response) => {
  // Role is enforced by the `isTherapist` middleware (fresh DB role check); the
  // query below further scopes results to this therapist's consenting patients.
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const patients = await prisma.user.findMany({
      where: {
        therapistId: req.user.id,
        profile: { isSharedWithTherapist: true },
      },
      include: {
        profile: true,
        diaryEntries: {
          orderBy: { date: 'desc' },
          take: 10,
          select: { id: true, content: true, date: true, riskLevel: true, tags: true },
        },
        chatSessions: { take: 5, orderBy: { date: 'desc' }, include: { messages: { take: 1 } } },
        challenges: {
          where: { completed: false },
          include: { challenge: true },
        },
        imageAnalyses: { take: 3, orderBy: { date: 'desc' } },
      },
      orderBy: {
        profile: {
          attentionScore: 'desc',
        },
      },
    });
    res.json(patients);
  } catch (error) {
    console.error('getPatients error:', error);
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
    res.json({ message: 'Therapist access updated' });
  } catch {
    res.status(500).json({ error: 'Error updating therapist access' });
  }
};
