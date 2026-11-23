import type { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import type { AuthRequest } from '../middleware/auth';
import {
  assertWorkCapacity,
  caption,
  decodePracticeImage,
  fail,
  idSchema,
  imageSchema,
  nonemptyPracticeDraft,
  practiceIdSchema,
  withOwner,
  workResponse,
  workSelect,
} from '../services/practiceStorage';

const version = z.number().int().min(0).max(2_147_483_646);
const empty = {
  title: '',
  note: '',
  mode: 'paper' as const,
  attachmentKind: null,
  image: null,
  imageMimeType: null,
};
const snapshot = z
  .object({
    title: z
      .string()
      .trim()
      .max(100)
      .refine((value) => !value.includes('\0')),
    note: caption,
    mode: z.enum(['paper', 'canvas']),
    attachmentKind: z.enum(['canvas', 'photo']).nullable(),
    image: imageSchema.nullable(),
  })
  .refine(({ attachmentKind, image }) => Boolean(attachmentKind) === Boolean(image));
const write = z.object({ version, mutationId: idSchema, snapshot: snapshot.nullable() });
const finalize = z.object({ version, id: idSchema });

function practiceId(req: AuthRequest) {
  const id = practiceIdSchema.safeParse(req.params.id);
  if (!id.success) fail(404, 'Практика не найдена.');
  return id.data;
}

function conflict(res: Response) {
  return res
    .status(409)
    .json({ code: 'DRAFT_CONFLICT', error: 'Черновик изменился в другой вкладке.' });
}

export async function listPracticeDrafts(req: AuthRequest, res: Response) {
  res.json(
    await prisma.practiceDraft.findMany({
      where: { userId: req.user!.id, ...nonemptyPracticeDraft },
      select: { practiceId: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { practiceId: 'asc' }],
    }),
  );
}

export async function readPracticeDraft(req: AuthRequest, res: Response) {
  const row = await prisma.practiceDraft.findUnique({
    where: { userId_practiceId: { userId: req.user!.id, practiceId: practiceId(req) } },
  });
  const { image, imageMimeType, title, note, mode, attachmentKind } = row ?? empty;
  res.json({
    version: row?.version ?? 0,
    mutationId: row?.mutationId ?? null,
    updatedAt: row?.updatedAt ?? null,
    snapshot: {
      title,
      note,
      mode,
      attachmentKind,
      image: image
        ? { mimeType: imageMimeType, base64: Buffer.from(image).toString('base64') }
        : null,
    },
  });
}

export async function putPracticeDraft(req: AuthRequest, res: Response) {
  const parsed = write.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Некорректный черновик практики.' });
  const userId = req.user!.id;
  const id = practiceId(req);
  const { version, mutationId, snapshot } = parsed.data;
  const image = snapshot?.image ? decodePracticeImage(snapshot.image) : null;
  const data = snapshot
    ? { ...snapshot, image, imageMimeType: snapshot.image?.mimeType ?? null }
    : empty;
  const where = { userId_practiceId: { userId, practiceId: id } };
  const result = await withOwner(userId, async (tx) => {
    const existing = await tx.practiceDraft.findUnique({ where, select: { version: true } });
    if ((existing?.version ?? 0) !== version) return null;
    const values = { ...data, version: version + 1, mutationId };
    const select = { version: true, updatedAt: true } as const;
    if (existing) return tx.practiceDraft.update({ where, data: values, select });
    return tx.practiceDraft.create({ data: { userId, practiceId: id, ...values }, select });
  });
  return result ? res.json(result) : conflict(res);
}

export async function finalizePracticeDraft(req: AuthRequest, res: Response) {
  const parsed = finalize.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Некорректная версия черновика.' });
  const userId = req.user!.id;
  const id = practiceId(req);
  const { version, id: requestId } = parsed.data;
  const where = { userId_practiceId: { userId, practiceId: id } };
  const result = await withOwner(userId, async (tx) => {
    const key = { userId_requestId: { userId, requestId } };
    if (await tx.practiceWorkRemoval.findUnique({ where: key }))
      fail(410, 'Эта работа уже удалена.');
    const existing = await tx.practiceWork.findUnique({
      where: key,
      select: { ...workSelect, finalizedDraftVersion: true },
    });
    if (existing) {
      if (existing.practiceId !== id || existing.finalizedDraftVersion !== version)
        fail(409, 'Идентификатор уже использован для другой операции.');
      return existing;
    }
    const draft = await tx.practiceDraft.findUnique({ where });
    if (!draft || draft.version !== version) return null;
    if (!draft.title || (!draft.note && !draft.image))
      fail(400, 'Укажите название и добавьте рисунок или подпись.');
    await assertWorkCapacity(tx, userId);
    const work = await tx.practiceWork.create({
      data: {
        userId,
        requestId,
        practiceId: id,
        finalizedDraftVersion: version,
        title: draft.title,
        note: draft.note,
        image: draft.image,
        imageMimeType: draft.imageMimeType,
      },
      select: workSelect,
    });
    await tx.practiceDraft.update({
      where,
      data: { ...empty, mutationId: null, version: version + 1 },
    });
    return work;
  });
  return result ? res.status(201).json(workResponse(result)) : conflict(res);
}
