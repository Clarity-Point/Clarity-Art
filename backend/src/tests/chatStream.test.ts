import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';

const mocks = vi.hoisted(() => ({ stream: vi.fn(), saveMessage: vi.fn() }));
vi.mock('../config/prisma', () => ({
  default: {
    chatSession: { create: vi.fn().mockResolvedValue({ id: 'session' }) },
    chatMessage: { create: mocks.saveMessage },
  },
}));
vi.mock('../services/aiService', () => ({
  AIService: {
    extractTags: vi.fn().mockResolvedValue([]),
    generateTextStream: mocks.stream,
  },
}));
vi.mock('../services/aiConsentService', () => ({
  canUseConfiguredAI: vi.fn().mockResolvedValue(true),
}));
vi.mock('../services/crisisService', () => ({
  analyzeCrisisRisk: vi.fn().mockResolvedValue('low'),
}));
vi.mock('../services/analyticsService', () => ({ AnalyticsService: { logSentiment: vi.fn() } }));
vi.mock('../middleware/gamification', () => ({ rewardPoints: vi.fn() }));
import { chatStream } from '../controllers/aiController';

const req = { user: { id: 'owner' }, body: { message: 'Hello' } } as AuthRequest;
const response = () =>
  Object.assign(new EventEmitter(), {
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    headersSent: false,
  });
beforeEach(() => vi.clearAllMocks());

describe('server chat stream', () => {
  it('cancels the provider when the client disconnects before headers arrive', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let resolveStream!: (stream: ReadableStream<Uint8Array>) => void;
    let signal!: AbortSignal;
    mocks.stream.mockImplementation((_messages, _userId, abortSignal) => {
      signal = abortSignal;
      started();
      return new Promise((resolve) => {
        resolveStream = resolve;
      });
    });
    const res = response();
    const pending = chatStream(req, res as unknown as Response);
    await ready;
    res.emit('close');
    expect(signal.aborted).toBe(true);
    const cancel = vi.fn();
    resolveStream(new ReadableStream({ cancel }));
    await pending;
    expect(cancel).toHaveBeenCalledOnce();
    expect(res.write).not.toHaveBeenCalled();
    expect(mocks.saveMessage).toHaveBeenCalledTimes(1);
  });

  it('disables private stream caching, sends session metadata and persists the completed reply', async () => {
    const encoder = new TextEncoder();
    mocks.stream.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"Hello back"}}]}\n\n'),
          );
          controller.close();
        },
      }),
    );
    const res = response();
    await chatStream(req, res as unknown as Response);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.write.mock.calls[0][0]).toContain('"sessionId":"session"');
    expect(mocks.saveMessage).toHaveBeenLastCalledWith({
      data: {
        sessionId: 'session',
        role: 'assistant',
        content: 'Hello back',
      },
    });
  });
});
