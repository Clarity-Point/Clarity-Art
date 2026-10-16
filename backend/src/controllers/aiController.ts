import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { AIService, ChatMessage } from '../services/aiService';
import { analyzeCrisisRisk } from '../services/crisisService';
import { rewardPoints } from '../middleware/gamification';
import { AnalyticsService } from '../services/analyticsService';
import { validateImageInput, validateTextInput } from '../security/inputValidation';
import { createLogger } from '../config/logger';
import { readStoredImage, removeStoredImage, storeImage } from '../services/imageStorageService';
import { canUseConfiguredAI } from '../services/aiConsentService';

const log = createLogger('aiController');

/** Cap on stored images per user, enforced on the server rather than the client. */
const MAX_STORED_IMAGES = 500;
const MAX_QUESTIONS = 20;
const MAX_QUESTION_FIELD = 2_000;

/** Image types this endpoint is allowed to serve for legacy inline rows. */
const LEGACY_INLINE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * `extendedQuestions` is persisted as a JSON column straight from the request
 * body. Without bounding its shape, a client can persist an arbitrarily large
 * or deeply nested structure and have it re-read on every profile load.
 */
function sanitizeQuestions(input: unknown): Array<Record<string, string>> {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_QUESTIONS).flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;
    const pick = (key: string) =>
      typeof record[key] === 'string' ? (record[key] as string).slice(0, MAX_QUESTION_FIELD) : '';
    return [
      { questionText: pick('questionText'), rationale: pick('rationale'), answer: pick('answer') },
    ];
  });
}

export const chat = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const { message, sessionId } = req.body;
  const messageValidation = validateTextInput(message, 4_000);
  if (!messageValidation.ok) return res.status(400).json({ error: messageValidation.error });
  const safeMessage = messageValidation.value;

  try {
    // Defence in depth: the route already requires consent, but the provider
    // calls below must never be reachable without it re-verified here.
    const allowProvider = await canUseConfiguredAI(req.user.id);
    const { content: reply, usage } = await AIService.generateText(safeMessage);
    const riskLevel = await analyzeCrisisRisk(safeMessage, allowProvider);

    // Get or create session. Only allow access to sessions owned by the user.
    let session;
    if (sessionId) {
      session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId: req.user.id },
      });
      if (!session) return res.status(404).json({ error: 'Session not found' });
    }

    if (!session) {
      session = await prisma.chatSession.create({
        data: {
          userId: req.user.id,
          riskLevel,
          title: safeMessage.substring(0, 30) + '...',
          tokensPrompt: usage?.prompt_tokens || 0,
          tokensCompletion: usage?.completion_tokens || 0,
        },
      });
    } else {
      await prisma.chatSession.update({
        where: { id: session.id },
        data: {
          riskLevel,
          tokensPrompt: { increment: usage?.prompt_tokens || 0 },
          tokensCompletion: { increment: usage?.completion_tokens || 0 },
        },
      });
    }

    // Save messages
    await prisma.chatMessage.createMany({
      data: [
        { sessionId: session.id, role: 'user', content: safeMessage },
        {
          sessionId: session.id,
          role: 'assistant',
          content: reply,
          tokensPrompt: usage?.prompt_tokens || 0,
          tokensCompletion: usage?.completion_tokens || 0,
        },
      ],
    });

    // Award 5 points for each chat message
    await rewardPoints(req.user.id, 5, 'Chat engagement');

    res.json({ reply, riskLevel, sessionId: session.id });
  } catch (error: unknown) {
    log.error(
      { err: error instanceof Error ? error.message : String(error) },
      'Chat controller error',
    );
    res.status(500).json({ error: 'Error processing your request' });
  }
};

