import { Request, Response, NextFunction } from 'express';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

/** CORS controls reading responses, so validate browser mutation origins separately. */
export function requestOrigin(req: Request, res: Response, next: NextFunction) {
  if (safeMethods.has(req.method)) return next();
  const origin = req.get('Origin');
  const allowedOrigin = new URL(process.env.FRONTEND_URL || 'http://localhost:5173').origin;
  // Browser fetches include Origin on mutations. Reject foreign and opaque
  // origins even before authentication (login/logout CSRF). Non-browser clients
  // without Origin remain supported; cross-site Fetch Metadata is rejected too.
  if (
    (origin && origin !== allowedOrigin) ||
    (!origin && req.get('Sec-Fetch-Site') === 'cross-site')
  ) {
    return res.status(403).json({ error: 'Источник запроса не разрешён' });
  }
  next();
}
