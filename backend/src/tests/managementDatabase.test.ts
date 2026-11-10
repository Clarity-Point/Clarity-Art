import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import app from '../index';
import { JWT_SECRET } from '../config/secrets';

describe.runIf(process.env.RUN_DATABASE_TESTS === 'true')(
  'content and organization management',
  () => {
    const admin = randomUUID(),
      manager = randomUUID(),
      therapist = randomUUID();
    const members = [randomUUID(), randomUUID(), randomUUID()];
    const outsider = randomUUID(),
      org = randomUUID(),
      course = randomUUID(),
      homework = randomUUID();
    const imageId = randomUUID();
    const users = [admin, manager, therapist, outsider, ...members];
    const cookie = (id: string) => `ty_session=${jwt.sign({ id, sessionVersion: 0 }, JWT_SECRET)}`;
    const password = 'transfer-password-123';
    beforeAll(async () => {
      await prisma.organization.create({
        data: { id: org, name: 'Management test', inviteCode: org },
      });
      await prisma.user.createMany({
        data: [
          { id: admin, email: `${admin}@example.test`, password: 'unused', role: 'ADMIN' },
          {
            id: manager,
            email: `${manager}@example.test`,
            password: await bcrypt.hash(password, 12),
            role: 'ORG_ADMIN',
            organizationId: org,
          },
          {
            id: therapist,
            email: `${therapist}@example.test`,
            password: 'unused',
            role: 'THERAPIST',
          },
          { id: outsider, email: `${outsider}@example.test`, password: 'unused' },
        ],
      });
      for (const [index, id] of members.entries()) {
        await prisma.user.create({
          data: {
            id,
            email: `${id}@example.test`,
            password: 'unused',
            organizationId: org,
            therapistId: therapist,
            profile: {
              create: {
                name: `Member ${index}`,
                isSharedWithTherapist: true,
                attentionScore: index === 0 ? 60 : 0,
              },
            },
          },
        });
      }
      await prisma.course.create({
        data: {
          id: course,
          slug: course,
          title: 'Archive test',
          category: 'general',
          description: 'Fixture',
          goals: [],
          targetAudience: [],
          homework: { create: { id: homework, title: `Task ${course}`, description: 'Fixture' } },
        },
      });
      await prisma.submission.createMany({
        data: members.map((id, i) => ({
          userId: id,
          homeworkId: homework,
          submittedContent: 'Keep this work',
          grade: i === 0 ? 'Accepted' : null,
        })),
      });
      await prisma.courseProgress.create({
        data: { userId: members[0], courseId: course, progress: 25 },
      });
      await prisma.imageAnalysis.create({
        data: {
          id: imageId,
          userId: members[0],
          prompt: 'Fixture',
          result: 'Fixture',
          isPublic: true,
        },
      });
      await prisma.galleryReport.createMany({
        data: members.slice(1).map((reporterId) => ({ imageId, reporterId, reason: 'privacy' })),
      });
    });
    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.course.deleteMany({ where: { id: course } });
      await prisma.organization.deleteMany({ where: { id: org } });
      await prisma.$disconnect();
    });

    it('archives and restores discovery without deleting existing work or direct access', async () => {
      const archive = (id: string, archived: boolean) =>
        request(app)
          .put(`/api/admin/courses/${course}/archive`)
          .set('Cookie', cookie(id))
          .send({ archived });
      expect((await archive(members[0], true)).status).toBe(403);
      expect((await archive(admin, true)).status).toBe(204);
      const catalog = await request(app)
        .get('/api/courses?includeArchived=true')
        .set('Cookie', cookie(members[0]));
      expect(catalog.body.some((row: { id: string }) => row.id === course)).toBe(false);
      const adminCatalog = await request(app)
        .get('/api/admin/courses')
        .set('Cookie', cookie(admin));
      expect(adminCatalog.body.some((row: { id: string }) => row.id === course)).toBe(true);
      expect(
        (await request(app).get(`/api/courses/${course}`).set('Cookie', cookie(members[0]))).body
          .archivedAt,
      ).toBeTruthy();
      expect(await prisma.submission.count({ where: { homeworkId: homework } })).toBe(3);
      expect(
        (
          await prisma.courseProgress.findUniqueOrThrow({
            where: { userId_courseId: { userId: members[0], courseId: course } },
          })
        ).progress,
      ).toBe(25);
      expect((await archive(admin, false)).status).toBe(204);
      expect(
        (await request(app).get('/api/courses').set('Cookie', cookie(members[0]))).body.some(
          (row: { id: string }) => row.id === course,
        ),
      ).toBe(true);
    });

    it('pages and filters submissions while retaining global counts', async () => {
      const first = await request(app)
        .get('/api/admin/submissions')
        .query({ limit: 1, q: course, status: 'pending' })
        .set('Cookie', cookie(admin));
      expect(first.status).toBe(200);
      expect(first.body).toHaveLength(1);
      expect(Number(first.headers['x-total-count'])).toBeGreaterThanOrEqual(3);
      expect(Number(first.headers['x-pending-count'])).toBeGreaterThanOrEqual(2);
      const next = await request(app)
        .get('/api/admin/submissions')
        .query({ limit: 1, q: course, status: 'pending', cursor: first.headers['x-next-cursor'] })
        .set('Cookie', cookie(admin));
      expect(next.body).toHaveLength(1);
      expect(next.body[0].id).not.toBe(first.body[0].id);
      expect(next.headers['x-next-cursor']).toBeUndefined();
      const graded = await request(app)
        .get('/api/admin/submissions')
        .query({ q: course, status: 'graded' })
        .set('Cookie', cookie(admin));
      expect(graded.body).toHaveLength(1);
      expect(graded.body[0].grade).toBe('Accepted');
      expect(
        (await request(app).get('/api/admin/submissions?limit=100000').set('Cookie', cookie(admin)))
          .status,
      ).toBe(400);
    });

    it('pages only consenting assigned patients and rechecks revoked consent', async () => {
      const first = await request(app)
        .get('/api/therapist/patients?limit=2')
        .set('Cookie', cookie(therapist));
      expect(first.body).toHaveLength(2);
      expect(first.headers['x-total-count']).toBe('3');
      expect(first.headers['x-attention-count']).toBe('1');
      const second = await request(app)
        .get('/api/therapist/patients')
        .query({ limit: 2, cursor: first.headers['x-next-cursor'] })
        .set('Cookie', cookie(therapist));
      expect(second.body).toHaveLength(1);
      expect(new Set([...first.body, ...second.body].map((row) => row.id)).size).toBe(3);
      expect(JSON.stringify(first.body)).not.toContain('password');
      const q = `${members[0]}@example.test`;
      expect(
        (
          await request(app)
            .get('/api/therapist/patients')
            .query({ q })
            .set('Cookie', cookie(therapist))
        ).body,
      ).toHaveLength(1);
      await prisma.profile.update({
        where: { userId: members[0] },
        data: { isSharedWithTherapist: false },
      });
      expect(
        (
          await request(app)
            .get('/api/therapist/patients')
            .query({ q })
            .set('Cookie', cookie(therapist))
        ).body,
      ).toHaveLength(0);
      expect(
        (await request(app).get('/api/therapist/patients').set('Cookie', cookie(outsider))).status,
      ).toBe(403);
    });

    it('serializes competing report decisions and rejects stale restore versions', async () => {
      const reports = await prisma.galleryReport.findMany({ where: { imageId } });
      const resolve = (id: string, action: string, version: number) =>
        request(app)
          .post(`/api/admin/reports/${id}/resolve`)
          .set('Cookie', cookie(admin))
          .send({ action, version });
      const decisions = await Promise.all(reports.map((row) => resolve(row.id, 'dismiss', 1)));
      expect(decisions.map((row) => row.status).sort()).toEqual([204, 409]);
      const pending = await prisma.galleryReport.findFirstOrThrow({
        where: { imageId, status: 'PENDING' },
      });
      expect((await resolve(pending.id, 'hide', 1)).status).toBe(409);
      expect((await resolve(pending.id, 'hide', 2)).status).toBe(204);
      const restore = (version: number) =>
        request(app)
          .post(`/api/admin/gallery/${imageId}/restore`)
          .set('Cookie', cookie(admin))
          .send({ version });
      expect((await restore(2)).status).toBe(409);
      expect((await restore(3)).status).toBe(204);
      await prisma.galleryReport.create({
        data: { imageId, reporterId: outsider, reason: 'spam' },
      });
      const fresh = await prisma.galleryReport.findUniqueOrThrow({
        where: { reporterId_imageId: { reporterId: outsider, imageId } },
      });
      expect((await resolve(fresh.id, 'hide', 4)).status).toBe(204);
      expect((await restore(3)).status).toBe(409);
      expect(
        (await prisma.imageAnalysis.findUniqueOrThrow({ where: { id: imageId } })).moderationStatus,
      ).toBe('BLOCKED');
    });

    it('requires the password and same organization, and transfers authority only once', async () => {
      const transfer = (target: string, pass = password) =>
        request(app)
          .post('/api/org/transfer-admin')
          .set('Cookie', cookie(manager))
          .send({ email: `${target}@example.test`, password: pass });
      expect((await transfer(members[0], 'wrong-password')).status).toBe(400);
      expect((await transfer(outsider)).status).toBe(400);
      const responses = await Promise.all([transfer(members[0]), transfer(members[1])]);
      expect(responses.filter((row) => row.status === 204)).toHaveLength(1);
      expect(responses.filter((row) => [403, 409].includes(row.status))).toHaveLength(1);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: manager } })).role).toBe('USER');
      const admins = await prisma.user.findMany({
        where: { organizationId: org, role: 'ORG_ADMIN' },
      });
      expect(admins).toHaveLength(1);
      expect(await prisma.notification.count({ where: { userId: admins[0].id } })).toBe(1);
      expect((await request(app).get('/api/org/stats').set('Cookie', cookie(manager))).status).toBe(
        403,
      );
      expect(
        (await request(app).delete('/api/org/leave').set('Cookie', cookie(manager))).status,
      ).toBe(204);
    });
  },
);
