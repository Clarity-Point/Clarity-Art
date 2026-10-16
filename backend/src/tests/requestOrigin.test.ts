import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestOrigin } from '../middleware/requestOrigin';

const app = express();
const mutation = vi.fn((_req, res) => res.json({ ok: true }));
app.use(requestOrigin);
app.post('/mutation', mutation);
app.get('/read', (_req, res) => res.json({ ok: true }));

describe('browser mutation origin protection', () => {
  it.each(['https://attacker.test', 'null', 'http://localhost:5173.attacker.test'])(
    'rejects %s before the handler runs',
    async (origin) => {
      mutation.mockClear();
      const response = await request(app).post('/mutation').set('Origin', origin);
      expect(response.status).toBe(403);
      expect(mutation).not.toHaveBeenCalled();
    },
  );
  it('accepts the configured frontend and non-browser clients', async () => {
    expect(
      (
        await request(app)
          .post('/mutation')
          .set('Origin', process.env.FRONTEND_URL || 'http://localhost:5173')
      ).status,
    ).toBe(200);
    expect((await request(app).post('/mutation')).status).toBe(200);
  });
  it('rejects cross-site mutations without Origin while allowing safe reads', async () => {
    expect((await request(app).post('/mutation').set('Sec-Fetch-Site', 'cross-site')).status).toBe(
      403,
    );
    expect((await request(app).get('/read').set('Origin', 'https://attacker.test')).status).toBe(
      200,
    );
  });
});
