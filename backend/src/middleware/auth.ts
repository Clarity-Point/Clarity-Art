import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { JWT_SECRET } from '../config/secrets';
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

  let decoded: SessionClaims;
  try {
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as SessionClaims;
    if (
      typeof decoded.id !== 'string' ||
      !decoded.id ||
      !Number.isInteger(decoded.sessionVersion)
    ) {
      return res.status(401).json({ error: 'Invalid session claims' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  try {
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
    // A database outage says nothing about token validity. Reporting 401 here
    // would log out every client during a temporary infrastructure failure.
    return res.status(503).json({ error: 'Не удалось проверить сессию. Повторите запрос позже.' });
  }
};

export const checkRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    // authenticateToken already loaded this role from the database for this request.
    if (roles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ error: `Access denied. Requires one of: ${roles.join(', ')}` });
    }
  };
};

export const isAdmin = checkRole(['ADMIN']);
export const isTherapist = checkRole(['THERAPIST', 'ADMIN']);
export const isOrgAdmin = checkRole(['ORG_ADMIN', 'ADMIN']);

export function requireExpectedUser(req: AuthRequest, res: Response, next: NextFunction) {
  const expected = req.get('X-Expected-User-Id');
  if (expected !== undefined && expected !== req.user?.id) {
    return res.status(409).json({
      error: 'Аккаунт изменился в другой вкладке. Скопируйте текст и обновите страницу.',
      code: 'SESSION_CHANGED',
    });
  }
  next();
}

export function requireAccountContext(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.get('X-Expected-User-Id'))
    return res.status(400).json({ error: 'Требуется идентификатор открытого аккаунта.' });
  return requireExpectedUser(req, res, next);
}

export function sendAIConsentRequired(res: Response) {
  return res.status(412).json({
    error: 'Для внешнего AI-провайдера требуется явное согласие в настройках профиля',
    code: 'AI_CONSENT_REQUIRED',
  });
}

export const requireAIConsent = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (await canUseConfiguredAI(req.user.id)) return next();
  return sendAIConsentRequired(res);
};
