import jwt from 'jsonwebtoken';
import { type Request, type Response, type NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header must use Bearer scheme' });
    return;
  }

  const token = authHeader.slice(7);
  const jwtSecret = process.env['SUPABASE_JWT_SECRET'];

  if (!jwtSecret) {
    res.status(500).json({ error: 'Server misconfiguration: JWT secret not configured' });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    if (!payload.sub) {
      res.status(401).json({ error: 'Token missing sub claim' });
      return;
    }
    req.auth = { userId: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
