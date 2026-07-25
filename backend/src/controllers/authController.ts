import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { registerSchema, loginSchema, profileUpdateSchema } from '../schemas';
import { JWT_SECRET } from '../config/secrets';
import { AIService } from '../services/aiService';
import { createLogger } from '../config/logger';

const log = createLogger('authController');

export const register = async (req: AuthRequest, res: Response) => {
  const validation = registerSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error.format() });
  }

  const { email, password, name } = validation.data;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        profile: {
          create: { name: name || '', category: 'general', preferredStyle: 'neutral' },
        },
      },
      include: { profile: true },
    });

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    log.error({ err: error }, 'Registration error');
    // Log details server-side only; never leak internal error messages to the client.
    res.status(500).json({ error: 'Error registering user' });
  }
};

export const login = async (req: AuthRequest, res: Response) => {
  const validation = loginSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error.format() });

  const { email, password } = validation.data;

  try {
    const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
      expiresIn: '24h',
    });
    res.cookie('ty_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        points: user.points,
        streak: user.streak,
        profile: user.profile,
      },
    });
  } catch {
    res.status(500).json({ error: 'Error logging in' });
  }
};

export const logout = async (_req: AuthRequest, res: Response) => {
  res.clearCookie('ty_session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.status(204).end();
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        profile: true,
        courseProgress: {
          include: { course: true },
        },
        submissions: {
          orderBy: { submissionDate: 'desc' },
          include: { homework: true },
        },
        diaryEntries: {
          orderBy: { date: 'desc' },
        },
        achievements: {
          include: { achievement: true },
        },
        imageAnalyses: {
          orderBy: { date: 'desc' },
        },
        chatSessions: {
          orderBy: { date: 'desc' },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });

    if (!user || !user.profile) return res.status(404).json({ error: 'Profile not found' });

    // All achievements, flagged with whether this user has earned them (locked ones show greyed-out).
    const allAchievements = await prisma.achievement.findMany();
    const earnedMap = new Map(user.achievements.map((ua) => [ua.achievementId, ua.earnedAt]));
    const { id: _profileId, ...profileData } = user.profile;

    res.json({
      ...profileData,
      id: user.id,
      email: user.email,
      // gamification / identity fields live on User, not Profile
      points: user.points,
      streak: user.streak,
      role: user.role,
      organizationId: user.organizationId,
      therapistId: user.therapistId,
      courseProgress: user.courseProgress.map((cp) => ({
        courseId: cp.courseId,
        courseSlug: cp.course.slug,
        courseName: cp.course.title,
        progress: cp.progress,
        lastAccessed: cp.lastAccessed,
      })),
      homeworkHistory: user.submissions.map((sh) => ({
        homeworkId: sh.homeworkId,
        homeworkTitle: sh.homework.title,
        submittedContent: sh.submittedContent,
        submissionDate: sh.submissionDate,
        grade: sh.grade,
        analysisText: sh.analysisText,
      })),
      // Normalise to the shape the frontend consumes (`text`, plus parsed analysis).
      diaryEntries: user.diaryEntries.map((de) => ({
        id: de.id,
        date: de.date,
        text: de.content,
        analysis: de.riskLevel ? { mood: de.riskLevel } : undefined,
      })),
      achievements: allAchievements.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        icon: a.icon,
        earned: earnedMap.has(a.id),
        earnedAt: earnedMap.get(a.id) || undefined,
      })),
      imageAnalysisHistory: user.imageAnalyses.map((ia) => ({
        id: ia.id,
        isPublic: ia.isPublic,
        timestamp: ia.date,
        imagePreviewUrl: ia.imageUrl || '',
        analysisText: ia.result,
        originalImageName: ia.prompt,
      })),
      chatSessions: user.chatSessions.map((cs) =>
        cs.messages.map((m) => ({
          text: m.content,
          sender: m.role === 'assistant' ? 'ИИ' : 'user',
          timestamp: m.createdAt,
        })),
      ),
    });
  } catch (error) {
    log.error({ err: error }, 'Error fetching profile');
    res.status(500).json({ error: 'Error fetching profile' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const validation = profileUpdateSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error.format() });

  try {
    await prisma.profile.update({
      where: { userId: req.user.id },
      data: validation.data,
    });
    res.json({ message: 'Profile updated' });
  } catch {
    res.status(500).json({ error: 'Error updating profile' });
  }
};

/**
 * A reflective, supportive summary of the user's overall picture, generated from
 * their profile and activity. Uses the same provider-agnostic AIService as chat,
 * so it works with any OpenAI-compatible endpoint and degrades to a calm canned
 * response when no AI provider is configured. Unlike /chat it does NOT create a
 * chat session or award points — it is a read-only, on-demand analysis.
 */
export const generateProfileAnalysis = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        profile: true,
        _count: {
          select: { diaryEntries: true, imageAnalyses: true, courseProgress: true },
        },
        diaryEntries: { orderBy: { date: 'desc' }, take: 5 },
      },
    });

    if (!user || !user.profile) return res.status(404).json({ error: 'Profile not found' });

    const p = user.profile;
    const recentDiary = user.diaryEntries.map((d) => `- ${d.content}`).join('\n') || 'нет записей';

    const prompt = `Ты — бережный рефлексивный ассистент, не психолог и не медицинский специалист. На основе профиля пользователя составь короткое (3–5 абзацев), поддерживающее и уважительное резюме: сильные стороны, вопросы для саморефлексии и 2–3 необязательных арт-практики. Не ставь диагнозов, не оценивай риск, не давай медицинских, юридических или терапевтических предписаний.

Имя: ${p.name || 'не указано'}
Возраст: ${p.age ?? 'не указан'}
Категория: ${p.category}
Цели терапии: ${p.therapyGoals || 'не указаны'}
Что беспокоит: ${p.mainConcerns || 'не указано'}
Интересы: ${Array.isArray(p.interests) ? p.interests.join(', ') : p.interests || 'не указаны'}
Дополнительно: ${p.additionalInfo || '—'}
Активность: записей в дневнике — ${user._count.diaryEntries}, анализов рисунков — ${user._count.imageAnalyses}, курсов в работе — ${user._count.courseProgress}.
Последние записи дневника:
${recentDiary}`;

    const { content } = await AIService.generateText(prompt);
    res.json({ analysis: content });
  } catch (error) {
    log.error({ err: error }, 'Profile analysis error');
    res.status(500).json({ error: 'Error generating profile analysis' });
  }
};
