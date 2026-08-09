import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createLogger } from '../config/logger';
import { gradeSubmissionSchema } from '../schemas';

const log = createLogger('adminController');

const coursePayload = (body: Record<string, unknown>) => ({
  title: typeof body.title === 'string' ? body.title.trim() : '',
  description: typeof body.description === 'string' ? body.description.trim() : '',
  category: typeof body.category === 'string' ? body.category : 'general',
  thumbnailUrl:
    typeof body.thumbnailUrl === 'string' && body.thumbnailUrl ? body.thumbnailUrl : null,
  targetAudience: Array.isArray(body.targetAudience)
    ? body.targetAudience.filter((item): item is string => typeof item === 'string')
    : [],
  goals: Array.isArray(body.goals)
    ? body.goals.filter((item): item is string => typeof item === 'string')
    : [],
});

export const createCourse = async (req: AuthRequest, res: Response) => {
  const payload = coursePayload(req.body);
  const slugSource = typeof req.body.slug === 'string' ? req.body.slug : req.body.id;
  const slug = typeof slugSource === 'string' ? slugSource.trim().toLowerCase() : '';
  if (!payload.title || !payload.description || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return res.status(400).json({
      error: 'Укажите название, описание и ID латиницей в формате my-course',
    });
  }
  try {
    const course = await prisma.course.create({ data: { slug, ...payload } });
    res.status(201).json(course);
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'Курс с таким ID уже существует' });
    }
    res.status(500).json({ error: 'Error creating course' });
  }
};

export const updateCourse = async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const payload = coursePayload(req.body);
  if (!payload.title || !payload.description) {
    return res.status(400).json({ error: 'Название и описание курса обязательны' });
  }
  try {
    const course = await prisma.course.update({ where: { id }, data: payload });
    res.json(course);
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2025') {
      return res.status(404).json({ error: 'Курс не найден' });
    }
    return res.status(500).json({ error: 'Error updating course' });
  }
};

export const deleteCourse = async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  try {
    const usage = await prisma.course.findUnique({
      where: { id },
      select: {
        _count: { select: { courseProgress: true, homework: true } },
        homework: { select: { _count: { select: { submissions: true } } } },
      },
    });
    if (!usage) return res.status(404).json({ error: 'Курс не найден' });
    const hasSubmissions = usage.homework.some((item) => item._count.submissions > 0);
    if (usage._count.courseProgress > 0 || hasSubmissions) {
      return res.status(409).json({
        error: 'Нельзя удалить курс с прогрессом пользователей или сданными заданиями',
      });
    }
    await prisma.course.delete({ where: { id } });
    res.json({ message: 'Course deleted' });
  } catch {
    return res.status(500).json({ error: 'Error deleting course' });
  }
};

export const createModule = async (req: AuthRequest, res: Response) => {
  const courseId = req.params.courseId as string;
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  if (!title || title.length > 200) return res.status(400).json({ error: 'Invalid module title' });
  try {
    const mod = await prisma.module.create({
      data: { courseId, title, order: Number.isInteger(req.body.order) ? req.body.order : 0 },
    });
    res.status(201).json(mod);
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2003') {
      return res.status(404).json({ error: 'Course not found' });
    }
    res.status(500).json({ error: 'Error creating module' });
  }
};

export const deleteModule = async (req: AuthRequest, res: Response) => {
  try {
    await prisma.module.delete({ where: { id: req.params.id as string } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'Module not found' });
  }
};

export const createLesson = async (req: AuthRequest, res: Response) => {
  const moduleId = req.params.moduleId as string;
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : null;
  if (!title || title.length > 200 || (content?.length || 0) > 20_000) {
    return res.status(400).json({ error: 'Invalid lesson' });
  }
  try {
    const lesson = await prisma.lesson.create({
      data: {
        moduleId,
        title,
        content,
        order: Number.isInteger(req.body.order) ? req.body.order : 0,
      },
    });
    res.status(201).json(lesson);
  } catch {
    res.status(404).json({ error: 'Module not found' });
  }
};

export const deleteLesson = async (req: AuthRequest, res: Response) => {
  try {
    await prisma.lesson.delete({ where: { id: req.params.id as string } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'Lesson not found' });
  }
};

export const createHomework = async (req: AuthRequest, res: Response) => {
  const courseId = req.params.courseId as string;
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  if (!title || title.length > 200 || !description || description.length > 10_000) {
    return res.status(400).json({ error: 'Invalid homework' });
  }
  try {
    const homework = await prisma.homework.create({ data: { courseId, title, description } });
    res.status(201).json(homework);
  } catch {
    res.status(404).json({ error: 'Course not found' });
  }
};

export const deleteHomework = async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const submissions = await prisma.submission.count({ where: { homeworkId: id } });
  if (submissions > 0) {
    return res.status(409).json({ error: 'Нельзя удалить задание с ответами пользователей' });
  }
  try {
    await prisma.homework.delete({ where: { id } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'Homework not found' });
  }
};

export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const userCount = await prisma.user.count();
    const courseCount = await prisma.course.count();
    const submissionCount = await prisma.submission.count();

    // AI Usage Stats
    const chatStats = await prisma.chatSession.aggregate({
      _sum: {
        tokensPrompt: true,
        tokensCompletion: true,
        cost: true,
      },
    });

    const imageStats = await prisma.imageAnalysis.aggregate({
      _sum: {
        tokensPrompt: true,
        tokensCompletion: true,
        cost: true,
      },
    });

    const totalTokens =
      (chatStats._sum.tokensPrompt || 0) +
      (chatStats._sum.tokensCompletion || 0) +
      (imageStats._sum.tokensPrompt || 0) +
      (imageStats._sum.tokensCompletion || 0);

    const totalCost = (chatStats._sum.cost || 0) + (imageStats._sum.cost || 0);

    const latestSubmissions = await prisma.submission.findMany({
      take: 5,
      orderBy: { submissionDate: 'desc' },
      include: { user: { select: { email: true } }, homework: { select: { title: true } } },
    });

    res.json({
      userCount,
      courseCount,
      submissionCount,
      totalTokens,
      totalCost,
      latestSubmissions,
    });
  } catch {
    res.status(500).json({ error: 'Error fetching stats' });
  }
};

export const getSubmissions = async (req: AuthRequest, res: Response) => {
  try {
    const submissions = await prisma.submission.findMany({
      include: {
        user: { select: { email: true } },
        homework: { select: { title: true } },
      },
      orderBy: { submissionDate: 'desc' },
    });

    const formatted = submissions.map((s) => ({
      userId: s.userId,
      homeworkId: s.homeworkId,
      userEmail: s.user.email,
      homeworkTitle: s.homework.title,
      submittedContent: s.submittedContent,
      submissionDate: s.submissionDate,
      grade: s.grade,
      analysisText: s.analysisText,
    }));

    res.json(formatted);
  } catch {
    res.status(500).json({ error: 'Error fetching submissions' });
  }
};

export const gradeSubmission = async (req: AuthRequest, res: Response) => {
  const validation = gradeSubmissionSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: 'Invalid grade submission' });
  const { userId, homeworkId, grade, analysisText } = validation.data;
  try {
    const submission = await prisma.submission.update({
      where: {
        userId_homeworkId: { userId, homeworkId },
      },
      data: {
        grade,
        analysisText,
      },
    });
    res.json(submission);
  } catch (error) {
    log.error({ err: error }, 'gradeSubmission error');
    res.status(500).json({ error: 'Error grading submission' });
  }
};
