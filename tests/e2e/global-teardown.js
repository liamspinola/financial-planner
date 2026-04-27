// global-teardown.js — runs once after the entire test suite
// Deletes the test.db file so it doesn't accumulate between CI runs.

import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

export default async function globalTeardown() {
  const dbPath = resolve(process.cwd(), 'test.db');
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
    console.log('[global-teardown] test.db removed.');
  }
}
