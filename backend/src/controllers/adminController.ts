import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createLogger } from '../config/logger';

const log = createLogger('adminController');

export const createCourse = async (req: AuthRequest, res: Response) => {
  try {
    const course = await prisma.course.create({ data: req.body });
    res.status(201).json(course);
  } catch {
    res.status(500).json({ error: 'Error creating course' });
  }
};

export const updateCourse = async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  try {
    const course = await prisma.course.update({ where: { id }, data: req.body });
    res.json(course);
  } catch {
    res.status(500).json({ error: 'Error updating course' });
  }
};

export const deleteCourse = async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  try {
    await prisma.course.delete({ where: { id } });
    res.json({ message: 'Course deleted' });
  } catch {
    res.status(500).json({ error: 'Error deleting course' });
  }
};

export const createModule = async (req: AuthRequest, res: Response) => {
  try {
    const mod = await prisma.module.create({ data: req.body });
    res.status(201).json(mod);
  } catch {
    res.status(500).json({ error: 'Error creating module' });
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
  const { userId, homeworkId, grade, analysisText } = req.body;
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
