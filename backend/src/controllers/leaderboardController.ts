import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

export const getLeaderboard = async (req: AuthRequest, res: Response) => {
  try {
    const topUsers = await prisma.user.findMany({
      take: 10,
      orderBy: { points: 'desc' },
      select: {
        id: true,
        points: true,
        streak: true,
        profile: {
          select: {
            name: true,
            avatarLevel: true,
          },
        },
      },
    });

    const formatted = topUsers.map((u, index) => ({
      rank: index + 1,
      id: u.id,
      name: u.profile?.name || 'Anonymous',
      points: u.points,
      streak: u.streak,
      level: u.profile?.avatarLevel || 1,
    }));

    res.json(formatted);
  } catch {
    res.status(500).json({ error: 'Error fetching leaderboard' });
  }
};
