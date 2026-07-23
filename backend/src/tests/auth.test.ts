import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
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
});
