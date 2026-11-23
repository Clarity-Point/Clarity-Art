import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { AuthRequest } from '../../src/middleware/auth';

const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  generateText: vi.fn(),
  saveMessage: vi.fn(),
  findSession: vi.fn(),
  canUseAI: vi.fn(),
  extractTags: vi.fn(),
  analyzeRisk: vi.fn(),
  logSentiment: vi.fn(),
  updateAttentionScore: vi.fn(),
}));
vi.mock('../../src/config/prisma', () => ({
  default: {
    chatSession: {
      create: vi.fn().mockResolvedValue({ id: 'session' }),
      findFirst: mocks.findSession,
    },
    chatMessage: { create: mocks.saveMessage },
  },
}));
vi.mock('../../src/services/aiService', () => ({
  AIService: {
    extractTags: mocks.extractTags,
    generateText: mocks.generateText,
    generateTextStream: mocks.stream,
  },
}));
vi.mock('../../src/services/aiConsentService', () => ({
  canUseConfiguredAI: mocks.canUseAI,
}));
vi.mock('../../src/services/crisisService', () => ({
  analyzeCrisisRisk: mocks.analyzeRisk,
}));
vi.mock('../../src/services/analyticsService', () => ({
  AnalyticsService: {
    logSentiment: mocks.logSentiment,
    updateAttentionScore: mocks.updateAttentionScore,
  },
}));
vi.mock('../../src/middleware/gamification', () => ({ rewardPoints: vi.fn() }));
vi.mock('../../src/config/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/config/ai')>()),
  AI_CHAT_TIMEOUT_MS: 30,
}));
import { chat, chatStream } from '../../src/controllers/aiController';

const req = { user: { id: 'owner' }, body: { message: 'Hello' } } as AuthRequest;
const response = () => {
  const res = Object.assign(new EventEmitter(), {
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    json: vi.fn(),
    status: vi.fn(),
    headersSent: false,
  });
  res.status.mockReturnValue(res);
  res.write.mockImplementation(() => {
    res.headersSent = true;
    return true;
  });
  return res;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findSession.mockResolvedValue(null);
  mocks.canUseAI.mockResolvedValue(true);
  mocks.analyzeRisk.mockResolvedValue('low');
  mocks.extractTags.mockResolvedValue([]);
  mocks.generateText.mockResolvedValue({ content: 'Reply', usage: null });
  mocks.logSentiment.mockResolvedValue(null);
  mocks.updateAttentionScore.mockResolvedValue(undefined);
});

const chatHandlers = [
  { name: 'JSON', handler: chat },
  { name: 'SSE', handler: chatStream },
];

it.each(chatHandlers)('checks ownership before processing input ($name)', async ({ handler }) => {
  const res = response();
  await handler(
    { ...req, body: { ...req.body, sessionId: 'other-session' } },
    res as unknown as Response,
  );
  expect(res.status).toHaveBeenCalledWith(404);
  expect(mocks.generateText).not.toHaveBeenCalled();
  expect(mocks.stream).not.toHaveBeenCalled();
  expect(mocks.analyzeRisk).not.toHaveBeenCalled();
  expect(mocks.extractTags).not.toHaveBeenCalled();
  expect(mocks.logSentiment).not.toHaveBeenCalled();
});

it.each(chatHandlers)(
  'rejects requests after AI consent is withdrawn ($name)',
  async ({ handler }) => {
    mocks.canUseAI.mockResolvedValue(false);
    const res = response();
    await handler(req, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(412);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AI_CONSENT_REQUIRED' }));
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.saveMessage).not.toHaveBeenCalled();
  },
);

describe('server chat stream', () => {
  it('does not open the stream when consent is withdrawn during enrichment', async () => {
    mocks.canUseAI.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const res = response();
    await chatStream(req, res as unknown as Response);
    expect(mocks.extractTags).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(412);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.saveMessage).not.toHaveBeenCalled();
    expect(mocks.logSentiment).not.toHaveBeenCalled();
  });

  it('cancels the provider when the client disconnects before headers arrive', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let resolveStream!: (stream: ReadableStream<Uint8Array>) => void;
    let signal!: AbortSignal;
    mocks.stream.mockImplementation((_messages, abortSignal) => {
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
    expect(res.write).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('"sessionId":"session"'),
    );
    expect(mocks.saveMessage).toHaveBeenCalledTimes(1);
  });

  it('disables private stream caching, sends session metadata and persists the completed reply', async () => {
    const encoder = new TextEncoder();
    mocks.stream.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello '));
          controller.enqueue(encoder.encode('back"}}]}\r\n\r\ndata: [DONE]\r\n\r\n'));
          controller.close();
        },
      }),
    );
    const res = response();
    await chatStream(req, res as unknown as Response);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.write.mock.calls[0][0]).toContain('"sessionId":"session"');
    expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(mocks.updateAttentionScore).toHaveBeenCalledWith('owner');
    expect(mocks.updateAttentionScore.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.saveMessage.mock.invocationCallOrder[0],
    );
    expect(mocks.saveMessage).toHaveBeenLastCalledWith({
      data: {
        sessionId: 'session',
        role: 'assistant',
        content: 'Hello back',
      },
    });
  });

  it.each([
    ['premature EOF', ''],
    ['provider error', 'data: {"error":{"message":"Upstream failed"}}\n\n'],
  ])('keeps only the user message after %s', async (_description, ending) => {
    const input = new TextEncoder().encode(
      'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n' + ending,
    );
    mocks.stream.mockResolvedValue(new Response(input).body);
    const res = response();
    await chatStream(req, res as unknown as Response);
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"error":"Stream error"'));
    expect(res.write).not.toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(mocks.saveMessage).toHaveBeenCalledExactlyOnceWith({
      data: { sessionId: 'session', role: 'user', content: 'Hello' },
    });
  });

  it('cancels an upstream that stops sending events after opening', async () => {
    const cancel = vi.fn();
    mocks.stream.mockResolvedValue(new ReadableStream({ cancel }));
    const res = response();
    await chatStream(req, res as unknown as Response);
    expect(cancel).toHaveBeenCalledOnce();
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"error":"Stream error"'));
    expect(mocks.saveMessage).toHaveBeenCalledTimes(1);
  });
});
