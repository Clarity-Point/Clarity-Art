import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
const mocks = vi.hoisted(() => ({
  draft: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  homework: { findUnique: vi.fn() },
  diaryEntry: { findMany: vi.fn() },
  moodCheckIn: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  imageAnalysis: { findFirst: vi.fn() },
  galleryReport: { upsert: vi.fn() },
  hiddenImage: { upsert: vi.fn() },
  transaction: vi.fn(),
  reset: { findUnique: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  user: { updateMany: vi.fn(), findUnique: vi.fn() },
  hash: vi.fn(),
  sendMail: vi.fn(),
  close: vi.fn(),
}));
vi.mock('../config/prisma', () => ({
  default: {
    draft: mocks.draft,
    homework: mocks.homework,
    diaryEntry: mocks.diaryEntry,
    moodCheckIn: mocks.moodCheckIn,
    imageAnalysis: mocks.imageAnalysis,
    galleryReport: mocks.galleryReport,
    hiddenImage: mocks.hiddenImage,
    passwordReset: mocks.reset,
    user: mocks.user,
    $transaction: mocks.transaction,
  },
}));
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash } }));
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: mocks.sendMail, close: mocks.close }) },
}));
import { getDraft, saveDraft } from '../controllers/draftController';
import { getHistory } from '../controllers/historyController';
import { saveMoodCheckIn, deleteMoodCheckIn } from '../controllers/moodCheckInController';
import { reportImage } from '../controllers/moderationController';
import {
  consumePasswordReset,
  issuePasswordReset,
  resetTokenHash,
} from '../services/passwordResetService';
function response() {
  const res = { status: vi.fn(), json: vi.fn(), end: vi.fn(), sendStatus: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
function req(input: Record<string, unknown> = {}) {
  return {
    user: { id: 'owner' },
    params: { kind: 'diary', key: 'new' },
    body: {},
    query: {},
    ...input,
  } as unknown as AuthRequest;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.hash.mockResolvedValue('password-hash');
});
describe('server drafts', () => {
  it('reads only the current account compound key', async () => {
    mocks.draft.findUnique.mockResolvedValue(null);
    const res = response();
    await getDraft(req(), res as unknown as Response);
    expect(mocks.draft.findUnique).toHaveBeenCalledWith({
      where: { userId_kind_key: { userId: 'owner', kind: 'diary', key: 'new' } },
    });
    expect(res.json).toHaveBeenCalledWith({ text: '', version: 0, updatedAt: null });
  });
  it('rejects stale versions without overwriting text', async () => {
    mocks.draft.updateMany.mockResolvedValue({ count: 0 });
    const res = response();
    await saveDraft(
      req({ body: { text: 'mine', version: 3, userId: 'someone-else' } }),
      res as unknown as Response,
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mocks.draft.updateMany).toHaveBeenCalledWith({
      where: { userId: 'owner', kind: 'diary', key: 'new', version: 3 },
      data: { text: 'mine', version: { increment: 1 } },
    });
  });
  it('handles concurrent first saves and rejects invalid keys/oversized diary text', async () => {
    mocks.draft.create.mockRejectedValue({ code: 'P2002' });
    const res = response();
    await saveDraft(req({ body: { text: 'mine', version: 0 } }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(409);
    mocks.draft.create.mockClear();
    await saveDraft(
      req({ body: { text: 'a'.repeat(5001), version: 0 } }),
      res as unknown as Response,
    );
    await saveDraft(
      req({ params: { kind: 'diary', key: 'arbitrary' }, body: { text: 'x', version: 0 } }),
      res as unknown as Response,
    );
    expect(mocks.draft.create).not.toHaveBeenCalled();
  });
});
describe('full history', () => {
  it('applies owner, text, period and stable keyset pagination together', async () => {
    const date = new Date('2026-01-02T00:00:00Z');
    mocks.diaryEntry.findMany.mockResolvedValue([
      { id: '2', date, content: 'a' },
      { id: '1', date, content: 'b' },
    ]);
    const res = response();
    await getHistory(
      req({ query: { kind: 'diary', q: 'личное', from: '2026-01-01T00:00:00Z', limit: '1' } }),
      res as unknown as Response,
    );
    expect(mocks.diaryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'owner',
          content: { contains: 'личное', mode: 'insensitive' },
          date: { gte: new Date('2026-01-01T00:00:00Z') },
        }),
        take: 2,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
    );
    const result = res.json.mock.calls[0][0];
    expect(result.items).toHaveLength(1);
    const next = response();
    await getHistory(
      req({ query: { kind: 'diary', cursor: result.nextCursor } }),
      next as unknown as Response,
    );
    expect(mocks.diaryEntry.findMany.mock.calls[1][0].where.AND[0].OR[1]).toEqual({
      date,
      id: { lt: '2' },
    });
  });
  it('rejects malformed cursors before querying the database', async () => {
    const res = response();
    await getHistory(req({ query: { cursor: 'broken' } }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.diaryEntry.findMany).not.toHaveBeenCalled();
  });
});
describe('manual mood check-ins', () => {
  it('bounds scores and calendar dates', async () => {
    const res = response();
    for (const body of [
      { day: '2026-02-30', score: 3 },
      { day: '2026-01-01', score: 6 },
      { day: '2026-01-01', score: 1.5 },
    ])
      await saveMoodCheckIn(req({ body }), res as unknown as Response);
    expect(mocks.moodCheckIn.upsert).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledTimes(3);
  });
  it('upserts and deletes only records owned by the caller', async () => {
    const res = response();
    await saveMoodCheckIn(
      req({ body: { day: '2026-01-01', score: 4, note: 'Моя оценка', userId: 'other' } }),
      res as unknown as Response,
    );
    expect(mocks.moodCheckIn.upsert.mock.calls[0][0].where).toEqual({
      userId_day: { userId: 'owner', day: new Date('2026-01-01') },
    });
    mocks.moodCheckIn.deleteMany.mockResolvedValue({ count: 0 });
    await deleteMoodCheckIn(req({ params: { id: 'foreign' } }), res as unknown as Response);
    expect(mocks.moodCheckIn.deleteMany).toHaveBeenCalledWith({
      where: { id: 'foreign', userId: 'owner' },
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
describe('gallery reporting', () => {
  it('rejects unavailable or blocked publications', async () => {
    mocks.imageAnalysis.findFirst.mockResolvedValue(null);
    const res = response();
    await reportImage(
      req({ params: { id: 'blocked' }, body: { reason: 'privacy' } }),
      res as unknown as Response,
    );
    expect(mocks.imageAnalysis.findFirst.mock.calls[0][0].where).toEqual({
      id: 'blocked',
      isPublic: true,
      moderationStatus: 'VISIBLE',
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('atomically reports and hides a publication for the caller', async () => {
    mocks.imageAnalysis.findFirst.mockResolvedValue({ id: 'image' });
    const res = response();
    await reportImage(
      req({ params: { id: 'image' }, body: { reason: 'spam' } }),
      res as unknown as Response,
    );
    expect(mocks.galleryReport.upsert.mock.calls[0][0].where).toEqual({
      reporterId_imageId: { reporterId: 'owner', imageId: 'image' },
    });
    expect(mocks.hiddenImage.upsert.mock.calls[0][0].where).toEqual({
      userId_imageId: { userId: 'owner', imageId: 'image' },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
describe('single-use password recovery', () => {
  const token = 'a'.repeat(64);
  const reset = {
    id: 'reset',
    userId: 'owner',
    sessionVersion: 7,
    tokenHash: resetTokenHash(token),
    expiresAt: new Date(Date.now() + 60000),
  };
  beforeEach(() => {
    mocks.transaction.mockImplementation(async (fn) =>
      fn({ passwordReset: mocks.reset, user: mocks.user }),
    );
  });
  it('consumes only the hashed, unexpired token and revokes existing sessions', async () => {
    mocks.reset.findUnique.mockResolvedValue(reset);
    mocks.reset.deleteMany.mockResolvedValue({ count: 1 });
    mocks.user.updateMany.mockResolvedValue({ count: 1 });
    expect(await consumePasswordReset(token, 'new-password')).toBe(true);
    expect(mocks.reset.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: resetTokenHash(token) },
    });
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'owner', sessionVersion: 7 },
      data: { password: 'password-hash', sessionVersion: { increment: 1 } },
    });
  });
  it('does not update a password when another request already consumed the token', async () => {
    mocks.reset.findUnique.mockResolvedValue(reset);
    mocks.reset.deleteMany.mockResolvedValue({ count: 0 });
    expect(await consumePasswordReset(token, 'new-password')).toBe(false);
    expect(mocks.user.updateMany).not.toHaveBeenCalled();
  });
  it('rejects expired links and tokens issued before a password change', async () => {
    mocks.reset.findUnique.mockResolvedValue({ ...reset, expiresAt: new Date(0) });
    expect(await consumePasswordReset(token, 'new-password')).toBe(false);
    expect(mocks.reset.deleteMany).not.toHaveBeenCalled();
    mocks.reset.findUnique.mockResolvedValue(reset);
    mocks.reset.deleteMany.mockResolvedValue({ count: 1 });
    mocks.user.updateMany.mockResolvedValue({ count: 0 });
    expect(await consumePasswordReset(token, 'new-password')).toBe(false);
  });
  it('does not deliver a duplicate request within the per-account cooldown', async () => {
    vi.stubEnv('SMTP_URL', 'smtp://localhost:2525');
    vi.stubEnv('MAIL_FROM', 'clarity@example.test');
    mocks.user.findUnique.mockResolvedValue({
      id: 'owner',
      email: 'owner@example.test',
      sessionVersion: 1,
    });
    mocks.reset.findUnique.mockResolvedValue({ createdAt: new Date() });
    mocks.reset.updateMany.mockResolvedValue({ count: 0 });
    try {
      await issuePasswordReset('owner@example.test');
      expect(mocks.sendMail).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
