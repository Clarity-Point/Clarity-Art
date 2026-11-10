import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const { removeImage } = vi.hoisted(() => ({ removeImage: vi.fn() }));
vi.mock('../services/imageStorageService', () => ({
  removeStoredImage: removeImage,
  storeImage: vi.fn(),
  readStoredImage: vi.fn(),
}));
import prisma from '../config/prisma';
import app from '../index';
import { JWT_SECRET } from '../config/secrets';
import { processImageDeletions } from '../services/imageDeletionService';

describe.runIf(process.env.RUN_DATABASE_TESTS === 'true')('data integrity in PostgreSQL', () => {
  const owner = randomUUID(),
    other = randomUUID(),
    manager = randomUUID();
  const org = randomUUID(),
    otherOrg = randomUUID(),
    course = randomUUID(),
    homework = randomUUID();
  const storageKey = `${randomUUID()}.png`;
  const cookie = (id: string) => `ty_session=${jwt.sign({ id, sessionVersion: 0 }, JWT_SECRET)}`;
  beforeAll(async () => {
    await prisma.organization.createMany({
      data: [
        { id: org, name: 'Original', inviteCode: org },
        { id: otherOrg, name: 'Destination', inviteCode: otherOrg.toUpperCase() },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: owner,
          email: `${owner}@example.test`,
          password: await bcrypt.hash('delete-password', 12),
        },
        { id: other, email: `${other}@example.test`, password: 'unused' },
        {
          id: manager,
          email: `${manager}@example.test`,
          password: 'unused',
          role: 'ORG_ADMIN',
          organizationId: org,
        },
      ],
    });
    await prisma.course.create({
      data: {
        id: course,
        slug: course,
        title: 'Integrity',
        description: 'Fixture',
        category: 'general',
        targetAudience: [],
        goals: [],
        homework: { create: { id: homework, title: 'Task', description: 'Task' } },
      },
    });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, other, manager] } } });
    await prisma.course.deleteMany({ where: { id: course } });
    await prisma.organization.deleteMany({ where: { id: { in: [org, otherOrg] } } });
    await prisma.imageDeletion.deleteMany({ where: { storageKey } });
    await prisma.$disconnect();
  });

  it('does not transfer an organization administrator through a membership invite', async () => {
    const response = await request(app)
      .post('/api/org/join')
      .set('Cookie', cookie(manager))
      .send({ inviteCode: otherOrg });
    expect(response.status).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: manager } })).organizationId).toBe(
      org,
    );
    expect(
      (
        await request(app)
          .post('/api/org/join')
          .set('Cookie', cookie(other))
          .send({ inviteCode: otherOrg })
      ).status,
    ).toBe(200);
    expect(
      (await request(app).delete('/api/org/leave').set('Cookie', cookie(manager))).status,
    ).toBe(409);
    expect((await request(app).delete('/api/org/leave').set('Cookie', cookie(other))).status).toBe(
      204,
    );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: other } })).organizationId,
    ).toBeNull();
  });

  it('protects submissions and course progress even if the application precheck is bypassed', async () => {
    await prisma.submission.create({
      data: { userId: owner, homeworkId: homework, submittedContent: 'Keep me' },
    });
    await prisma.courseProgress.create({ data: { userId: owner, courseId: course } });
    await expect(prisma.homework.delete({ where: { id: homework } })).rejects.toMatchObject({
      code: 'P2003',
    });
    await expect(prisma.course.delete({ where: { id: course } })).rejects.toMatchObject({
      code: 'P2003',
    });
    expect(await prisma.submission.count({ where: { userId: owner } })).toBe(1);
    expect(await prisma.courseProgress.count({ where: { userId: owner } })).toBe(1);
  });

  it('allows only one diary edit of a version and rejects stale or foreign edits', async () => {
    const entry = await prisma.diaryEntry.create({ data: { userId: owner, content: 'Original' } });
    const edit = (content: string, version = 1, id = owner) =>
      request(app)
        .put(`/api/diary/${entry.id}`)
        .set('Cookie', cookie(id))
        .send({ content, version });
    expect((await edit('Foreign', 1, other)).status).toBe(404);
    const responses = await Promise.all([edit('First'), edit('Second')]);
    expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
    expect((await edit('Stale')).status).toBe(409);
    const saved = await prisma.diaryEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(saved.version).toBe(2);
    expect(['First', 'Second']).toContain(saved.content);
  });

  it('paginates notifications without exposing another account and reports the total unread count', async () => {
    await prisma.notification.createMany({
      data: [
        ...Array.from({ length: 3 }, (_, i) => ({
          userId: owner,
          title: `Notice ${i}`,
          message: 'Own',
        })),
        { userId: other, title: 'Foreign', message: 'Private' },
      ],
    });
    const first = await request(app).get('/api/notifications?limit=2').set('Cookie', cookie(owner));
    expect(first.body).toHaveLength(2);
    expect(first.headers['x-unread-count']).toBe('3');
    const second = await request(app)
      .get('/api/notifications')
      .query({ limit: 2, cursor: first.headers['x-next-cursor'] })
      .set('Cookie', cookie(owner));
    expect(second.body).toHaveLength(1);
    expect(second.headers['x-next-cursor']).toBeUndefined();
    expect(new Set([...first.body, ...second.body].map((row) => row.id)).size).toBe(3);
    expect(JSON.stringify([first.body, second.body])).not.toContain('Foreign');
    expect(
      (await request(app).get('/api/notifications?limit=100000').set('Cookie', cookie(owner)))
        .status,
    ).toBe(400);
  });

  it('retains a durable deletion task after a disk failure and completes it on retry', async () => {
    await prisma.imageAnalysis.create({
      data: { userId: owner, prompt: 'Fixture', result: 'Fixture', imageStorageKey: storageKey },
    });
    removeImage.mockRejectedValueOnce(
      Object.assign(new Error('Disk unavailable'), { code: 'EACCES' }),
    );
    expect(
      (
        await request(app)
          .delete('/api/account')
          .set('Cookie', cookie(owner))
          .send({ password: 'delete-password' })
      ).status,
    ).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: owner } })).toBeNull();
    expect(await prisma.submission.count({ where: { userId: owner } })).toBe(0);
    await vi.waitFor(async () => {
      const task = await prisma.imageDeletion.findUniqueOrThrow({ where: { storageKey } });
      expect(task.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    });
    removeImage.mockResolvedValue(undefined);
    await prisma.imageDeletion.update({
      where: { storageKey },
      data: { nextAttemptAt: new Date(0) },
    });
    await processImageDeletions();
    expect(await prisma.imageDeletion.findUnique({ where: { storageKey } })).toBeNull();
    expect(removeImage).toHaveBeenCalledWith(storageKey);
  });
});
