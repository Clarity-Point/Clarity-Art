import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { AIService, ChatMessage } from '../services/aiService';
import { analyzeCrisisRisk } from '../services/crisisService';
import { rewardPoints } from '../middleware/gamification';
import { AnalyticsService } from '../services/analyticsService';
import { validateImageInput, validateTextInput } from '../security/inputValidation';
import { createLogger } from '../config/logger';

const log = createLogger('aiController');

export const chat = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const { message, sessionId } = req.body;
  const messageValidation = validateTextInput(message, 4_000);
  if (!messageValidation.ok) return res.status(400).json({ error: messageValidation.error });
  const safeMessage = messageValidation.value;

  try {
    const { content: reply, usage } = await AIService.generateText(safeMessage);
    const riskLevel = await analyzeCrisisRisk(safeMessage);

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

  try {
    const riskLevel = await analyzeCrisisRisk(safeMessage);
    const tags = await AIService.extractTags(safeMessage);
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
        orderBy: { createdAt: 'asc' },
        take: 10, // Last 10 messages for context
      });
      history = dbMessages.map((m) => ({
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

    const stream = await AIService.generateTextStream(messages, req.user.id);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullReply = '';
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') {
            res.write('data: [DONE]\n\n');
            break;
          }
          try {
            const data = JSON.parse(dataStr);
            const content = data.choices[0]?.delta?.content || '';
            fullReply += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          } catch {
            // Partial JSON or other error
          }
        }
      }
    }

    // After stream ends, save assistant reply to DB
    if (fullReply) {
      await prisma.chatMessage.create({
        data: { sessionId: activeSessionId, role: 'assistant', content: fullReply },
      });
    }

    res.write(`data: ${JSON.stringify({ sessionId: activeSessionId, riskLevel })}\n\n`);
    res.end();
  } catch (error: unknown) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, 'Chat stream error');
    res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
    res.end();
  }
};

export const getSessions = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const sessions = await prisma.chatSession.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(sessions);
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

  const { promptText, mimeType, base64Image } = req.body;
  const promptValidation = validateTextInput(promptText, 2_000);
  if (!promptValidation.ok) return res.status(400).json({ error: promptValidation.error });
  const imageValidation = validateImageInput(mimeType, base64Image, 5 * 1024 * 1024);
  if (!imageValidation.ok) return res.status(400).json({ error: imageValidation.error });
  const safePrompt = promptValidation.value;

  try {
    const { content: reply, usage } = await AIService.analyzeImage(
      safePrompt,
      mimeType,
      base64Image,
    );

    await prisma.imageAnalysis.create({
      data: {
        userId: req.user.id,
        prompt: safePrompt,
        result: reply,
        tokensPrompt: usage?.prompt_tokens || 0,
        tokensCompletion: usage?.completion_tokens || 0,
        cost: 0, // Could calculate based on model rates
      },
    });

    // Award 15 points for image analysis
    await rewardPoints(req.user.id, 15, 'Image analysis');

    res.json({ reply });
  } catch (error: unknown) {
    log.error(
      { err: error instanceof Error ? error.message : String(error) },
      'Image analysis controller error',
    );
    res.status(500).json({ error: 'Error processing your image analysis request' });
  }
};
