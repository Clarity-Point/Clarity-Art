import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

const paramsSchema = z
  .object({
    kind: z.enum(['diary', 'homework']),
    key: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/),
  })
  .refine((value) => value.kind !== 'diary' || value.key === 'new');
const draftSchema = z.object({
  text: z.string().max(20_000),
  version: z.number().int().min(0).max(2_147_483_646),
});
export const getDraft = async (req: AuthRequest, res: Response) => {
  const params = paramsSchema.safeParse(req.params);
  if (!req.user || !params.success) return res.status(400).json({ error: 'Некорректный черновик' });
  const draft = await prisma.draft.findUnique({
    where: { userId_kind_key: { userId: req.user.id, ...params.data } },
  });
  res.json(
    draft
      ? { text: draft.text, version: draft.version, updatedAt: draft.updatedAt }
      : { text: '', version: 0, updatedAt: null },
  );
};
export const saveDraft = async (req: AuthRequest, res: Response) => {
  const params = paramsSchema.safeParse(req.params);
  const body = draftSchema.safeParse(req.body);
  if (
    !req.user ||
    !params.success ||
    !body.success ||
    (params.data.kind === 'diary' && body.data.text.length > 5_000)
  )
    return res.status(400).json({ error: 'Некорректный черновик или превышена длина текста' });
  const where = { userId: req.user.id, ...params.data };
  if (
    where.kind === 'homework' &&
    !(await prisma.homework.findUnique({ where: { id: where.key }, select: { id: true } }))
  )
    return res.status(404).json({ error: 'Задание не найдено' });
  try {
    if (body.data.version === 0) {
      const created = await prisma.draft.create({ data: { ...where, text: body.data.text } });
      return res.json({ version: created.version, updatedAt: created.updatedAt });
    }
    const updated = await prisma.draft.updateMany({
      where: { ...where, version: body.data.version },
      data: { text: body.data.text, version: { increment: 1 } },
    });
    if (!updated.count)
      return res.status(409).json({
        error:
          'Черновик изменён в другой вкладке. Скопируйте свой текст и загрузите сохранённую версию.',
      });
    return res.json({ version: body.data.version + 1, updatedAt: new Date() });
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002')
      return res.status(409).json({
        error: 'Черновик уже сохранён в другой вкладке. Скопируйте свой текст перед обновлением.',
      });
    throw error;
  }
};
