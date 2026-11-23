const assert = require('node:assert/strict');
const { writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { Client } = require('pg');

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlEkYQAAAAASUVORK5CYII=';
const studyPassword = 'restore-fixture-only';
const ownerEmail = 'restore-owner@example.test';
const therapistEmail = 'restore-specialist@example.test';
const workKey = 'dbff582a-92e7-4394-89cb-f30f971463ac';
const shareKey = 'c8ad8f11-677a-4ff2-8c04-3980a9fc42e6';
const imageId = '31cf8427-c4b2-4fbd-9886-a0a78a82d242';
const imageKey = `${imageId}.png`;

async function call(path, { status = 200, account, method = 'GET', data } = {}) {
  const response = await fetch(`http://127.0.0.1:3100${path}`, {
    method,
    headers: {
      ...(account ? { Cookie: account.cookie, 'X-Expected-User-Id': account.id } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  assert.equal(response.status, status, `Unexpected response for ${method} ${path}`);
  return response;
}
async function account(email, create = false) {
  if (create)
    await call('/api/register', {
      status: 201,
      method: 'POST',
      data: { email, password: studyPassword },
    });
  const login = await call('/api/login', {
    method: 'POST',
    data: { email, password: studyPassword },
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const profile = await (await call('/api/profile', { account: { cookie, id: '' } })).json();
  return { cookie, id: profile.id };
}

async function main() {
  const database = new Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();
  try {
    await call('/health/ready');
    const seed = process.argv[2] === 'seed';
    const owner = await account(ownerEmail, seed);
    const therapist = await account(therapistEmail, seed);
    if (seed) {
      await database.query('UPDATE "User" SET role = $1 WHERE id = $2', [
        'THERAPIST',
        therapist.id,
      ]);
      await database.query(
        'INSERT INTO "DiaryEntry" (id, "userId", content, tags, "updatedAt") VALUES ($1, $2, $3, ARRAY[]::TEXT[], now())',
        ['restore-test-entry', owner.id, 'Synthetic diary entry'],
      );
      await database.query(
        'INSERT INTO "ImageAnalysis" (id, "userId", prompt, result, "imageStorageKey", "imageMimeType", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())',
        [imageId, owner.id, 'Synthetic image', '', imageKey, 'image/png'],
      );
      await writeFile(join(process.env.IMAGE_STORAGE_DIR, imageKey), Buffer.from(png, 'base64'));
      const work = await (
        await call('/api/practices/works', {
          status: 201,
          account: owner,
          method: 'POST',
          data: {
            id: workKey,
            title: 'Synthetic canvas',
            image: { mimeType: 'image/png', base64: png },
          },
        })
      ).json();
      const share = await (
        await call('/api/practices/shares', {
          status: 201,
          account: owner,
          method: 'POST',
          data: {
            id: shareKey,
            therapistId: therapist.id,
            items: [{ workId: work.id, includeImage: true, includeNote: false, reflectionIds: [] }],
          },
        })
      ).json();
      await call(`/api/practices/shares/${share.id}`, {
        account: owner,
        method: 'DELETE',
        status: 204,
      });
    } else {
      const entry = await (await call('/api/diary/restore-test-entry', { account: owner })).json();
      assert.equal(entry.content, 'Synthetic diary entry');
      const works = await (await call('/api/practices/works', { account: owner })).json();
      const work = works.find(({ title }) => title === 'Synthetic canvas');
      assert.ok(work);
      for (const path of [`/api/images/${imageId}`, `/api/practices/works/${work.id}/image`]) {
        const response = await call(path, { account: owner });
        assert.equal(Buffer.from(await response.arrayBuffer()).toString('base64'), png);
        const denied = await fetch(`http://127.0.0.1:3100${path}`, {
          headers: { Cookie: therapist.cookie, 'X-Expected-User-Id': therapist.id },
        });
        assert.ok([403, 404].includes(denied.status));
      }
      const { rows } = await database.query(
        'SELECT id FROM "PracticeShare" WHERE "requestId" = $1',
        [shareKey],
      );
      assert.equal(rows.length, 1);
      await call(`/api/therapist/practice-shares/${rows[0].id}`, {
        account: therapist,
        status: 404,
      });
      console.log(
        'Restored login, diary, both image stores and revoked access verified through the real API.',
      );
    }
  } finally {
    await database.end();
  }
}
main().catch((reason) => {
  console.error(reason);
  process.exitCode = 1;
});
