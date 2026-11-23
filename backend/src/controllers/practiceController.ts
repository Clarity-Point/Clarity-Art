import type { Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/prisma';
import type { AuthRequest } from '../middleware/auth';
import { validateImageInput } from '../security/inputValidation';
import { recordAudit } from '../services/auditService';
import { isPracticeId } from '../services/practiceCatalog';

const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_WORKS = 30;
const MAX_REFLECTIONS = 20;
const MAX_SHARES = 20;
const SHARE_PAGE_SIZE = 20;
const idSchema = z.uuid();
const practiceIdSchema = z.string().max(40).refine(isPracticeId);
const caption = z
  .string()
  .trim()
  .max(600)
  .refine((text) => !text.includes('\0'));
const imageSchema = z.object({
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  base64: z.string().max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4),
});
const workSchema = z
  .object({
    id: idSchema,
    practiceId: practiceIdSchema.optional(),
    title: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((text) => !text.includes('\0')),
    note: caption.default(''),
    image: imageSchema.optional(),
  })
  .refine((work) => work.note || work.image);
const reflectionSchema = z.object({
  id: idSchema,
  content: caption.refine(Boolean),
});
const itemSchema = z
  .object({
    workId: idSchema,
    includeImage: z.boolean(),
    includeNote: z.boolean(),
    reflectionIds: z.array(idSchema).max(MAX_REFLECTIONS),
  })
  .refine((item) => item.includeImage || item.includeNote || item.reflectionIds.length > 0);
const shareSchema = z
  .object({
    id: idSchema,
    therapistId: idSchema,
    items: z.array(itemSchema).min(1).max(8),
  })
  .refine(({ items }) => new Set(items.map((item) => item.workId)).size === items.length);

const workSelect = {
  id: true,
  practiceId: true,
  title: true,
  note: true,
  imageMimeType: true,
  createdAt: true,
  reflections: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.PracticeWorkSelect;

const shareItems = {
  orderBy: { position: 'asc' },
  select: { workId: true, title: true, note: true, reflections: true, includesImage: true },
} satisfies Prisma.PracticeShare$itemsArgs;

function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

function withOwner<T>(userId: string, action: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
      if (!locked.length) fail(401, 'Сессия завершена. Войдите снова.');
      return action(tx);
    },
    { isolationLevel: 'ReadCommitted' },
  );
}

function parseId(value: unknown) {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) fail(404, 'Запись не найдена.');
  return parsed.data;
}

function workResponse(work: Prisma.PracticeWorkGetPayload<{ select: typeof workSelect }>) {
  const { imageMimeType, ...data } = work;
  return { ...data, hasImage: Boolean(imageMimeType) };
}

function sendImage(
  res: Response,
  image: Uint8Array | null | undefined,
  mimeType: string | null | undefined,
) {
  if (!image || !mimeType) return res.status(404).json({ error: 'Изображение не найдено.' });
  return res.type(mimeType).send(Buffer.from(image));
}

function recipientScope(therapistId: string) {
  return {
    therapistId,
    therapist: { role: 'THERAPIST' },
    revokedAt: null,
    items: { some: {} },
  } satisfies Prisma.PracticeShareWhereInput;
}

export async function listProgress(req: AuthRequest, res: Response) {
  const rows = await prisma.practiceCompletion.findMany({
    where: { userId: req.user!.id },
    select: { practiceId: true },
  });
  res.json(rows.map(({ practiceId }) => practiceId));
}

export async function completePractice(req: AuthRequest, res: Response) {
  const parsed = practiceIdSchema.safeParse(req.params.id);
  if (!parsed.success) return res.status(404).json({ error: 'Практика не найдена.' });
  await prisma.practiceCompletion.createMany({
    data: [{ userId: req.user!.id, practiceId: parsed.data }],
    skipDuplicates: true,
  });
  res.sendStatus(204);
}

export async function listWorks(req: AuthRequest, res: Response) {
  const works = await prisma.practiceWork.findMany({
    where: { userId: req.user!.id },
    select: workSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_WORKS,
  });
  res.json(works.map(workResponse));
}

