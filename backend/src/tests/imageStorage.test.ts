import { beforeEach, describe, expect, it, vi } from 'vitest';
const { unlink } = vi.hoisted(() => ({ unlink: vi.fn() }));
vi.mock('node:fs/promises', () => ({
  unlink,
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
import { removeStoredImage } from '../services/imageStorageService';

beforeEach(() => vi.resetAllMocks());
describe('image removal', () => {
  it('ignores an already removed file but propagates disk and permission failures', async () => {
    unlink.mockRejectedValueOnce({ code: 'ENOENT' });
    await expect(removeStoredImage('abc-123.png')).resolves.toBeUndefined();
    unlink.mockRejectedValueOnce({ code: 'EACCES' });
    await expect(removeStoredImage('abc-123.png')).rejects.toMatchObject({ code: 'EACCES' });
  });
  it('rejects paths outside storage without touching the filesystem', async () => {
    await expect(removeStoredImage('../private.png')).rejects.toThrow('Invalid image key');
    expect(unlink).not.toHaveBeenCalled();
  });
});
