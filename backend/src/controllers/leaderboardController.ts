import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

export const getLeaderboard = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
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
      // Do not expose account UUIDs or profile names to other community members.
      id: u.id === req.user!.id ? 'self' : `rank-${index + 1}`,
      name: u.id === req.user!.id ? u.profile?.name || 'Вы' : `Участник ${index + 1}`,
      isCurrentUser: u.id === req.user!.id,
      points: u.points,
      streak: u.streak,
      level: u.profile?.avatarLevel || 1,
    }));

    res.json(formatted);
  } catch {
    res.status(500).json({ error: 'Error fetching leaderboard' });
  }
};
