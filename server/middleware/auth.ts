import jwt from 'jsonwebtoken';
import { type Request, type Response, type NextFunction } from 'express';

const jwtSecret = process.env['SUPABASE_JWT_SECRET'];

if (!jwtSecret) {
  throw new Error('SUPABASE_JWT_SECRET environment variable is required');
}

const secret: string = jwtSecret;

// Extend Express Request to carry auth context after requireAuth runs
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

  try {
    const raw = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof raw === 'string' || typeof raw['sub'] !== 'string' || !raw['sub']) {
      res.status(401).json({ error: 'Invalid token: missing sub claim' });
      return;
    }
    req.auth = { userId: raw['sub'] };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