export const chatStream = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const { message, sessionId } = req.body;
  const messageValidation = validateTextInput(message, 4_000);
  if (!messageValidation.ok) return res.status(400).json({ error: messageValidation.error });
  const safeMessage = messageValidation.value;

  // Declared before the first provider call so an early disconnect is still
  // observed, and so the abort handler below can be attached exactly once.
  const abort = new AbortController();

  try {
    const allowProvider = await canUseConfiguredAI(req.user.id);
    const riskLevel = await analyzeCrisisRisk(safeMessage, allowProvider);
    const tags = await AIService.extractTags(safeMessage, allowProvider);
    await AnalyticsService.logSentiment(req.user.id, riskLevel, tags, safeMessage);

    // Get previous messages for context
    let history: ChatMessage[] = [];
    let activeSessionId = sessionId;

    if (activeSessionId) {
      // Ensure the session belongs to the requesting user before touching it.
      const ownedSession = await prisma.chatSession.findFirst({
        where: { id: activeSessionId, userId: req.user.id },
      });
      if (!ownedSession) return res.status(404).json({ error: 'Session not found' });

      const dbMessages = await prisma.chatMessage.findMany({
        where: { sessionId: activeSessionId },
        orderBy: { createdAt: 'desc' },
        take: 10, // Last 10 messages for context
      });
      history = dbMessages.reverse().map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
    }

    const messages = [...history, { role: 'user', content: safeMessage }];

    // Create or update session before stream starts
    if (!activeSessionId) {
      const session = await prisma.chatSession.create({
        data: {
          userId: req.user.id,
          riskLevel,
          tags,
          title: safeMessage.substring(0, 30) + '...',
        },
      });
      activeSessionId = session.id;
    } else {
      await prisma.chatSession.update({
        where: { id: activeSessionId },
        data: { riskLevel, tags },
      });
    }

    // Save user message immediately
    await prisma.chatMessage.create({
      data: { sessionId: activeSessionId, role: 'user', content: safeMessage },
    });

    const stream = await AIService.generateTextStream(messages, req.user.id, abort.signal);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullReply = '';
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let upstreamBuffer = '';

    /*
     * The client going away is the normal case, not an exception: the user
     * closes the tab, switches view or loses connectivity mid-answer. Without
     * this the read loop keeps pulling (and paying for) a reply nobody reads,
     * the upstream socket stays pinned, and each abandoned tab leaks a
     * connection until the process runs out of them.
     */
    const releaseUpstream = () => {
      void reader.cancel().catch(() => undefined);
    };
    res.on('close', () => {
      abort.abort();
      releaseUpstream();
    });

    const forwardEvent = (event: string) => {
      for (const line of event.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6);
        if (dataStr === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }
        try {
          const data = JSON.parse(dataStr);
          const content = data.choices?.[0]?.delta?.content || '';
          fullReply += content;
          if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
        } catch {
          // Ignore malformed complete events from an upstream provider.
        }
      }
    };

    while (true) {
      if (abort.signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      upstreamBuffer += decoder.decode(value, { stream: true });
      const events = upstreamBuffer.split('\n\n');
      upstreamBuffer = events.pop() || '';
      events.forEach(forwardEvent);
    }
    upstreamBuffer += decoder.decode();
    if (upstreamBuffer.trim() && !abort.signal.aborted) forwardEvent(upstreamBuffer);

    // After stream ends, save assistant reply to DB. An aborted stream is not an
    // error the user needs to see, and the truncated text is not worth storing
    // as if the assistant had finished its answer.
    if (abort.signal.aborted) {
      log.info('Chat stream aborted by the client before completion');
      return res.end();
    }

    if (fullReply) {
      await prisma.chatMessage.create({
        data: { sessionId: activeSessionId, role: 'assistant', content: fullReply },
      });
      await rewardPoints(req.user.id, 5, 'Chat engagement');
    }

    res.write(`data: ${JSON.stringify({ sessionId: activeSessionId, riskLevel })}\n\n`);
    res.end();
  } catch (error: unknown) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, 'Chat stream error');
    if (abort.signal.aborted) return res.end();
    if (!res.headersSent) {
      return res.status(502).json({ error: 'Не удалось получить ответ ассистента' });
    }
    res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
    return res.end();
  }
};

