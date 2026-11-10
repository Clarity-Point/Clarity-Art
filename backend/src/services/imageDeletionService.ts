import prisma from '../config/prisma';
import { removeStoredImage } from './imageStorageService';
import { createLogger } from '../config/logger';

const log = createLogger('imageDeletion');
let running = false;

export async function processImageDeletions(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const pending = await prisma.imageDeletion.findMany({
      where: { nextAttemptAt: { lte: new Date() } },
      orderBy: [{ nextAttemptAt: 'asc' }, { storageKey: 'asc' }],
      take: 50,
    });
    for (const { storageKey } of pending) {
      try {
        await removeStoredImage(storageKey);
        await prisma.imageDeletion.deleteMany({ where: { storageKey } });
      } catch (err) {
        await prisma.imageDeletion.updateMany({
          where: { storageKey },
          data: { nextAttemptAt: new Date(Date.now() + 60_000) },
        });
        log.error({ err, storageKey }, 'Image deletion deferred for retry');
      }
    }
  } catch (err) {
    log.error({ err }, 'Image deletion queue unavailable');
  } finally {
    running = false;
  }
}
