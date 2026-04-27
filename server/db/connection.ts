import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../drizzle/schema';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = neon(databaseUrl);

/**
 * Drizzle database instance connected to Neon via HTTP.
 * HTTP transport is used because:
 * - Vercel serverless functions are stateless (no persistent connections)
 * - Neon HTTP driver handles connection pooling automatically
 */
export const db = drizzle(sql, { schema });
