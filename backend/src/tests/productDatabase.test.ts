import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import app from '../index';
import { JWT_SECRET } from '../config/secrets';
import {
  consumePasswordReset,
  issuePasswordReset,
  resetTokenHash,
} from '../services/passwordResetService';

// Opt-in: CI supplies a migrated, disposable PostgreSQL database. No truncation
// or schema reset is performed; only this suite's random fixtures are removed.
describe.runIf(process.env.RUN_DATABASE_TESTS === 'true')(
  'product flows against PostgreSQL',
  () => {
    const owner = randomUUID(),
      other = randomUUID(),
      admin = randomUUID(),
      courseId = randomUUID(),
      imageId = randomUUID();
    let lessonId = '',
      homeworkId = '';
    const slug = `integration-${courseId}`;
    const cookie = (id: string) =>
      `ty_session=${jwt.sign({ id, sessionVersion: 0 }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' })}`;
    beforeAll(async () => {
      await prisma.user.createMany({
        data: [
          { id: owner, email: `${owner}@example.test`, password: 'unused-test-hash' },
          { id: other, email: `${other}@example.test`, password: 'unused-test-hash' },
          {
            id: admin,
            email: `${admin}@example.test`,
            password: 'unused-test-hash',
            role: 'ADMIN',
          },
        ],
      });
      const course = await prisma.course.create({
        data: {
          id: courseId,
          slug,
          title: 'Integration course',
          description: 'Integration fixture',
          category: 'general',
          targetAudience: [],
          goals: [],
          modules: {
            create: {
              title: 'Module',
              lessons: { create: { title: 'Lesson', content: 'Readable material' } },
            },
          },
          homework: { create: { title: 'Assignment', description: 'Describe your experience' } },
        },
        include: { modules: { include: { lessons: true } }, homework: true },
      });
      lessonId = course.modules[0].lessons[0].id;
      homeworkId = course.homework[0].id;
      await prisma.imageAnalysis.create({
        data: { id: imageId, userId: owner, prompt: 'Fixture', result: 'Text', isPublic: true },
      });
    });
    afterAll(async () => {
      await prisma.course.deleteMany({ where: { id: courseId } });
      await prisma.user.deleteMany({ where: { id: { in: [owner, other, admin] } } });
      await prisma.$disconnect();
    });
    it('enforces draft ownership and allows exactly one concurrent version update', async () => {
      const url = '/api/drafts/diary/new';
      expect(
        (
          await request(app)
            .put(url)
            .set('Cookie', cookie(owner))
            .send({ text: 'private draft', version: 0 })
        ).status,
      ).toBe(200);
      expect((await request(app).get(url).set('Cookie', cookie(other))).body.text).toBe('');
      const responses = await Promise.all(
        ['first', 'second'].map((text) =>
          request(app).put(url).set('Cookie', cookie(owner)).send({ text, version: 1 }),
        ),
      );
      expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
      expect(
        (
          await prisma.draft.findUniqueOrThrow({
            where: { userId_kind_key: { userId: owner, kind: 'diary', key: 'new' } },
          })
        ).version,
      ).toBe(2);
    });
    it('searches full history with stable pagination and excludes another account', async () => {
      const date = new Date('2026-01-02T12:00:00Z');
      await prisma.diaryEntry.createMany({
        data: [
          { userId: owner, content: 'needle one', date },
          { userId: owner, content: 'needle two', date },
          { userId: other, content: 'needle foreign', date },
        ],
      });
      const first = await request(app)
        .get('/api/history')
        .query({ kind: 'diary', q: 'needle', limit: 1 })
        .set('Cookie', cookie(owner));
      expect(first.status).toBe(200);
      expect(first.body.items).toHaveLength(1);
      expect(first.body.nextCursor).toBeTruthy();
      const next = await request(app)
        .get('/api/history')
        .query({ kind: 'diary', q: 'needle', limit: 1, cursor: first.body.nextCursor })
        .set('Cookie', cookie(owner));
      expect(next.body.items).toHaveLength(1);
      expect(next.body.items[0].id).not.toBe(first.body.items[0].id);
      expect(next.body.nextCursor).toBeNull();
      expect(JSON.stringify([first.body, next.body])).not.toContain('foreign');
    });
    it('persists reading position without progress rewards and scopes homework submissions', async () => {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: owner } });
      expect(
        (
          await request(app)
            .put(`/api/courses/${slug}/position`)
            .set('Cookie', cookie(owner))
            .send({ lessonId })
        ).status,
      ).toBe(204);
      const position = await prisma.courseProgress.findUniqueOrThrow({
        where: { userId_courseId: { userId: owner, courseId } },
      });
      expect(position.lastLessonId).toBe(lessonId);
      expect(position.progress).toBe(0);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: owner } })).points).toBe(
        before.points,
      );
      await prisma.submission.create({
        data: { userId: owner, homeworkId, submittedContent: 'private answer' },
      });
      const own = await request(app)
        .get(`/api/homework/${homeworkId}`)
        .set('Cookie', cookie(owner));
      expect(own.body.submission.submittedContent).toBe('private answer');
      const foreign = await request(app)
        .get(`/api/homework/${homeworkId}`)
        .set('Cookie', cookie(other));
      expect(foreign.body.submission).toBeNull();
      expect(
        (
          await request(app)
            .put(`/api/admin/lessons/${lessonId}`)
            .set('Cookie', cookie(other))
            .send({ title: 'hijack', content: 'wrong' })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .put(`/api/admin/lessons/${lessonId}`)
            .set('Cookie', cookie(admin))
            .send({ title: 'Edited lesson', content: 'New material' })
        ).status,
      ).toBe(204);
    });
    it('resubmission clears feedback and a stale review cannot grade the new answer', async () => {
      const submit = (submittedContent: string) =>
        request(app)
          .post('/api/homework')
          .set('Cookie', cookie(owner))
          .send({ homeworkId, submittedContent });
      const first = await submit('First answer');
      expect(first.status).toBe(200);
      const review = {
        userId: owner,
        homeworkId,
        grade: 'Reviewed',
        analysisText: 'Old feedback',
        submissionDate: first.body.submission.submissionDate,
      };
      expect(
        (
          await request(app)
            .post('/api/admin/submissions/grade')
            .set('Cookie', cookie(admin))
            .send(review)
        ).status,
      ).toBe(204);
      const second = await submit('Revised answer');
      expect(second.status).toBe(200);
      expect(second.body.submission.grade).toBeNull();
      expect(second.body.submission.analysisText).toBeNull();
      expect(second.body.pointsAwarded).toBe(0);
      expect(
        (
          await request(app)
            .post('/api/admin/submissions/grade')
            .set('Cookie', cookie(admin))
            .send(review)
        ).status,
      ).toBe(409);
      expect(
        (
          await prisma.submission.findUniqueOrThrow({
            where: { userId_homeworkId: { userId: owner, homeworkId } },
          })
        ).grade,
      ).toBeNull();
    });
    it('upserts manual mood independently and does not let another account delete it', async () => {
      const put = () =>
        request(app)
          .put('/api/mood-checkins')
          .set('Cookie', cookie(owner))
          .send({ day: '2026-01-01', score: 4, note: 'A walk' });
      const first = await put();
      expect(first.status).toBe(200);
      expect((await put()).body.id).toBe(first.body.id);
      expect(
        (
          await request(app)
            .delete(`/api/mood-checkins/${first.body.id}`)
            .set('Cookie', cookie(other))
        ).status,
      ).toBe(404);
      expect(
        (await request(app).get('/api/mood-checkins').set('Cookie', cookie(other))).body.items,
      ).toEqual([]);
      expect(await prisma.sentimentTrend.count({ where: { userId: owner } })).toBe(0);
    });
    it('hides reported work, authorizes moderators and prevents republishing blocked images', async () => {
      const report = await request(app)
        .post(`/api/gallery/${imageId}/report`)
        .set('Cookie', cookie(other))
        .send({ reason: 'privacy', detail: 'Please review' });
      expect(report.status).toBe(201);
      const visible = await request(app).get('/api/gallery').set('Cookie', cookie(other));
      expect(visible.body.some((item: { id: string }) => item.id === imageId)).toBe(false);
      const hidden = await request(app)
        .get('/api/gallery?hidden=true')
        .set('Cookie', cookie(other));
      expect(hidden.body.some((item: { id: string }) => item.id === imageId)).toBe(true);
      expect(
        (await request(app).get('/api/admin/reports').set('Cookie', cookie(other))).status,
      ).toBe(403);
      const row = await prisma.galleryReport.findUniqueOrThrow({
        where: { reporterId_imageId: { reporterId: other, imageId } },
      });
      expect(
        (
          await request(app)
            .post(`/api/admin/reports/${row.id}/resolve`)
            .set('Cookie', cookie(admin))
            .send({ action: 'hide' })
        ).status,
      ).toBe(204);
      expect(
        (await request(app).get('/api/gallery').set('Cookie', cookie(owner))).body.some(
          (item: { id: string }) => item.id === imageId,
        ),
      ).toBe(false);
      expect(
        (
          await request(app)
            .put('/api/gallery/toggle-public')
            .set('Cookie', cookie(owner))
            .send({ id: imageId, isPublic: true })
        ).status,
      ).toBe(403);
      expect(
        (await request(app).get(`/api/images/${imageId}`).set('Cookie', cookie(other))).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .post(`/api/admin/gallery/${imageId}/restore`)
            .set('Cookie', cookie(admin))
        ).status,
      ).toBe(204);
    });
    it('exports owned drafts, mood and moderation choices without account secrets', async () => {
      const response = await request(app).get('/api/account/export').set('Cookie', cookie(other));
      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe(other);
      expect(response.body.user.password).toBeUndefined();
      expect(response.body.user.sessionVersion).toBeUndefined();
      expect(response.body.user.passwordResets).toBeUndefined();
      expect(response.body.user.drafts).toEqual([]);
      expect(response.body.user.moodCheckIns).toEqual([]);
      expect(response.body.user.hiddenImages).toEqual([{ imageId }]);
      expect(response.body.user.galleryReports).toEqual([
        expect.objectContaining({ imageId, reason: 'privacy' }),
      ]);
      expect(response.body.user.galleryReports[0].reviewedBy).toBeUndefined();
    });
    it('delivers recovery mail through a local SMTP server and persists only a token hash', async () => {
      let mail = '';
      const sockets = new Set<Socket>();
      const server = createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.setEncoding('utf8');
        socket.write('220 localhost test SMTP\r\n');
        let buffer = '',
          dataMode = false;
        socket.on('data', (chunk) => {
          buffer += chunk.toString();
          let end: number;
          while ((end = buffer.indexOf('\r\n')) >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (dataMode) {
              if (line === '.') {
                dataMode = false;
                socket.write('250 Accepted\r\n');
              } else mail += line + '\r\n';
            } else if (line.startsWith('EHLO') || line.startsWith('HELO'))
              socket.write('250-localhost\r\n250 SIZE 1000000\r\n');
            else if (line === 'DATA') {
              dataMode = true;
              socket.write('354 Send message\r\n');
            } else if (line === 'QUIT') {
              socket.end('221 Bye\r\n');
            } else socket.write('250 OK\r\n');
          }
        });
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No test SMTP port');
      vi.stubEnv('SMTP_URL', `smtp://127.0.0.1:${address.port}`);
      vi.stubEnv('MAIL_FROM', 'support@example.test');
      vi.stubEnv('FRONTEND_URL', 'https://clarity.example.test');
      try {
        await issuePasswordReset(`${owner}@example.test`);
        const [headers, ...parts] = mail.split('\r\n\r\n');
        const payload = parts.join('\r\n\r\n');
        const decoded = /Content-Transfer-Encoding: base64/i.test(headers)
          ? Buffer.from(payload.replace(/\s/g, ''), 'base64').toString('utf8')
          : payload.replace(/=\r\n/g, '').replace(/=3D/g, '=');
        const token = decoded.match(
          /https:\/\/clarity\.example\.test\/reset-password#token=([a-f0-9]{64})/,
        )?.[1];
        expect(token).toBeTruthy();
        const stored = await prisma.passwordReset.findUniqueOrThrow({ where: { userId: owner } });
        expect(stored.tokenHash).toBe(resetTokenHash(token!));
        expect(stored.tokenHash).not.toBe(token);
      } finally {
        vi.unstubAllEnvs();
        for (const socket of sockets) socket.destroy();
        server.close();
      }
    });
    it('allows only one concurrent change using the same old password', async () => {
      const id = randomUUID();
      await prisma.user.create({
        data: {
          id,
          email: `${id}@example.test`,
          password: await bcrypt.hash('old-password', 12),
        },
      });
      try {
        const results = await Promise.all(
          ['new-password-one', 'new-password-two'].map((newPassword) =>
            request(app)
              .put('/api/account/password')
              .set('Cookie', cookie(id))
              .send({ currentPassword: 'old-password', newPassword }),
          ),
        );
        expect(results.filter((result) => result.status === 200)).toHaveLength(1);
        expect(results.filter((result) => [400, 401, 409].includes(result.status))).toHaveLength(1);
        expect((await prisma.user.findUniqueOrThrow({ where: { id } })).sessionVersion).toBe(1);
      } finally {
        await prisma.user.delete({ where: { id } });
      }
    });
    it('consumes a reset token once under real concurrency and invalidates old sessions', async () => {
      const token = randomUUID().replaceAll('-', '').repeat(2);
      await prisma.passwordReset.upsert({
        where: { userId: owner },
        create: {
          userId: owner,
          tokenHash: resetTokenHash(token),
          sessionVersion: 0,
          expiresAt: new Date(Date.now() + 60000),
        },
        update: {
          tokenHash: resetTokenHash(token),
          sessionVersion: 0,
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      const results = await Promise.all([
        consumePasswordReset(token, 'new-password-123'),
        consumePasswordReset(token, 'new-password-123'),
      ]);
      expect(results.sort()).toEqual([false, true]);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: owner } });
      expect(user.sessionVersion).toBe(1);
      expect(await bcrypt.compare('new-password-123', user.password)).toBe(true);
      expect((await request(app).get('/api/history').set('Cookie', cookie(owner))).status).toBe(
        401,
      );
      expect(await prisma.passwordReset.count({ where: { userId: owner } })).toBe(0);
    });
  },
);
