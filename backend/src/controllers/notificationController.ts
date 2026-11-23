import { Response } from 'express';
import prisma from '../config/prisma';
import { createLogger } from '../config/logger';
import { AuthRequest } from '../middleware/auth';
import { pageQuerySchema } from '../schemas';
import { notificationVisibility } from '../services/practiceNotifications';

const log = createLogger('notificationController');

export const getNotifications = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const query = pageQuerySchema.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Некорректная страница уведомлений' });
  const { limit, cursor } = query.data;
  try {
    const where = notificationVisibility(req.user.id);
    const page = await prisma.$transaction(
      async (tx) => {
        if (
          cursor &&
          !(await tx.notification.findFirst({
            where: { ...where, id: cursor },
            select: { id: true },
          }))
        )
          return null;
        const notifications = await tx.notification.findMany({
          where,
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        const unread = await tx.notification.count({ where: { ...where, isRead: false } });
        return { notifications, unread };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    if (!page)
      return res
        .status(409)
        .json({ code: 'NOTIFICATIONS_CHANGED', error: 'Список уведомлений обновился.' });
    const { notifications, unread } = page;
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
      where: { ...notificationVisibility(req.user.id), id },
      data: { isRead: true },
    });
    if (count === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ success: true });
  } catch (err) {
    log.error({ err }, 'Failed to mark as read');
    res.status(500).json({ error: 'Failed to mark as read' });
  }
};
