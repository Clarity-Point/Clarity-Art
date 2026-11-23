import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/prisma';
import { validateImageInput } from '../security/inputValidation';
import { isPracticeId } from './practiceCatalog';

const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_WORKS = 30;
export const idSchema = z.uuid();
export const practiceIdSchema = z.string().max(40).refine(isPracticeId);
export const caption = z
  .string()
  .trim()
  .max(600)
  .refine((text) => !text.includes('\0'));
export const imageSchema = z.object({
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  base64: z.string().max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4),
});
export const workSelect = {
  id: true,
  practiceId: true,
  title: true,
  note: true,
  imageMimeType: true,
  createdAt: true,
  reflections: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.PracticeWorkSelect;

export function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

export function withOwner<T>(userId: string, action: (tx: Prisma.TransactionClient) => Promise<T>) {
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

export function parseId(value: unknown) {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) fail(404, 'Запись не найдена.');
  return parsed.data;
}

export function workResponse(work: Prisma.PracticeWorkGetPayload<{ select: typeof workSelect }>) {
  const { imageMimeType, ...data } = work;
  return { ...data, hasImage: Boolean(imageMimeType) };
}

export async function assertWorkCapacity(tx: Prisma.TransactionClient, userId: string) {
  if ((await tx.practiceWork.count({ where: { userId } })) >= MAX_WORKS) {
    fail(409, 'В альбоме уже 30 работ. Удалите одну из них перед сохранением новой.');
  }
}

export function decodePracticeImage(image: z.infer<typeof imageSchema>) {
  if (!validateImageInput(image.mimeType, image.base64, MAX_IMAGE_BYTES + 2).ok)
    fail(400, 'Выберите изображение PNG, JPEG или WebP до 1 МиБ.');
  const bytes = Buffer.from(image.base64, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) fail(400, 'Изображение больше 1 МиБ.');
  return bytes;
}

export const nonemptyPracticeDraft = {
  OR: [{ title: { not: '' } }, { note: { not: '' } }, { imageMimeType: { not: null } }],
};
