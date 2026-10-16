import { describe, expect, it, vi } from 'vitest';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
const { userLookup, text, end, pipe } = vi.hoisted(() => ({
  userLookup: vi.fn(),
  text: vi.fn(),
  end: vi.fn(),
  pipe: vi.fn(),
}));
vi.mock('../config/prisma', () => ({ default: { user: { findUnique: userLookup } } }));
vi.mock('node:fs', () => ({ default: { existsSync: () => true } }));
vi.mock('pdfkit', () => ({
  default: class {
    page = { width: 600, height: 800 };
    y = 0;
    registerFont() {
      return this;
    }
    font() {
      return this;
    }
    rect() {
      return this;
    }
    fill() {
      return this;
    }
    fillColor() {
      return this;
    }
    fontSize() {
      return this;
    }
    text(...args: unknown[]) {
      text(...args);
      return this;
    }
    moveDown() {
      return this;
    }
    addPage() {
      return this;
    }
    pipe = pipe;
    end = end;
  },
}));
import { exportDiaryPDF } from '../controllers/exportController';

describe('diary PDF export', () => {
  it('exports the authenticated owner’s actual diary content', async () => {
    userLookup.mockResolvedValue({
      profile: { name: 'Автор' },
      points: 0,
      streak: 0,
      diaryEntries: [{ date: '2026-10-16T10:00:00Z', content: 'Моя дневниковая запись' }],
      imageAnalyses: [],
      courseProgress: [],
      submissions: [],
    });
    const response = { setHeader: vi.fn() };
    await exportDiaryPDF(
      { user: { id: 'owner-1' } } as AuthRequest,
      response as unknown as Response,
    );
    expect(userLookup).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'owner-1' } }));
    expect(text).toHaveBeenCalledWith('Моя дневниковая запись');
    expect(pipe).toHaveBeenCalledWith(response);
    expect(end).toHaveBeenCalledOnce();
  });
});
