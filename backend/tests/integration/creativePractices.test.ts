import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/config/prisma';
import { JWT_SECRET } from '../../src/config/secrets';
import { AI_CONSENT_POLICY } from '../../src/config/ai';

const thumbnail =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlEkYQAAAAASUVORK5CYII=';
const png = { mimeType: 'image/png', base64: thumbnail };

describe.runIf(process.env.RUN_DATABASE_TESTS === 'true')(
  'creative practices against PostgreSQL',
  () => {
    const owner = randomUUID();
    const someoneElse = randomUUID();
    const therapist = randomUUID();
    const otherTherapist = randomUUID();
    const admin = randomUUID();
    const quotaOwner = randomUUID();
    const disposableOwner = randomUUID();
    const disposableTherapist = randomUUID();
    const ids = [
      owner,
      someoneElse,
      therapist,
      otherTherapist,
      admin,
      quotaOwner,
      disposableOwner,
      disposableTherapist,
    ];
    const password = 'test-account-remove';
    const token = (id: string) => jwt.sign({ id, sessionVersion: 0 }, JWT_SECRET);
    const auth = <T extends request.Test>(test: T, id: string, expected = id) =>
      test.set('Cookie', `ty_session=${token(id)}`).set('X-Expected-User-Id', expected);
    const createWork = (userId: string, data: object) =>
      auth(request(app).post('/api/practices/works'), userId).send(data);
    const createShare = (userId: string, data: object) =>
      auth(request(app).post('/api/practices/shares'), userId).send(data);
    const incoming = (id: string) => auth(request(app).get('/api/therapist/practice-shares'), id);
    const readShare = (id: string, shareId: string) =>
      auth(request(app).get(`/api/therapist/practice-shares/${shareId}`), id);
    const imagePath = (shareId: string, workId: string) =>
      `/api/therapist/practice-shares/${shareId}/works/${workId}/image`;

    beforeAll(async () => {
      const hash = await bcrypt.hash(password, 4);
      await prisma.user.createMany({
        data: ids.map((id) => ({
          id,
          email: `${id}@example.test`,
          password: hash,
          role: [therapist, otherTherapist, disposableTherapist].includes(id)
            ? 'THERAPIST'
            : id === admin
              ? 'ADMIN'
              : 'USER',
        })),
      });
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    });

    it('serves public cards and keeps completion idempotent and private', async () => {
      const catalog = await request(app).get('/api/practices/catalog').expect(200);
      expect(catalog.body.practices).toHaveLength(5);
      expect(
        catalog.body.series.every(
          (series: { practiceIds: string[] }) => series.practiceIds.length === 3,
        ),
      ).toBe(true);
      await request(app).get('/api/practices/progress').expect(401);
      await request(app)
        .get('/api/practices/progress')
        .set('Cookie', `ty_session=${token(owner)}`)
        .expect(400);
      await auth(request(app).put('/api/practices/progress/two-lines'), owner, someoneElse).expect(
        409,
      );
      await Promise.all([
        auth(request(app).put('/api/practices/progress/two-lines'), owner).expect(204),
        auth(request(app).put('/api/practices/progress/two-lines'), owner).expect(204),
      ]);
      await auth(request(app).put('/api/practices/progress/unknown'), owner).expect(404);
      expect((await auth(request(app).get('/api/practices/progress'), owner)).body).toEqual([
        'two-lines',
      ]);
      expect((await auth(request(app).get('/api/practices/progress'), someoneElse)).body).toEqual(
        [],
      );
    });

    it('stores drawings and notes without AI and restricts every share to its chosen parts and recipient', async () => {
      const provider = vi
        .spyOn(axios, 'post')
        .mockRejectedValue(new Error('Provider must not be called'));
      try {
        const requestId = randomUUID();
        const body = {
          id: requestId,
          practiceId: 'two-lines',
          title: 'Two lines',
          note: 'Private original',
          image: png,
        };
        await createWork(owner, {
          ...body,
          image: { mimeType: 'image/png', base64: 'SGVsbG8=' },
        }).expect(400);
        const work = await createWork(owner, body).expect(201);
        const workId = work.body.id as string;
        expect(work.body.hasImage).toBe(true);
        expect(workId).not.toBe(requestId);
        expect(work.body.image).toBeUndefined();
        expect((await createWork(owner, body).expect(201)).body.id).toBe(workId);
        const textWork = await createWork(owner, {
          id: randomUUID(),
          title: 'Notes only',
          note: 'A note without a drawing',
        }).expect(201);
        expect(textWork.body.hasImage).toBe(false);
        await auth(request(app).get(`/api/practices/works/${workId}/image`), someoneElse).expect(
          404,
        );
        const ownImage = await auth(request(app).get(`/api/practices/works/${workId}/image`), owner)
          .expect('Cache-Control', 'no-store')
          .expect('Content-Type', /image\/png/)
          .expect(200);
        expect(ownImage.body).toEqual(Buffer.from(thumbnail, 'base64'));

        const reflectionId = randomUUID();
        const addReflection = (id: string, content: string) =>
          auth(request(app).post(`/api/practices/works/${workId}/reflections`), owner).send({
            id,
            content,
          });
        await addReflection(reflectionId, 'Selected later caption').expect(201);
        await addReflection(reflectionId, 'Selected later caption').expect(201);
        const foreign = await createWork(someoneElse, {
          id: randomUUID(),
          title: 'Foreign',
          note: 'Foreign content',
        }).expect(201);
        await createShare(owner, {
          id: randomUUID(),
          therapistId: admin,
          items: [{ workId, includeImage: true, includeNote: false, reflectionIds: [] }],
        }).expect(400);
        await createShare(owner, {
          id: randomUUID(),
          therapistId: therapist,
          items: [
            { workId: foreign.body.id, includeImage: false, includeNote: true, reflectionIds: [] },
          ],
        }).expect(404);
        await createShare(owner, {
          id: randomUUID(),
          therapistId: therapist,
          items: [
            {
              workId: textWork.body.id,
              includeImage: false,
              includeNote: true,
              reflectionIds: [reflectionId],
            },
          ],
        }).expect(400);

        const shareRequestId = randomUUID();
        const payload = {
          id: shareRequestId,
          therapistId: therapist,
          items: [
            { workId, includeImage: false, includeNote: false, reflectionIds: [reflectionId] },
            { workId: textWork.body.id, includeImage: false, includeNote: true, reflectionIds: [] },
          ],
        };
        const duplicate = await Promise.all([
          createShare(owner, payload),
          createShare(owner, payload),
        ]);
        expect(duplicate.map((item) => item.status).sort()).toEqual([200, 201]);
        const shareId = duplicate[0].body.id as string;
        expect(duplicate[1].body.id).toBe(shareId);
        await addReflection(randomUUID(), 'Added after sharing').expect(201);
        expect((await incoming(otherTherapist).expect(200)).body.items).toEqual([]);
        await incoming(admin).expect(403);
        const summaries = await incoming(therapist).expect(200);
        expect(summaries.body.items[0]).toMatchObject({ id: shareId, workCount: 2 });
        expect(summaries.body.items[0].items).toBeUndefined();
        await readShare(otherTherapist, shareId).expect(404);
        await readShare(admin, shareId).expect(403);
        const received = await readShare(therapist, shareId)
          .expect('Cache-Control', 'no-store')
          .expect(200);
        expect(received.body.items).toMatchObject([
          {
            workId,
            title: 'Two lines',
            note: null,
            includesImage: false,
            reflections: [{ content: 'Selected later caption' }],
          },
          { workId: textWork.body.id, note: 'A note without a drawing' },
        ]);
        expect(JSON.stringify(received.body)).not.toMatch(
          /Private original|Added after sharing|Foreign content/,
        );
        await auth(request(app).get(imagePath(shareId, workId)), therapist).expect(404);

        const withImage = await createShare(owner, {
          id: randomUUID(),
          therapistId: therapist,
          items: [{ workId, includeImage: true, includeNote: false, reflectionIds: [] }],
        }).expect(201);
        const withImageId = withImage.body.id as string;
        await auth(request(app).get(imagePath(withImageId, workId)), otherTherapist).expect(404);
        await auth(request(app).get(imagePath(withImageId, workId)), therapist).expect(200);
        await prisma.user.update({ where: { id: therapist }, data: { role: 'USER' } });
        await incoming(therapist).expect(403);
        await auth(request(app).get(imagePath(withImageId, workId)), therapist).expect(403);
        await prisma.user.update({ where: { id: therapist }, data: { role: 'THERAPIST' } });

        const exported = await auth(request(app).get('/api/account/export'), owner).expect(200);
        const exportedWork = exported.body.user.practiceWorks.find(
          (entry: { id: string }) => entry.id === workId,
        );
        expect(exportedWork.image).toEqual(png);
        expect(exportedWork.reflections).toHaveLength(2);
        expect(exported.body.user.practiceShares).toHaveLength(2);
        const recipientExport = await auth(
          request(app).get('/api/account/export'),
          therapist,
        ).expect(200);
        expect(JSON.stringify(recipientExport.body)).not.toContain('Selected later caption');

        await auth(request(app).delete(`/api/practices/shares/${shareId}`), someoneElse).expect(
          204,
        );
        expect((await incoming(therapist)).body.items).toHaveLength(2);
        await auth(request(app).delete(`/api/practices/shares/${shareId}`), owner).expect(204);
        await readShare(therapist, shareId).expect(404);
        await createShare(owner, payload).expect(410);
        expect(await prisma.practiceShareItem.count({ where: { shareId } })).toBe(0);
        await auth(request(app).delete(`/api/practices/works/${workId}`), owner).expect(204);
        await readShare(therapist, withImageId).expect(404);
        await auth(request(app).get(imagePath(withImageId, workId)), therapist).expect(404);
        expect((await incoming(therapist)).body.items).toEqual([]);
        expect(await prisma.practiceReflection.count({ where: { workId } })).toBe(0);
        await createWork(owner, body).expect(410);
        await createWork(someoneElse, body).expect(201);
        await auth(request(app).get('/api/account/export'), owner, someoneElse).expect(409);
        expect(await prisma.diaryEntry.count({ where: { userId: owner } })).toBe(0);
        expect(provider).not.toHaveBeenCalled();
      } finally {
        provider.mockRestore();
      }
    });

    it('serializes concurrent saves at the album quota', async () => {
      await prisma.practiceWork.createMany({
        data: Array.from({ length: 29 }, () => ({
          id: randomUUID(),
          requestId: randomUUID(),
          userId: quotaOwner,
          title: 'Fixture',
          note: 'Fixture',
        })),
      });
      const results = await Promise.all(
        [1, 2].map((number) =>
          createWork(quotaOwner, {
            id: randomUUID(),
            title: `Work ${number}`,
            note: 'Fixture',
          }),
        ),
      );
      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      expect(await prisma.practiceWork.count({ where: { userId: quotaOwner } })).toBe(30);
    });

    it('removes access when the recipient or owner account is deleted', async () => {
      const work = await createWork(disposableOwner, {
        id: randomUUID(),
        title: 'Disposable',
        image: png,
      }).expect(201);
      const workId = work.body.id as string;
      const data = {
        id: randomUUID(),
        therapistId: disposableTherapist,
        items: [{ workId, includeImage: true, includeNote: false, reflectionIds: [] }],
      };
      const share = await createShare(disposableOwner, data).expect(201);
      await auth(request(app).delete('/api/account'), disposableTherapist)
        .send({ password })
        .expect(204);
      expect(await prisma.practiceShare.findUnique({ where: { id: share.body.id } })).toBeNull();
      await createShare(disposableOwner, {
        ...data,
        id: randomUUID(),
        therapistId: therapist,
      }).expect(201);
      await auth(request(app).delete('/api/account'), disposableOwner)
        .send({ password })
        .expect(204);
      expect(await prisma.practiceWork.findUnique({ where: { id: workId } })).toBeNull();
      expect(await prisma.practiceShareItem.count({ where: { workId } })).toBe(0);
    });
    it('persists versioned drafts and finalizes one album entry', async () => {
      const path = '/api/practices/drafts/three-shapes';
      const snapshot = {
        title: 'Shapes',
        note: 'Private draft',
        mode: 'canvas',
        attachmentKind: 'canvas',
        image: png,
      };
      const put = (
        version: number,
        replacement: typeof snapshot | null,
        mutationId = randomUUID(),
      ) => auth(request(app).put(path), owner).send({ version, mutationId, snapshot: replacement });
      const mutationId = randomUUID();
      await request(app).put(path).send({ version: 0, mutationId, snapshot }).expect(401);
      await auth(request(app).put(path), owner, someoneElse)
        .send({ version: 0, mutationId, snapshot })
        .expect(409);
      expect((await put(0, snapshot, mutationId).expect(200)).body.version).toBe(1);
      expect((await put(0, snapshot, mutationId).expect(409)).body.code).toBe('DRAFT_CONFLICT');
      expect(
        (await auth(request(app).get(path), owner).expect('Cache-Control', 'no-store').expect(200))
          .body,
      ).toMatchObject({ version: 1, mutationId, snapshot });
      expect((await auth(request(app).get(path), someoneElse).expect(200)).body.version).toBe(0);
      expect(
        (await auth(request(app).get('/api/practices/drafts'), owner).expect(200)).body,
      ).toEqual([{ practiceId: 'three-shapes', updatedAt: expect.any(String) }]);
      const exported = await auth(request(app).get('/api/account/export'), owner).expect(200);
      expect(exported.body.user.practiceDrafts[0]).toMatchObject({
        practiceId: 'three-shapes',
        image: png,
      });
      const id = randomUUID();
      const finish = (target = path) =>
        auth(request(app).post(`${target}/finalize`), owner).send({ version: 1, id });
      const [first, second] = await Promise.all([finish().expect(201), finish().expect(201)]);
      expect(first.body.id).toBe(second.body.id);
      await finish('/api/practices/drafts/two-lines').expect(409);
      await put(1, snapshot).expect(409);
      expect((await put(2, snapshot).expect(200)).body.version).toBe(3);
      await finish().expect(201);
      expect((await auth(request(app).get(path), owner).expect(200)).body.snapshot.note).toBe(
        'Private draft',
      );
      await auth(request(app).delete(`/api/practices/works/${first.body.id}`), owner).expect(204);
      await finish().expect(410);
      await finish('/api/practices/drafts/two-lines').expect(410);
      await put(3, null).expect(200);
      await put(3, snapshot).expect(409);
      expect(
        (await auth(request(app).get('/api/practices/drafts'), owner).expect(200)).body,
      ).toEqual([]);
    });

    it('scopes notifications, acknowledgements and optional recommendations to active shares', async () => {
      const work = await createWork(owner, {
        id: randomUUID(),
        title: 'Feedback',
        note: 'Hidden note',
      }).expect(201);
      const payload = {
        id: randomUUID(),
        therapistId: therapist,
        allowRecommendation: true,
        items: [
          { workId: work.body.id, includeNote: true, includeImage: false, reflectionIds: [] },
        ],
      };
      const {
        body: { id },
      } = await createShare(owner, payload).expect(201);
      await createShare(owner, payload).expect(200);
      const therapistPath = `/api/therapist/practice-shares/${id}`;
      const ownerPath = `/api/practices/shares/${id}`;
      const notifications = (user: string) => auth(request(app).get('/api/notifications'), user);
      const ack = (user: string) =>
        auth(request(app).put(`${therapistPath}/acknowledgement`), user);
      const rec = (user: string, practiceId: string) =>
        auth(request(app).put(`${therapistPath}/recommendation`), user).send({ practiceId });
      const notice = (await notifications(therapist).expect(200)).body.find(
        (item: { practiceShareId: string }) => item.practiceShareId === id,
      );
      expect(notice?.type).toBe('practice_share');
      expect(JSON.stringify(notice)).not.toContain('Hidden note');
      expect(await prisma.notification.count({ where: { practiceShareId: id } })).toBe(1);
      await ack(otherTherapist).expect(404);
      await ack(admin).expect(403);
      const first = await ack(therapist).expect(200);
      expect((await ack(therapist).expect(200)).body).toEqual(first.body);
      await rec(therapist, 'unknown').expect(400);
      await rec(otherTherapist, 'two-lines').expect(404);
      await rec(therapist, 'two-lines').expect(200);
      await rec(therapist, 'two-lines').expect(200);
      await rec(therapist, 'postcard').expect(409);
      expect((await notifications(owner).expect(200)).body).toContainEqual(
        expect.objectContaining({ type: 'practice_recommendation' }),
      );
      await auth(request(app).put(`${ownerPath}/recommendation/dismissal`), someoneElse).expect(
        404,
      );
      await auth(request(app).put(`${ownerPath}/recommendation/dismissal`), owner).expect(204);
      await rec(therapist, 'two-lines').expect(200);
      expect(await prisma.notification.count({ where: { practiceShareId: id } })).toBe(1);
      await prisma.user.update({ where: { id: therapist }, data: { role: 'USER' } });
      await notifications(therapist).query({ cursor: notice.id }).expect(409);
      expect((await notifications(therapist).expect(200)).body).not.toContainEqual(
        expect.objectContaining({ id: notice.id }),
      );
      await auth(request(app).put(`/api/notifications/${notice.id}/read`), therapist).expect(404);
      const exported = await auth(request(app).get('/api/account/export'), therapist).expect(200);
      expect(exported.body.user.notifications).not.toContainEqual(
        expect.objectContaining({ id: notice.id }),
      );
      await prisma.user.update({ where: { id: therapist }, data: { role: 'THERAPIST' } });
      await auth(request(app).put(`${ownerPath}/recommendation-permission`), owner)
        .send({ allowed: false })
        .expect(204);
      await rec(therapist, 'two-lines').expect(404);
      await auth(request(app).delete(`/api/practices/works/${work.body.id}`), owner).expect(204);
      await ack(therapist).expect(404);
      expect(await prisma.notification.count({ where: { practiceShareId: id } })).toBe(0);
    });

    it('suppresses feedback events while rollout is disabled', async () => {
      const work = await createWork(owner, {
        id: randomUUID(),
        title: 'Silent rollout',
        note: 'Synthetic',
      }).expect(201);
      vi.stubEnv('PRACTICE_FEEDBACK_NOTIFICATIONS', 'false');
      try {
        const result = await createShare(owner, {
          id: randomUUID(),
          therapistId: therapist,
          allowRecommendation: true,
          items: [
            { workId: work.body.id, includeNote: true, includeImage: false, reflectionIds: [] },
          ],
        }).expect(201);
        await auth(
          request(app).put(`/api/therapist/practice-shares/${result.body.id}/recommendation`),
          therapist,
        )
          .send({ practiceId: 'two-lines' })
          .expect(200);
        expect(
          await prisma.notification.count({ where: { practiceShareId: result.body.id } }),
        ).toBe(0);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('rejects legacy or stale external AI consent before dispatch and supports explicit re-consent', async () => {
      if (!AI_CONSENT_POLICY) throw new Error('Test provider policy is required');
      await prisma.profile.create({ data: { userId: someoneElse, aiDataConsentAt: new Date() } });
      const consent = (body: object, expected = someoneElse) =>
        auth(request(app).put('/api/profile/ai-consent'), someoneElse, expected).send(body);
      const status = () => auth(request(app).get('/api/ai/status'), someoneElse);
      const provider = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { choices: [{ message: { content: 'Synthetic response' } }] },
      });
      const stream = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('unexpected stream'));
      try {
        expect((await status().expect(200)).body).toMatchObject({
          consentGiven: false,
          policy: AI_CONSENT_POLICY,
        });
        await auth(request(app).get('/api/ai/status'), someoneElse, owner).expect(409);
        await prisma.profile.update({
          where: { userId: someoneElse },
          data: { aiDataConsentPolicyId: 'previous-policy' },
        });
        for (const path of [
          '/api/chat',
          '/api/chat/stream',
          '/api/analyze-image',
          '/api/profile/analysis',
        ]) {
          await auth(request(app).post(path), someoneElse)
            .send({ message: 'Synthetic note' })
            .expect(412);
        }
        const diary = await auth(request(app).post('/api/diary'), someoneElse)
          .send({ content: 'Synthetic diary' })
          .expect(201);
        await auth(request(app).put(`/api/diary/${diary.body.id}`), someoneElse)
          .send({ content: 'Edited synthetic diary', version: diary.body.version })
          .expect(200);
        expect(provider).not.toHaveBeenCalled();
        expect(stream).not.toHaveBeenCalled();
        await consent({ consent: true, policyId: 'old-provider' }).expect(409);
        await consent({ consent: true, policyId: AI_CONSENT_POLICY.id }, owner).expect(409);
        await consent({ consent: false }, owner).expect(409);
        await consent({ consent: true, policyId: AI_CONSENT_POLICY.id }).expect(200);
        expect((await status().expect(200)).body.consentGiven).toBe(true);
        await auth(request(app).post('/api/chat'), someoneElse)
          .send({ message: 'Synthetic note' })
          .expect(200);
        expect(provider).toHaveBeenCalled();
        provider.mockClear();
        await consent({ consent: false }).expect(200);
        expect((await status().expect(200)).body.consentGiven).toBe(false);
        await auth(request(app).post('/api/chat'), someoneElse)
          .send({ message: 'After revoke' })
          .expect(412);
        expect(provider).not.toHaveBeenCalled();
      } finally {
        provider.mockRestore();
        stream.mockRestore();
      }
    });
  },
);
