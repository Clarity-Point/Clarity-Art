import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../config/prisma', () => ({ default: prismaMock }));

import app from '../index';

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 200 for health check', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Точка Ясности API');
  });

  it('authenticates through an HttpOnly cookie without returning a bearer token', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      password: await bcrypt.hash('correct horse battery staple', 10),
      role: 'USER',
      points: 0,
      streak: 0,
      sessionVersion: 0,
      profile: { name: 'User' },
    });

    const res = await request(app)
      .post('/api/login')
      .send({ email: 'user@example.com', password: 'correct horse battery staple' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('ty_session=')]),
    );
    expect(String(res.headers['set-cookie'])).toContain('HttpOnly');
  });

  it('rejects a session after its server-side version is revoked', async () => {
    const token = jwt.sign(
      {
        id: 'user-1',
        email: 'user@example.com',
        role: 'USER',
        sessionVersion: 1,
      },
      process.env.JWT_SECRET!,
    );
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      sessionVersion: 2,
    });

    const res = await request(app).get('/api/ai/status').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalidated session');
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });
  it('returns 503 rather than invalidating the session when the database is unavailable', async () => {
    const token = jwt.sign({ id: 'user-1', sessionVersion: 0 }, process.env.JWT_SECRET!);
    prismaMock.user.findUnique.mockRejectedValueOnce(new Error('Database unavailable'));
    const response = await request(app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(503);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('uses the current database role rather than the token’s stale admin role', async () => {
    const token = jwt.sign(
      { id: 'user-1', role: 'ADMIN', sessionVersion: 0 },
      process.env.JWT_SECRET!,
    );
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      role: 'USER',
      sessionVersion: 0,
    });
    const response = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(prismaMock.user.findUnique).toHaveBeenCalledOnce();
  });

  it.each([
    jwt.sign({ sessionVersion: 0 }, process.env.JWT_SECRET!),
    jwt.sign({ id: 'user-1', sessionVersion: 0 }, process.env.JWT_SECRET!, { algorithm: 'HS512' }),
  ])('rejects unsupported tokens before querying the database', async (token) => {
    const response = await request(app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
