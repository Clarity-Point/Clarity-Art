import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

const querySchema = z.object({
  kind: z.enum(['diary', 'images', 'chats', 'homework']).default('diary'),
  q: z.string().trim().max(200).default(''),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const cursorSchema = z.object({
  id: z.string().min(1).max(100),
  date: z.iso.datetime(),
  kind: z.string(),
});
export const getHistory = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.sendStatus(401);
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Проверьте параметры поиска' });
  const { kind, q, from, to, limit } = parsed.data;
  if (from && to && new Date(from).getTime() >= new Date(to).getTime())
    return res.status(400).json({ error: 'Начало периода должно быть раньше его окончания' });
  let cursor: z.infer<typeof cursorSchema> | undefined;
  try {
    if (parsed.data.cursor)
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(parsed.data.cursor, 'base64url').toString()),
      );
    if (cursor && cursor.kind !== kind) throw new Error('Wrong collection');
  } catch {
    return res.status(400).json({ error: 'Некорректная страница истории' });
  }
  const field = kind === 'homework' ? 'submissionDate' : kind === 'chats' ? 'updatedAt' : 'date';
  const date = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lt: new Date(to) } : {}) };
  const base = {
    userId: req.user.id,
    [field]: date,
    ...(cursor
      ? {
          AND: [
            {
              OR: [
                { [field]: { lt: new Date(cursor.date) } },
                { [field]: new Date(cursor.date), id: { lt: cursor.id } },
              ],
            },
          ],
        }
      : {}),
  };
  const contains = { contains: q, mode: 'insensitive' as const };
  type Item = {
    id: string;
    date: Date;
    title: string;
    text: string;
    href: string;
    imageUrl?: string;
  };
  let items: Item[];
  if (kind === 'diary') {
    const rows = await prisma.diaryEntry.findMany({
      where: { ...base, ...(q ? { content: contains } : {}) },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    items = rows.map((row) => ({
      id: row.id,
      date: row.date,
      title: 'Запись дневника',
      text: row.content,
      href: `/diary?entry=${row.id}`,
    }));
  } else if (kind === 'images') {
    const rows = await prisma.imageAnalysis.findMany({
      where: { ...base, ...(q ? { OR: [{ prompt: contains }, { result: contains }] } : {}) },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    items = rows.map((row) => ({
      id: row.id,
      date: row.date,
      title: row.prompt,
      text: row.result,
      href: '/profile',
      imageUrl: row.imageStorageKey ? `/api/images/${row.id}` : row.imageUrl || undefined,
    }));
  } else if (kind === 'chats') {
    const rows = await prisma.chatSession.findMany({
      where: {
        ...base,
        ...(q ? { OR: [{ title: contains }, { messages: { some: { content: contains } } }] } : {}),
      },
      include: { messages: { select: { content: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    items = rows.map((row) => ({
      id: row.id,
      date: row.updatedAt,
      title: row.title || 'Беседа',
      text: row.messages[0]?.content || '',
      href: `/chat?session=${row.id}`,
    }));
  } else {
    const rows = await prisma.submission.findMany({
      where: {
        ...base,
        ...(q ? { OR: [{ submittedContent: contains }, { homework: { title: contains } }] } : {}),
      },
      include: { homework: { include: { course: { select: { slug: true } } } } },
      orderBy: [{ submissionDate: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    items = rows.map((row) => ({
      id: row.id,
      date: row.submissionDate,
      title: row.homework.title,
      text: row.submittedContent,
      href: `/homework/${row.homeworkId}?courseContext=${row.homework.course.slug}`,
    }));
  }
  const page = items.slice(0, limit);
  const last = page[page.length - 1];
  res.json({
    items: page,
    nextCursor:
      items.length > limit && last
        ? Buffer.from(
            JSON.stringify({ id: last.id, date: last.date.toISOString(), kind }),
          ).toString('base64url')
        : null,
  });
};