export async function createWork(req: AuthRequest, res: Response) {
  const parsed = workSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'Укажите название и добавьте рисунок или подпись.' });
  const { image, id: requestId, ...data } = parsed.data;
  let bytes: Buffer<ArrayBuffer> | undefined;
  if (image) {
    const validation = validateImageInput(image.mimeType, image.base64, MAX_IMAGE_BYTES + 2);
    if (!validation.ok)
      return res.status(400).json({ error: 'Выберите изображение PNG, JPEG или WebP до 1 МиБ.' });
    bytes = Buffer.from(image.base64, 'base64');
    if (bytes.length > MAX_IMAGE_BYTES)
      return res.status(400).json({ error: 'Изображение больше 1 МиБ.' });
  }
  const userId = req.user!.id;
  const work = await withOwner(userId, async (tx) => {
    const key = { userId_requestId: { userId, requestId } };
    if (await tx.practiceWorkRemoval.findUnique({ where: key }))
      fail(410, 'Эта работа уже удалена.');
    const existing = await tx.practiceWork.findUnique({
      where: key,
      select: workSelect,
    });
    if (existing) return existing;
    if ((await tx.practiceWork.count({ where: { userId } })) >= MAX_WORKS) {
      fail(409, 'В альбоме уже 30 работ. Удалите одну из них перед сохранением новой.');
    }
    return tx.practiceWork.create({
      data: { ...data, userId, requestId, image: bytes, imageMimeType: image?.mimeType },
      select: workSelect,
    });
  });
  res.status(201).json(workResponse(work));
}

export async function deleteWork(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id);
  const userId = req.user!.id;
  await withOwner(userId, async (tx) => {
    const work = await tx.practiceWork.findUnique({
      where: { id, userId },
      select: { requestId: true },
    });
    if (!work) return;
    await tx.practiceWork.deleteMany({ where: { id, userId } });
    await tx.practiceWorkRemoval.create({ data: { userId, requestId: work.requestId } });
    await tx.practiceShare.updateMany({
      where: { ownerId: userId, revokedAt: null, items: { none: {} } },
      data: { revokedAt: new Date() },
    });
  });
  res.sendStatus(204);
}

export async function appendReflection(req: AuthRequest, res: Response) {
  const parsed = reflectionSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'Добавьте подпись длиной до 600 символов.' });
  const workId = parseId(req.params.id);
  const userId = req.user!.id;
  const reflection = await withOwner(userId, async (tx) => {
    const work = await tx.practiceWork.findUnique({
      where: { id: workId, userId },
      select: { _count: { select: { reflections: true } } },
    });
    if (!work) fail(404, 'Работа не найдена.');
    const existing = await tx.practiceReflection.findUnique({
      where: { id: parsed.data.id, workId },
    });
    if (existing) return existing;
    if (work._count.reflections >= MAX_REFLECTIONS)
      fail(409, 'К работе уже добавлено 20 подписей.');
    return tx.practiceReflection.create({ data: { ...parsed.data, workId } });
  });
  res.status(201).json(reflection);
}

export async function readWorkImage(req: AuthRequest, res: Response) {
  const work = await prisma.practiceWork.findUnique({
    where: { id: parseId(req.params.id), userId: req.user!.id },
    select: { image: true, imageMimeType: true },
  });
  return sendImage(res, work?.image, work?.imageMimeType);
}

