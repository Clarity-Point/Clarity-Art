import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { galleryVisibilitySchema, healthMetricSchema } from '../schemas';
import { createLogger } from '../config/logger';
import { recordAudit } from '../services/auditService';

const log = createLogger('socialController');

export const getPublicGallery = async (req: AuthRequest, res: Response) => {
  try {
    const images = await prisma.imageAnalysis.findMany({
      where: { isPublic: true },
      orderBy: { date: 'desc' },
      take: 20,
    });

    res.json(
      images.map((img) => ({
        id: img.id,
        prompt: img.prompt,
        result: img.result,
        imageUrl: img.imageStorageKey ? `/api/images/${img.id}` : img.imageUrl,
        date: img.date,
        likes: img.likes,
        userName: img.userId === req.user?.id ? 'Вы' : 'Участник',
      })),
    );
  } catch {
    res.status(500).json({ error: 'Error fetching gallery' });
  }
};

export const togglePublic = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const validation = galleryVisibilitySchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: 'Invalid gallery request' });
  const { id, isPublic } = validation.data;

  try {
    // Scope to the owner: a mismatch changes zero rows rather than erroring.
    const { count } = await prisma.imageAnalysis.updateMany({
      where: { id, userId: req.user.id },
      data: { isPublic },
    });
    if (count === 0) return res.status(404).json({ error: 'Image not found' });
    // Publishing a drawing makes it readable by every authenticated user in the
    // deployment, so the transition is recorded in both directions.
    recordAudit({
      action: isPublic ? 'privacy.image_published' : 'privacy.image_unpublished',
      actorId: req.user.id,
      subjectId: id,
      outcome: 'success',
      requestId: req.id,
      ip: req.ip,
    });
    res.json({ message: `Image visibility updated to ${isPublic}` });
  } catch {
    res.status(500).json({ error: 'Error updating visibility' });
  }
};

export const likePost = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const id = req.params.id as string;
  try {
    const image = await prisma.imageAnalysis.findFirst({
      where: { id, isPublic: true },
      select: { id: true, likes: true },
    });
    if (!image) return res.status(404).json({ error: 'Image not found' });

    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.imageLike.create({ data: { imageId: id, userId: req.user!.id } });
        return tx.imageAnalysis.update({
          where: { id },
          data: { likes: { increment: 1 } },
          select: { likes: true },
        });
      });
      return res.json({ likes: updated.likes, liked: true });
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
        const current = await prisma.imageAnalysis.findUnique({
          where: { id },
          select: { likes: true },
        });
        return res.json({ likes: current?.likes ?? image.likes, liked: true });
      }
      throw error;
    }
  } catch (error) {
    log.error({ err: error, imageId: id }, 'likePost failed');
    res.status(500).json({ error: 'Error liking post' });
  }
};

export const createHealthMetric = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  // Accept both the legacy and the current field names.
  const validation = healthMetricSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: 'Invalid health metrics' });
  const { heartRate, heartRateAvg, sleepHours, stepsCount } = validation.data;
  try {
    await prisma.profile.update({
      where: { userId: req.user.id },
      // Store in the dedicated columns — never overwrite the user's free-text
      // additionalInfo field with a JSON blob.
      data: {
        ...(sleepHours != null ? { sleepHours: Number(sleepHours) } : {}),
        ...(stepsCount != null ? { stepsCount: Number(stepsCount) } : {}),
        ...((heartRateAvg ?? heartRate) != null
          ? { heartRateAvg: Number(heartRateAvg ?? heartRate) }
          : {}),
      },
    });
    res.json({ message: 'Health data updated' });
  } catch {
    res.status(500).json({ error: 'Error updating health data' });
  }
};
