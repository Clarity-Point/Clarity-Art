import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest, sendAIConsentRequired } from '../middleware/auth';
import { AIService, ChatMessage } from '../services/aiService';
import { analyzeCrisisRisk } from '../services/crisisService';
import { rewardPoints } from '../middleware/gamification';
import { AnalyticsService } from '../services/analyticsService';
import { validateImageInput, validateTextInput } from '../security/inputValidation';
import { createLogger } from '../config/logger';
import { readStoredImage, removeStoredImage, storeImage } from '../services/imageStorageService';
import { canUseConfiguredAI } from '../services/aiConsentService';
import { AI_CHAT_TIMEOUT_MS } from '../config/ai';

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
    let session;
    if (sessionId) {
      session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId: req.user.id },
      });
      if (!session) return res.status(404).json({ error: 'Session not found' });
    }

    if (!(await canUseConfiguredAI(req.user.id))) return sendAIConsentRequired(res);
    const [{ content: reply, usage }, riskLevel] = await Promise.all([
      AIService.generateText(safeMessage),
      analyzeCrisisRisk(safeMessage, true),
    ]);

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
    await rewardPoints(req.user.id, 5);
    await AnalyticsService.updateAttentionScore(req.user.id).catch((err) => {
      log.error({ err }, 'Chat attention update failed');
    });

    res.json({ reply, riskLevel, sessionId: session.id });
  } catch (error: unknown) {
    log.error({ err: error }, 'Chat controller error');
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
  res.once('close', () => abort.abort());

  try {
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

    if (abort.signal.aborted) return res.end();
    if (!(await canUseConfiguredAI(req.user.id))) return sendAIConsentRequired(res);
    if (abort.signal.aborted) return res.end();

    const [riskLevel, tags] = await Promise.all([
      analyzeCrisisRisk(safeMessage, true),
      AIService.extractTags(safeMessage, true),
    ]);
    // Consent may have changed while enrichment was in flight.
    if (!(await canUseConfiguredAI(req.user.id))) return sendAIConsentRequired(res);
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
    if (abort.signal.aborted) return res.end();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    const metadata = `data: ${JSON.stringify({ sessionId: activeSessionId, riskLevel })}\n\n`;
    res.write(metadata);

    const analytics = await Promise.allSettled([
      AnalyticsService.logSentiment(req.user.id, riskLevel, tags),
      AnalyticsService.updateAttentionScore(req.user.id),
    ]);
    for (const result of analytics) {
      if (result.status === 'rejected') log.error({ err: result.reason }, 'Chat analytics failed');
    }

    if (abort.signal.aborted) return res.end();
    if (!(await canUseConfiguredAI(req.user.id))) {
      return res.end(
        `data: ${JSON.stringify({ error: 'AI consent required', code: 'AI_CONSENT_REQUIRED' })}\n\n`,
      );
    }
    const stream = await AIService.generateTextStream(messages, abort.signal);
    if (abort.signal.aborted) {
      await stream.cancel().catch(() => undefined);
      return res.end();
    }

    let fullReply = '';
    let doneEvent = false;
    let finishedChoice = false;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let upstreamBuffer = '';

    const releaseUpstream = () => void reader.cancel().catch(() => undefined);
    abort.signal.addEventListener('abort', releaseUpstream, { once: true });
    if (abort.signal.aborted) releaseUpstream();

    const forwardEvent = (event: string) => {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trimStart();
        if (dataStr === '[DONE]') {
          doneEvent = true;
          return;
        }
        let data: {
          error?: unknown;
          choices?: { delta?: { content?: unknown }; finish_reason?: string | null }[];
        };
        try {
          data = JSON.parse(dataStr);
        } catch {
          continue;
        }
        const choice = data?.choices?.[0];
        if (data?.error || choice?.finish_reason === 'error') {
          throw new Error('AI provider reported a stream error');
        }
        if (choice?.finish_reason) finishedChoice = true;
        const content = choice?.delta?.content;
        if (typeof content === 'string' && content) {
          fullReply += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
    };

    try {
      while (!abort.signal.aborted && !doneEvent) {
        let timedOut = false;
        const idleTimer = setTimeout(() => {
          timedOut = true;
          releaseUpstream();
        }, AI_CHAT_TIMEOUT_MS);
        const { done, value } = await reader.read().finally(() => clearTimeout(idleTimer));
        if (timedOut) throw new Error('AI stream became idle');
        if (done || abort.signal.aborted) break;
        upstreamBuffer += decoder.decode(value, { stream: true });
        const events = upstreamBuffer.split(/\r?\n\r?\n/);
        upstreamBuffer = events.pop() || '';
        for (const event of events) {
          forwardEvent(event);
          if (doneEvent) break;
        }
      }
      if (!doneEvent && !abort.signal.aborted) forwardEvent(upstreamBuffer + decoder.decode());
    } finally {
      abort.signal.removeEventListener('abort', releaseUpstream);
      releaseUpstream();
    }

    // After stream ends, save assistant reply to DB. An aborted stream is not an
    // error the user needs to see, and the truncated text is not worth storing
    // as if the assistant had finished its answer.
    if (abort.signal.aborted) {
      log.info('Chat stream aborted by the client before completion');
      return res.end();
    }
    if (!doneEvent && !finishedChoice) throw new Error('AI stream ended before completion');

    if (fullReply) {
      await prisma.chatMessage.create({
        data: { sessionId: activeSessionId, role: 'assistant', content: fullReply },
      });
      await rewardPoints(req.user.id, 5);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: unknown) {
    log.error({ err: error }, 'Chat stream error');
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
    if (!allowProvider) return sendAIConsentRequired(res);
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
    if (!analysisId) await rewardPoints(req.user.id, 15);

    res.json({ reply, analysisId: analysis.id, timestamp: analysis.date });
  } catch (error: unknown) {
    log.error({ err: error }, 'Image analysis controller error');
    res.status(500).json({ error: 'Error processing your image analysis request' });
  }
};

export const getStoredImage = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const id = req.params.id as string;
  try {
    const image = await prisma.imageAnalysis.findFirst({
      where: {
        id,
        OR: [
          { userId: req.user.id },
          { isPublic: true, moderationStatus: 'VISIBLE' },
          ...(req.user.role === 'ADMIN' ? [{ reports: { some: {} } }] : []),
        ],
      },
      select: { imageStorageKey: true, imageMimeType: true, imageUrl: true },
    });
    if (!image) return res.status(404).json({ error: 'Image not found' });
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
