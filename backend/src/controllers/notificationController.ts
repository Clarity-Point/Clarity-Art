import { Response } from 'express';
import prisma from '../config/prisma';
import { createLogger } from '../config/logger';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const pageSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const log = createLogger('notificationController');

export const getNotifications = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const query = pageSchema.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Некорректная страница уведомлений' });
  const { limit, cursor } = query.data;
  try {
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
    ]);
    if (notifications.length > limit) res.setHeader('X-Next-Cursor', notifications[limit - 1].id);
    res.setHeader('X-Unread-Count', String(unread));
    res.json(notifications.slice(0, limit));
  } catch (err) {
    log.error({ err }, 'Failed to fetch notifications');
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
  } catch (err) {
    log.error({ err }, 'Failed to mark as read');
    res.status(500).json({ error: 'Failed to mark as read' });
  }
};