export async function listOutgoingShares(req: AuthRequest, res: Response) {
  const shares = await prisma.practiceShare.findMany({
    where: { ownerId: req.user!.id, revokedAt: null },
    select: {
      id: true,
      therapistId: true,
      createdAt: true,
      therapist: { select: { profile: { select: { name: true } } } },
      items: { orderBy: { position: 'asc' }, select: { title: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_SHARES,
  });
  res.json(
    shares
      .filter(({ therapist, items }) => therapist && items.length)
      .map(({ therapist, ...share }) => ({
        ...share,
        therapistName: therapist.profile?.name || 'Специалист',
      })),
  );
}

export async function createShare(req: AuthRequest, res: Response) {
  const parsed = shareSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'Выберите специалиста и содержимое для передачи.' });
  const ownerId = req.user!.id;
  const { id: requestId, therapistId, items } = parsed.data;
  if (ownerId === therapistId)
    return res.status(400).json({ error: 'Выберите другого получателя.' });
  const result = await withOwner(ownerId, async (tx) => {
    const existing = await tx.practiceShare.findUnique({
      where: { ownerId_requestId: { ownerId, requestId } },
    });
    if (existing?.revokedAt) fail(410, 'Эта подборка уже отозвана.');
    if (existing) return { id: existing.id, created: false };
    if ((await tx.practiceShare.count({ where: { ownerId, revokedAt: null } })) >= MAX_SHARES) {
      fail(409, 'Доступно до 20 активных подборок. Отзовите одну перед отправкой.');
    }
    const therapist = await tx.user.findUnique({
      where: { id: therapistId, role: 'THERAPIST' },
      select: { id: true },
    });
    if (!therapist) fail(400, 'Выбранный специалист больше недоступен.');

    const works = await tx.practiceWork.findMany({
      where: { userId: ownerId, id: { in: items.map((item) => item.workId) } },
      select: workSelect,
    });
    const byId = new Map(works.map((work) => [work.id, work]));
    const snapshots = items.map((item, position) => {
      const work = byId.get(item.workId);
      if (!work) fail(404, 'Одна из работ больше недоступна.');
      const selectedIds = new Set(item.reflectionIds);
      const reflections = work.reflections.filter((reflection) => selectedIds.has(reflection.id));
      if (
        reflections.length !== selectedIds.size ||
        (item.includeImage && !work.imageMimeType) ||
        (item.includeNote && !work.note)
      )
        fail(400, 'Содержимое подборки изменилось. Проверьте выбранные рисунки и подписи.');
      return {
        ownerId,
        workId: work.id,
        position,
        title: work.title,
        note: item.includeNote ? work.note : null,
        reflections: reflections.map(({ content, createdAt }) => ({
          content,
          createdAt: createdAt.toISOString(),
        })),
        includesImage: item.includeImage,
      };
    });
    const { id } = await tx.practiceShare.create({
      data: { ownerId, therapistId, requestId },
      select: { id: true },
    });
    await tx.practiceShareItem.createMany({
      data: snapshots.map((item) => ({ shareId: id, ...item })),
    });
    return { id, created: true };
  });
  if (result.created) {
    recordAudit({
      action: 'privacy.practice_share_granted',
      actorId: ownerId,
      subjectId: therapistId,
      outcome: 'success',
      meta: { shareId: result.id, works: items.length },
    });
  }
  res.status(result.created ? 201 : 200).json({ id: result.id });
}

export async function revokeShare(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id);
  const ownerId = req.user!.id;
  const revoked = await withOwner(ownerId, async (tx) => {
    const result = await tx.practiceShare.updateMany({
      where: { id, ownerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) return false;
    await tx.practiceShareItem.deleteMany({ where: { shareId: id, ownerId } });
    return true;
  });
  if (revoked) {
    recordAudit({
      action: 'privacy.practice_share_revoked',
      actorId: ownerId,
      outcome: 'success',
      meta: { shareId: id },
    });
  }
  res.sendStatus(204);
}

export async function listIncomingShares(req: AuthRequest, res: Response) {
  const scope = recipientScope(req.user!.id);
  let boundary: Prisma.PracticeShareWhereInput | undefined;
  if (req.query.cursor !== undefined) {
    const cursor = parseId(req.query.cursor);
    const anchor = await prisma.practiceShare.findFirst({
      where: { ...scope, id: cursor },
      select: { id: true, createdAt: true },
    });
    if (!anchor) return res.status(409).json({ error: 'Список изменился. Откройте его сначала.' });
    boundary = {
      OR: [
        { createdAt: { lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { lt: anchor.id } },
      ],
    };
  }
  const rows = await prisma.practiceShare.findMany({
    where: { ...scope, ...boundary },
    select: {
      id: true,
      createdAt: true,
      owner: { select: { profile: { select: { name: true } } } },
      items: { select: { workId: true }, where: { share: scope } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: SHARE_PAGE_SIZE + 1,
  });
  const page = rows.slice(0, SHARE_PAGE_SIZE);
  res.json({
    items: page
      .filter(({ owner, items }) => owner && items.length)
      .map(({ owner, id, createdAt, items }) => ({
        id,
        createdAt,
        ownerName: owner.profile?.name || 'Участник',
        workCount: items.length,
      })),
    nextCursor: rows.length > SHARE_PAGE_SIZE ? page[page.length - 1].id : null,
  });
}

export async function readIncomingShare(req: AuthRequest, res: Response) {
  const scope = recipientScope(req.user!.id);
  const share = await prisma.practiceShare.findFirst({
    where: { ...scope, id: parseId(req.params.id) },
    select: { items: { ...shareItems, where: { share: scope } } },
  });
  if (!share?.items.length) return res.status(404).json({ error: 'Подборка недоступна.' });
  res.json(share);
}

export async function readSharedImage(req: AuthRequest, res: Response) {
  const work = await prisma.practiceWork.findFirst({
    where: {
      id: parseId(req.params.workId),
      shareItems: {
        some: {
          shareId: parseId(req.params.id),
          includesImage: true,
          share: recipientScope(req.user!.id),
        },
      },
    },
    select: { image: true, imageMimeType: true },
  });
  return sendImage(res, work?.image, work?.imageMimeType);
}
