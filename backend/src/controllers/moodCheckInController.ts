import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const date = new Date(day);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === day &&
      day >= '2000-01-01' &&
      date.getTime() <= Date.now() + 86_400_000
    );
  });
const bodySchema = z.object({
  day: daySchema,
  score: z.number().int().min(1).max(5),
  note: z.string().trim().max(1_000).default(''),
});
export const listMoodCheckIns = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.sendStatus(401);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  if (cursor && !daySchema.safeParse(cursor).success)
    return res.status(400).json({ error: 'Некорректная дата' });
  const rows = await prisma.moodCheckIn.findMany({
    where: { userId: req.user.id, ...(cursor ? { day: { lt: new Date(cursor) } } : {}) },
    orderBy: { day: 'desc' },
    take: 31,
  });
  res.json({
    items: rows.slice(0, 30),
    nextCursor: rows.length > 30 ? rows[29].day.toISOString().slice(0, 10) : null,
  });
};
export const saveMoodCheckIn = async (req: AuthRequest, res: Response) => {
  const body = bodySchema.safeParse(req.body);
  if (!req.user || !body.success)
    return res
      .status(400)
      .json({ error: 'Укажите дату, состояние от 1 до 5 и заметку до 1000 символов' });
  const { day, ...data } = body.data;
  const result = await prisma.moodCheckIn.upsert({
    where: { userId_day: { userId: req.user.id, day: new Date(day) } },
    create: { userId: req.user.id, day: new Date(day), ...data },
    update: data,
  });
  res.json(result);
};
export const deleteMoodCheckIn = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.sendStatus(401);
  const result = await prisma.moodCheckIn.deleteMany({
    where: { id: req.params.id as string, userId: req.user.id },
  });
  res.status(result.count ? 204 : 404).end();
};
