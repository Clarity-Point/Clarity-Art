import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { recordAudit } from '../services/auditService';
import { AuthRequest } from '../middleware/auth';
const reportSchema = z.object({
  reason: z.enum(['privacy', 'harassment', 'unsafe', 'spam', 'other']),
  detail: z.string().trim().max(1000).default(''),
});
export const reportImage = async (req: AuthRequest, res: Response) => {
  const body = reportSchema.safeParse(req.body);
  if (!req.user || !body.success) return res.status(400).json({ error: 'Выберите причину жалобы' });
  const imageId = req.params.id as string;
  const image = await prisma.imageAnalysis.findFirst({
    where: { id: imageId, isPublic: true, moderationStatus: 'VISIBLE' },
    select: { id: true },
  });
  if (!image) return res.status(404).json({ error: 'Публикация не найдена' });
  const reporterId = req.user.id;
  await prisma.$transaction([
    prisma.galleryReport.upsert({
      where: { reporterId_imageId: { reporterId, imageId } },
      create: { reporterId, imageId, ...body.data },
      update: {},
    }),
    prisma.hiddenImage.upsert({
      where: { userId_imageId: { userId: reporterId, imageId } },
      create: { userId: reporterId, imageId },
      update: {},
    }),
  ]);
  res.status(201).json({ message: 'Жалоба отправлена. Публикация скрыта для вас.' });
};
export const setHiddenImage = async (req: AuthRequest, res: Response) => {
  if (!req.user || typeof req.body?.hidden !== 'boolean')
    return res.status(400).json({ error: 'Укажите действие' });
  const imageId = req.params.id as string;
  const userId = req.user.id;
  if (req.body.hidden) {
    if (
      !(await prisma.imageAnalysis.findFirst({
        where: { id: imageId, isPublic: true, moderationStatus: 'VISIBLE' },
        select: { id: true },
      }))
    )
      return res.status(404).json({ error: 'Публикация не найдена' });
    await prisma.hiddenImage.upsert({
      where: { userId_imageId: { userId, imageId } },
      create: { userId, imageId },
      update: {},
    });
  } else await prisma.hiddenImage.deleteMany({ where: { userId, imageId } });
  res.status(204).end();
};
export const listReports = async (req: AuthRequest, res: Response) => {
  const status = z
    .enum(['PENDING', 'ACTIONED', 'DISMISSED'])
    .safeParse(req.query.status || 'PENDING');
  if (!status.success) return res.status(400).json({ error: 'Некорректный статус' });
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const reports = await prisma.galleryReport.findMany({
    where: { status: status.data },
    select: {
      id: true,
      imageId: true,
      reason: true,
      detail: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      image: {
        select: {
          prompt: true,
          result: true,
          moderationStatus: true,
          moderationVersion: true,
          imageStorageKey: true,
          imageUrl: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 31,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  res.json({
    items: reports.slice(0, 30).map((row) => ({
      ...row,
      imageUrl: row.image.imageStorageKey ? `/api/images/${row.imageId}` : row.image.imageUrl,
    })),
    nextCursor: reports.length > 30 ? reports[29].id : null,
  });
};
const versionSchema = z.number().int().min(1).max(2_147_483_646);
export const resolveReport = async (req: AuthRequest, res: Response) => {
  if (!req.user || !['hide', 'dismiss'].includes(req.body?.action))
    return res.status(400).json({ error: 'Выберите решение' });
  const version = versionSchema.safeParse(req.body.version);
  if (!version.success)
    return res.status(400).json({ error: 'Обновите список перед сохранением решения' });
  const action = req.body.action as 'hide' | 'dismiss';
  const id = req.params.id as string;
  const actorId = req.user.id;
  const done = await prisma.$transaction(async (tx) => {
    const report = await tx.galleryReport.findUnique({ where: { id } });
    if (!report) return false;
    // Lock the publication first: decisions on different reports share this lock.
    await tx.$queryRaw`SELECT id FROM "ImageAnalysis" WHERE id = ${report.imageId} FOR UPDATE`;
    const fresh = await tx.galleryReport.findUnique({ where: { id } });
    if (!fresh || fresh.status !== 'PENDING') return false;
    const changed = await tx.imageAnalysis.updateMany({
      where: { id: report.imageId, moderationVersion: version.data },
      data: {
        moderationVersion: { increment: 1 },
        ...(action === 'hide' ? { moderationStatus: 'BLOCKED' } : {}),
      },
    });
    if (!changed.count) return false;
    const claimed = await tx.galleryReport.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: action === 'hide' ? 'ACTIONED' : 'DISMISSED',
        reviewedAt: new Date(),
        reviewedBy: actorId,
      },
    });
    if (!claimed.count)
      throw Object.assign(new Error('Жалоба удалена. Обновите список.'), { status: 409 });
    if (action === 'hide') {
      await tx.galleryReport.updateMany({
        where: { imageId: report.imageId, status: 'PENDING' },
        data: { status: 'ACTIONED', reviewedAt: new Date(), reviewedBy: actorId },
      });
    }
    return true;
  });
  if (!done)
    return res.status(409).json({ error: 'Жалоба уже рассмотрена или удалена. Обновите список.' });
  recordAudit({
    action: 'admin.gallery_moderated',
    actorId,
    meta: { reportId: id, decision: action },
    outcome: 'success',
  });
  res.status(204).end();
};
export const restoreImage = async (req: AuthRequest, res: Response) => {
  const version = versionSchema.safeParse(req.body?.version);
  if (!version.success)
    return res.status(400).json({ error: 'Обновите список перед восстановлением' });
  const updated = await prisma.imageAnalysis.updateMany({
    where: {
      id: req.params.id as string,
      moderationStatus: 'BLOCKED',
      moderationVersion: version.data,
    },
    data: { moderationStatus: 'VISIBLE', moderationVersion: { increment: 1 } },
  });
  if (updated.count)
    recordAudit({
      action: 'admin.gallery_restored',
      actorId: req.user?.id,
      meta: { imageId: req.params.id as string },
      outcome: 'success',
    });
  if (!updated.count)
    return res
      .status(409)
      .json({ error: 'Публикация изменена другим модератором. Обновите список.' });
  res.status(204).end();
};
