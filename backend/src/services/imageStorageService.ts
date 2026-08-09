import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const storageRoot = path.resolve(
  process.env.IMAGE_STORAGE_DIR || path.join(process.cwd(), 'data/images'),
);

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function storeImage(base64Image: string, mimeType: string) {
  const extension = extensions[mimeType];
  if (!extension) throw new Error('Unsupported image type');
  await mkdir(storageRoot, { recursive: true });
  const key = `${randomUUID()}.${extension}`;
  await writeFile(path.join(storageRoot, key), Buffer.from(base64Image, 'base64'), { flag: 'wx' });
  return key;
}

export async function readStoredImage(key: string) {
  if (!/^[a-f0-9-]+\.(?:jpg|png|webp)$/.test(key)) throw new Error('Invalid image key');
  return readFile(path.join(storageRoot, key));
}

export async function removeStoredImage(key: string) {
  if (!/^[a-f0-9-]+\.(?:jpg|png|webp)$/.test(key)) return;
  await unlink(path.join(storageRoot, key)).catch(() => undefined);
}
