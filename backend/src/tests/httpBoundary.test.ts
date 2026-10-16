import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
vi.mock('../config/prisma', () => ({ default: {} }));
import app from '../index';

describe('HTTP request boundary', () => {
  it('rejects malformed JSON as 400 without echoing submitted credentials', async () => {
    const response = await request(app)
      .post('/api/login')
      .set('Content-Type', 'application/json')
      .send('{"password":"private-password",');
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain('private-password');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('bounds caller-supplied request ids and returns a usable correlation id', async () => {
    const valid = await request(app).get('/health').set('X-Request-Id', 'audit-request-1');
    expect(valid.headers['x-request-id']).toBe('audit-request-1');
    const oversized = await request(app).get('/health').set('X-Request-Id', 'a'.repeat(200));
    expect(oversized.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
  });
});
