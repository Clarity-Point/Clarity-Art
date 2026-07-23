import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

export const getPublicGallery = async (req: AuthRequest, res: Response) => {
  try {
    const images = await prisma.imageAnalysis.findMany({
      where: { isPublic: true },
      include: { user: { select: { profile: { select: { name: true } } } } },
      orderBy: { date: 'desc' },
      take: 20,
    });

    res.json(
      images.map((img) => ({
        id: img.id,
        prompt: img.prompt,
        result: img.result,
        date: img.date,
        likes: img.likes,
        userName: img.user.profile?.name || 'Anonymous',
      })),
    );
  } catch {
    res.status(500).json({ error: 'Error fetching gallery' });
  }
};

export const togglePublic = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id, isPublic } = req.body;

  try {
    // Scope to the owner: a mismatch changes zero rows rather than erroring.
    const { count } = await prisma.imageAnalysis.updateMany({
      where: { id, userId: req.user.id },
      data: { isPublic },
    });
    if (count === 0) return res.status(404).json({ error: 'Image not found' });
    res.json({ message: `Image visibility updated to ${isPublic}` });
  } catch {
    res.status(500).json({ error: 'Error updating visibility' });
  }
};

export const likePost = async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  try {
    // Only publicly shared images can be liked — a private image must never have
    // its existence revealed via its like counter.
    const { count } = await prisma.imageAnalysis.updateMany({
      where: { id, isPublic: true },
      data: { likes: { increment: 1 } },
    });
    if (count === 0) return res.status(404).json({ error: 'Image not found' });

    const image = await prisma.imageAnalysis.findUnique({
      where: { id },
      select: { likes: true },
    });
    res.json({ likes: image?.likes ?? 0 });
  } catch {
    res.status(500).json({ error: 'Error liking post' });
  }
};

export const createHealthMetric = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  // Accept both the legacy and the current field names.
  const { heartRate, heartRateAvg, sleepHours, stepsCount } = req.body;
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
