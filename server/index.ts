import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import debtsRouter         from './routes/debts';
import budgetRouter        from './routes/budget';
import planRouter          from './routes/plan';
import aiRouter            from './routes/ai';
import windfallsRouter     from './routes/windfalls';
import expenseEventsRouter from './routes/expense-events';
import settingsRouter      from './routes/settings';
import progressRouter      from './routes/progress';
import actualsRouter       from './routes/actuals';
import advisorRouter       from './routes/advisor';
import usersRouter         from './routes/users';
import aiKeysRouter        from './routes/ai-keys';
import { generalLimiter, aiLimiter } from './middleware/rateLimit';

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env['PORT'] ?? 3001);

app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigin = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:3000';
if (!allowedOrigin && process.env['NODE_ENV'] === 'production') {
  throw new Error('CLIENT_ORIGIN must be set in production');
}
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));

app.use('/api/v1/', generalLimiter);

app.use('/api/v1/debts',          debtsRouter);
app.use('/api/v1/budget',         budgetRouter);
app.use('/api/v1/plan',           planRouter);
app.use('/api/v1/ai',             aiLimiter, aiRouter);
app.use('/api/v1/windfalls',      windfallsRouter);
app.use('/api/v1/expense-events', expenseEventsRouter);
app.use('/api/v1/settings',       settingsRouter);
app.use('/api/v1/progress',       progressRouter);
app.use('/api/v1/actuals',        actualsRouter);
app.use('/api/v1/advisor',        aiLimiter, advisorRouter);
app.use('/api/v1/users',          usersRouter);
app.use('/api/v1/ai-keys',        aiKeysRouter);

app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  const status = (err as any).status ?? 500;
  res.status(status).json({ error: err.message ?? 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Financial Planner API running on http://localhost:${PORT}`);
});

export default app;
