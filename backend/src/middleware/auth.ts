import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { JWT_SECRET } from '../config/secrets';
import { AI_REQUIRES_CONSENT } from '../config/ai';
import { canUseConfiguredAI } from '../services/aiConsentService';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    sessionVersion: number;
  };
}

type SessionClaims = NonNullable<AuthRequest['user']>;

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const cookieToken = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('ty_session='))
    ?.slice('ty_session='.length);
  const token = cookieToken || bearerToken;

  if (!token) return res.status(401).json({ error: 'No session provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SessionClaims;
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, sessionVersion: true },
    });
    if (!currentUser || decoded.sessionVersion !== currentUser.sessionVersion) {
      return res.status(401).json({ error: 'Invalidated session' });
    }
    req.user = currentUser;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
};

export const checkRole = (roles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user && roles.includes(user.role)) {
      next();
    } else {
      res.status(403).json({ error: `Access denied. Requires one of: ${roles.join(', ')}` });
    }
  };
};

export const isAdmin = checkRole(['ADMIN']);
export const isTherapist = checkRole(['THERAPIST', 'ADMIN']);
export const isOrgAdmin = checkRole(['ORG_ADMIN', 'ADMIN']);
export const isMentor = checkRole(['MENTOR', 'ADMIN']);

export const requireAIConsent = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!AI_REQUIRES_CONSENT || (await canUseConfiguredAI(req.user.id))) return next();
  return res.status(412).json({
    error: 'Для внешнего AI-провайдера требуется явное согласие в настройках профиля',
    code: 'AI_CONSENT_REQUIRED',
  });
};
