import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { JWT_SECRET } from '../config/secrets';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const cookieToken = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('ty_session='))
    ?.slice('ty_session='.length);
  const token = cookieToken || bearerToken;

  if (!token) return res.status(401).json({ error: 'No session provided' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = decoded as AuthRequest['user'];
    next();
  });
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
