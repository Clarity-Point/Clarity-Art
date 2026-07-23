import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

export const getNotifications = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { date: 'desc' },
    });
    res.json(notifications);
  } catch {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const id = req.params.id as string;
  try {
    // Scope to the owner: a mismatch changes zero rows rather than erroring.
    const { count } = await prisma.notification.updateMany({
      where: { id, userId: req.user.id },
      data: { isRead: true },
    });
    if (count === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
};
