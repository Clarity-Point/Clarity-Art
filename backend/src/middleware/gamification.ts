import { Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from './auth';
import { createLogger } from '../config/logger';

const log = createLogger('gamification');

export const rewardPoints = async (userId: string, points: number, _reason?: string) => {
  await prisma.user.update({
    where: { id: userId },
    data: { points: { increment: points } },
  });
  // In a real app, we might log the reason to a PointHistory table
  await checkAchievements(userId);
};

export const checkAchievements = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      achievements: true,
      diaryEntries: true,
      courseProgress: true,
      imageAnalyses: true,
      chatSessions: true,
      submissions: true,
    },
  });

  if (!user) return;

  const allAchievements = await prisma.achievement.findMany();

  for (const ach of allAchievements) {
    if (user.achievements.some((ua) => ua.achievementId === ach.id)) continue;

    const [type, value] = ach.criteria.split(':');
    const targetValue = parseInt(value);
    let achieved = false;

    switch (type) {
      case 'DIARY_COUNT':
        if (user.diaryEntries.length >= targetValue) achieved = true;
        break;
      case 'COURSE_COMPLETED': {
        const completed = user.courseProgress.filter((cp) => cp.progress === 100).length;
        if (completed >= targetValue) achieved = true;
        break;
      }
      case 'STREAK':
        if (user.streak >= targetValue) achieved = true;
        break;
      case 'IMAGE_ANALYSIS_COUNT':
        if (user.imageAnalyses.length >= targetValue) achieved = true;
        break;
      case 'CHAT_COUNT':
        if (user.chatSessions.length >= targetValue) achieved = true;
        break;
      case 'HOMEWORK_COUNT':
        if (user.submissions.length >= targetValue) achieved = true;
        break;
    }

    if (achieved) {
      await prisma.userAchievement.create({
        data: { userId, achievementId: ach.id },
      });
      // Reward points for achievement
      await prisma.user.update({
        where: { id: userId },
        data: { points: { increment: 100 } },
      });
    }
  }

  // Update Avatar Level based on points - More granular
  // Level 1: 0, Level 2: 100, Level 3: 300, Level 4: 600, Level 5: 1000, Level 6: 1500
  let newLevel = 1;
  if (user.points >= 1500) newLevel = 6;
  else if (user.points >= 1000) newLevel = 5;
  else if (user.points >= 600) newLevel = 4;
  else if (user.points >= 300) newLevel = 3;
  else if (user.points >= 100) newLevel = 2;

  await prisma.profile.update({
    where: { userId: user.id },
    data: { avatarLevel: newLevel },
  });
};

export const updateStreak = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return next();

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return next();

    const now = new Date();
    const lastActivity = new Date(user.lastActivity);

    // Check if it's a new day
    const isNewDay = now.toDateString() !== lastActivity.toDateString();

    if (isNewDay) {
      const diffTime = Math.abs(now.getTime() - lastActivity.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Increment streak
        await prisma.user.update({
          where: { id: user.id },
          data: {
            streak: { increment: 1 },
            lastActivity: now,
            points: { increment: 20 }, // Increased from 10
          },
        });
      } else if (diffDays > 1) {
        // Reset streak
        await prisma.user.update({
          where: { id: user.id },
          data: {
            streak: 1,
            lastActivity: now,
            points: { increment: 20 },
          },
        });
      }
    } else {
      // Just update lastActivity time if it's the same day
      await prisma.user.update({
        where: { id: user.id },
        data: { lastActivity: now },
      });
    }

    // Call check achievements at the end of every activity
    await checkAchievements(user.id);

    next();
  } catch (error) {
    log.error({ err: error }, 'Streak update error');
    next();
  }
};
