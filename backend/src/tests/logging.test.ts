import { afterEach, describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import express from 'express';
import request from 'supertest';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { logger, loggerOptions, requestContext } from '../config/logger';
import { requestLogger } from '../middleware/requestLogger';
import { globalErrorHandler } from '../middleware/errorHandler';
import { auditLogger, recordAudit } from '../services/auditService';

afterEach(() => vi.restoreAllMocks());

describe('private structured logging', () => {
  it('removes ORM/provider error payloads and request secrets from real JSON output', () => {
    let output = '';
    const log = pino(
      { ...loggerOptions, level: 'info' },
      {
        write: (line) => {
          output += line;
        },
      },
    );
    const err = Object.assign(new Error('private-diary-text'), {
      code: 'P2002',
      config: { password: 'private-password' },
      response: { data: 'private-provider-response' },
    });
    requestContext.run({ requestId: 'request-1' }, () =>
      log.error(
        {
          err,
          reason: err,
          token: 'private-token',
          apiKey: 'private-key',
          req: {
            body: 'private-body',
            query: { q: 'private-search' },
            url: '/?q=private-query',
            originalUrl: '/?token=private-reset',
            headers: { cookie: 'private-cookie', authorization: 'private-auth' },
          },
          res: { headers: { 'set-cookie': 'private-session' } },
        },
        'Operation failed',
      ),
    );
    expect(output).not.toContain('private-');
    expect(JSON.parse(output)).toMatchObject({
      requestId: 'request-1',
      err: { type: 'Error', code: 'P2002' },
    });
  });

  it('isolates correlation across concurrent requests and attaches it to audit events', async () => {
    const events = vi.spyOn(auditLogger, 'info').mockImplementation(() => {});
    const app = express().use(requestLogger);
    app.get('/work/:id', async (req, res) => {
      await new Promise((resolve) => setTimeout(resolve, req.params.id === 'one' ? 10 : 1));
      recordAudit({ action: 'auth.login', outcome: 'success' });
      res.json({ id: requestContext.getStore()?.requestId });
    });
    const responses = await Promise.all(
      ['one', 'two'].map((id) => request(app).get(`/work/${id}`).set('X-Request-Id', id)),
    );
    expect(responses.map((res) => res.body.id)).toEqual(['one', 'two']);
    expect(
      events.mock.calls.map(([entry]) => (entry as { requestId: string }).requestId).sort(),
    ).toEqual(['one', 'two']);
    expect(requestContext.getStore()).toBeUndefined();
  });

  it('logs route templates and failed readiness, never query strings or raw paths', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const app = express().use(requestLogger);
    app.get('/private/:id', (_req, res) => res.sendStatus(200));
    app.get('/health/ready', (_req, res) => res.sendStatus(503));
    app.get('/health', (_req, res) => res.sendStatus(200));
    await request(app).get('/private/secret-id?q=secret-query');
    await request(app).get('/health/ready');
    await request(app).get('/health');
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/private/:id' }),
      expect.any(String),
    );
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/health/ready', status: 503 }),
      expect.any(String),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain('secret');
  });

  it('records a disconnected request exactly once', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const res = Object.assign(new EventEmitter(), {
      setHeader: vi.fn(),
      statusCode: 200,
      writableFinished: false,
    });
    requestLogger(
      { get: () => undefined, path: '/stream', method: 'POST' } as unknown as Request,
      res as unknown as Response,
      vi.fn(),
    );
    res.emit('close');
    res.emit('finish');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ aborted: true }),
      expect.any(String),
    );
  });

  it('delegates errors after streaming headers instead of writing a second response', () => {
    const next = vi.fn();
    const error = new Error('Stream failed');
    globalErrorHandler(error, {} as Request, { headersSent: true } as Response, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