export const getSessions = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const sessions = await prisma.chatSession.findMany({
      where: { userId: req.user.id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (sessions.length > limit) res.setHeader('X-Next-Cursor', sessions[limit - 1].id);
    res.json(sessions.slice(0, limit));
  } catch {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

export const getChatHistory = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const sessionId = req.params.sessionId as string;
  try {
    // Only expose messages from a session the requesting user owns.
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId: req.user.id },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(messages);
  } catch {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
};

export const analyzeImage = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const { promptText, mimeType, base64Image, analysisId, originalImageName, extendedQuestions } =
    req.body;
  const promptValidation = validateTextInput(promptText, 2_000);
  if (!promptValidation.ok) return res.status(400).json({ error: promptValidation.error });
  const imageValidation = validateImageInput(mimeType, base64Image, 5 * 1024 * 1024);
  if (!imageValidation.ok) return res.status(400).json({ error: imageValidation.error });
  const safePrompt = promptValidation.value;

  try {
    // Verify ownership BEFORE spending an AI call. Sending the image upstream
    // and only then rejecting the request would both burn provider capacity and
    // transmit a picture to a third party on behalf of an id the caller does not
    // own.
    let analysis;
    if (typeof analysisId === 'string' && analysisId) {
      const owned = await prisma.imageAnalysis.findFirst({
        where: { id: analysisId, userId: req.user.id },
        select: { id: true },
      });
      if (!owned) return res.status(404).json({ error: 'Image analysis not found' });
    }

    // Consent is re-checked here as defence in depth, so the image cannot reach
    // an external provider even if this route is ever mounted without the
    // requireAIConsent middleware.
    const allowProvider = await canUseConfiguredAI(req.user.id);
    const { content: reply, usage } = await AIService.analyzeImage(
      safePrompt,
      mimeType,
      base64Image,
      allowProvider,
    );

    if (typeof analysisId === 'string' && analysisId) {
      analysis = await prisma.imageAnalysis.update({
        where: { id: analysisId },
        data: {
          extendedAnalysisText: reply,
          ...(Array.isArray(extendedQuestions)
            ? { extendedQuestions: sanitizeQuestions(extendedQuestions) }
            : {}),
          tokensPrompt: { increment: usage?.prompt_tokens || 0 },
          tokensCompletion: { increment: usage?.completion_tokens || 0 },
        },
      });
    } else {
      // Storage is bounded on the server. The upload is capped per request, but
      // without a per-user ceiling a single account can fill the shared volume
      // and deny service to every other user on the deployment.
      const stored = await prisma.imageAnalysis.count({ where: { userId: req.user.id } });
      if (stored >= MAX_STORED_IMAGES) {
        return res.status(507).json({
          error: 'Достигнут лимит сохранённых работ. Удалите старые анализы в профиле.',
        });
      }

      const imageStorageKey = await storeImage(base64Image, mimeType);
      try {
        analysis = await prisma.imageAnalysis.create({
          data: {
            userId: req.user.id,
            prompt: safePrompt,
            result: reply,
            imageUrl: null,
            imageStorageKey,
            imageMimeType: mimeType,
            originalImageName:
              typeof originalImageName === 'string' ? originalImageName.slice(0, 255) : null,
            tokensPrompt: usage?.prompt_tokens || 0,
            tokensCompletion: usage?.completion_tokens || 0,
            cost: 0,
          },
        });
      } catch (error) {
        await removeStoredImage(imageStorageKey);
        throw error;
      }
    }

    // Award 15 points for image analysis
    if (!analysisId) await rewardPoints(req.user.id, 15, 'Image analysis');

    res.json({ reply, analysisId: analysis.id, timestamp: analysis.date });
  } catch (error: unknown) {
    log.error(
      { err: error instanceof Error ? error.message : String(error) },
      'Image analysis controller error',
    );
    res.status(500).json({ error: 'Error processing your image analysis request' });
  }
};

export const getStoredImage = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const id = req.params.id as string;
  try {
    const image = await prisma.imageAnalysis.findFirst({
      where: { id, OR: [{ userId: req.user.id }, { isPublic: true }] },
      select: { imageStorageKey: true, imageMimeType: true, imageUrl: true },
    });
    if (!image) return res.status(404).json({ error: 'Image not found' });
    res.setHeader('Cache-Control', image.imageStorageKey ? 'private, max-age=3600' : 'no-store');
    if (image.imageStorageKey) {
      res.type(image.imageMimeType || 'application/octet-stream');
      return res.send(await readStoredImage(image.imageStorageKey));
    }
    if (image.imageUrl?.startsWith('data:')) {
      const match = image.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return res.status(404).json({ error: 'Image data not found' });
      /*
       * The media type travels in the data URL, which for legacy rows is
       * whatever was stored. Serving it back verbatim lets a stored value like
       * `text/html` turn this endpoint into a same-origin XSS sink: the browser
       * would render attacker markup from the app's own origin.
       */
      if (!LEGACY_INLINE_MIME_TYPES.has(match[1])) {
        return res.status(404).json({ error: 'Image data not found' });
      }
      // Re-derive the response type from the validated set rather than echoing.
      res.type(match[1]);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(Buffer.from(match[2], 'base64'));
    }
    return res.status(404).json({ error: 'Image data not found' });
  } catch {
    return res.status(500).json({ error: 'Error reading image' });
  }
};
