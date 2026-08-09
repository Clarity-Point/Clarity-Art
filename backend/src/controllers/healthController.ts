import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AI_DATA_PROCESSING_MODE, AI_ENABLED } from '../config/ai';

export const getHealth = async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({
      status: 'ok',
      database: 'available',
      ai: AI_ENABLED ? 'configured' : 'fallback',
      aiProcessingMode: AI_ENABLED ? AI_DATA_PROCESSING_MODE : 'none',
      uptimeSeconds: Math.floor(process.uptime()),
    });
  } catch {
    return res.status(503).json({ status: 'degraded', database: 'unavailable' });
  }
};
