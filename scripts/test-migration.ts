/**
 * Migration harness: SQLite → Neon PostgreSQL
 *
 * Run with: npm run test:migration
 *
 * Requires environment variables:
 *   DATABASE_URL  — Neon pooled connection string
 *   SQLITE_PATH   — path to finance.db (defaults to ./finance.db)
 *
 * What this does:
 * 1. Opens SQLite (read-only)
 * 2. Reads all rows from all tables
 * 3. Converts monetary values (SQLite REAL pounds → Neon INTEGER pence)
 * 4. Inserts into Neon (wiping existing data first for idempotency)
 * 5. Verifies row counts match across all tables
 * 6. Spot-checks: verifies total balance sum matches between sources
 *
 * Re-running is safe: it truncates Neon tables before inserting.
 */

import Database from 'better-sqlite3';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql as sqlHelper } from 'drizzle-orm';
import * as schema from '../drizzle/schema';
import { toPence } from '../shared/utils/money';
import path from 'path';

// ── Setup ─────────────────────────────────────────────────────────────────

const SQLITE_PATH = process.env['SQLITE_PATH'] ?? path.join(__dirname, '../finance.db');
const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const httpSql = neon(DATABASE_URL);
const db = drizzle(httpSql, { schema });

// ── Helpers ───────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[migration] ${msg}`);
}

function pass(msg: string): void {
  console.log(`  ✓ ${msg}`);
}

function fail(msg: string): never {
  console.error(`  ✗ FAIL: ${msg}`);
  process.exit(1);
}

async function assertCount(
  tableName: string,
  sqliteCount: number,
  neonCount: number,
): Promise<void> {
  if (neonCount !== sqliteCount) {
    fail(`${tableName}: SQLite has ${sqliteCount} rows, Neon has ${neonCount}`);
  }
  pass(`${tableName}: ${neonCount} rows match`);
}

// ── Truncate Neon tables (for idempotent re-runs) ─────────────────────────

async function truncateAll(): Promise<void> {
  log('Truncating Neon tables (order matters for FK constraints)...');
  // Messages first (FK → conversations), conversations second, etc.
  await db.delete(schema.messages);
  await db.delete(schema.conversations);
  await db.delete(schema.spendingActuals);
  await db.delete(schema.progressSnapshots);
  await db.delete(schema.planCache);
  await db.delete(schema.expenseEvents);
  await db.delete(schema.windfalls);
  await db.delete(schema.expenses);
  await db.delete(schema.incomeSources);
  await db.delete(schema.tranches);
  await db.delete(schema.debts);
  await db.delete(schema.settings);
  await db.delete(schema.userAiKeys);
  log('Neon tables cleared.');
}

// ── Migrate each table ────────────────────────────────────────────────────

async function migrateDebts(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM debts').all() as Record<string, unknown>[];
  if (rows.length === 0) { pass('debts: 0 rows (empty)'); return; }

  await db.insert(schema.debts).values(
    rows.map((r) => ({
      name: r['name'] as string,
      lender: (r['lender'] as string | null) ?? null,
      debtType: r['debt_type'] as string,
      minimumPayment: toPence((r['minimum_payment'] as number) ?? 0),
      minPaymentPct: (r['min_payment_pct'] as number | null) ?? null,
      minPaymentFloor: r['min_payment_floor'] != null ? toPence(r['min_payment_floor'] as number) : null,
      notes: (r['notes'] as string | null) ?? null,
      createdAt: (r['created_at'] as string | null) ?? null,
    })),
  );

  const neonRows = await db.select().from(schema.debts);
  await assertCount('debts', rows.length, neonRows.length);
}

async function migrateTranches(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM tranches').all() as Record<string, unknown>[];
  if (rows.length === 0) { pass('tranches: 0 rows (empty)'); return; }

  // Map old SQLite IDs to new Neon IDs by matching debt names
  const sqliteDebts = sqlite.prepare('SELECT id, name FROM debts').all() as Record<string, unknown>[];
  const neonDebts = await db.select({ id: schema.debts.id, name: schema.debts.name }).from(schema.debts);
  const debtIdMap = new Map<number, number>();
  for (const sd of sqliteDebts) {
    const nd = neonDebts.find((d) => d.name === sd['name']);
    if (nd) debtIdMap.set(sd['id'] as number, nd.id);
  }

  await db.insert(schema.tranches).values(
    rows.map((r) => ({
      debtId: debtIdMap.get(r['debt_id'] as number) ?? (r['debt_id'] as number),
      label: r['label'] as string,
      balance: toPence(r['balance'] as number),
      apr: r['apr'] as number,
      promoEndDate: (r['promo_end_date'] as string | null) ?? null,
      postPromoApr: (r['post_promo_apr'] as number | null) ?? null,
      sortOrder: (r['sort_order'] as number | null) ?? 0,
    })),
  );

  const neonRows = await db.select().from(schema.tranches);
  await assertCount('tranches', rows.length, neonRows.length);
}

async function migrateIncomeSources(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM income_sources').all() as Record<string, unknown>[];
  if (rows.length === 0) { pass('income_sources: 0 rows (empty)'); return; }

  await db.insert(schema.incomeSources).values(
    rows.map((r) => ({
      label: r['label'] as string,
      amount: toPence(r['amount'] as number),
      frequency: r['frequency'] as string,
      monthlyEquivalent: toPence(r['monthly_equivalent'] as number),
    })),
  );

  const neonRows = await db.select().from(schema.incomeSources);
  await assertCount('income_sources', rows.length, neonRows.length);
}

async function migrateExpenses(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM expenses').all() as Record<string, unknown>[];
  if (rows.length === 0) { pass('expenses: 0 rows (empty)'); return; }

  await db.insert(schema.expenses).values(
    rows.map((r) => ({
      label: r['label'] as string,
      amount: toPence(r['amount'] as number),
      category: r['category'] as string,
      isEssential: r['is_essential'] === 1,
    })),
  );

  const neonRows = await db.select().from(schema.expenses);
  await assertCount('expenses', rows.length, neonRows.length);
}

async function migrateWindfalls(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM windfalls').all() as Record<string, unknown>[];
  if (rows.length === 0) { pass('windfalls: 0 rows (empty)'); return; }

  await db.insert(schema.windfalls).values(
    rows.map((r) => ({
      label: r['label'] as string,
      amount: toPence(r['amount'] as number),
      applyMonth: r['apply_month'] as number,
      createdAt: (r['created_at'] as string | null) ?? null,
    })),
  );

  const neonRows = await db.select().from(schema.windfalls);
  await assertCount('windfalls', rows.length, neonRows.length);
}

async function migrateSettings(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM settings').all() as Record<string, unknown>[];
  if (rows.length === 0) { pass('settings: 0 rows (empty)'); return; }

  await db.insert(schema.settings).values(
    rows.map((r) => ({
      key: r['key'] as string,
      value: r['value'] as string,
    })),
  );

  const neonRows = await db.select().from(schema.settings);
  await assertCount('settings', rows.length, neonRows.length);
}

async function migrateExpenseEvents(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM expense_events').all() as Record<string, unknown>[];
  if (rows.length === 0) { pass('expense_events: 0 rows (empty)'); return; }

  await db.insert(schema.expenseEvents).values(
    rows.map((r) => ({
      label: r['label'] as string,
      amount: toPence(r['amount'] as number),
      applyMonth: r['apply_month'] as number,
      category: (r['category'] as string | null) ?? 'expected',
      createdAt: (r['created_at'] as string | null) ?? null,
    })),
  );

  const neonRows = await db.select().from(schema.expenseEvents);
  await assertCount('expense_events', rows.length, neonRows.length);
}

async function migrateProgressSnapshots(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM progress_snapshots').all() as Record<string, unknown>[];
  if (rows.length === 0) { pass('progress_snapshots: 0 rows (empty)'); return; }

  await db.insert(schema.progressSnapshots).values(
    rows.map((r) => ({
      snapshotMonth: r['snapshot_month'] as string,
      recordedAt: (r['recorded_at'] as string | null) ?? null,
      totalBalance: toPence(r['total_balance'] as number),
      balancesJson: r['balances_json'] as string,
      notes: (r['notes'] as string | null) ?? null,
    })),
  );

  const neonRows = await db.select().from(schema.progressSnapshots);
  await assertCount('progress_snapshots', rows.length, neonRows.length);
}

async function migrateConversations(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM conversations').all() as Record<string, unknown>[];
  if (rows.length === 0) { pass('conversations: 0 rows (empty)'); return; }

  await db.insert(schema.conversations).values(
    rows.map((r) => ({
      title: r['title'] as string,
      useContext: r['use_context'] === 1,
      contextSnapshot: (r['context_snapshot'] as string | null) ?? null,
      summary: (r['summary'] as string | null) ?? null,
      deletedAt: (r['deleted_at'] as string | null) ?? null,
      createdAt: r['created_at'] as string,
      updatedAt: r['updated_at'] as string,
    })),
  );

  const neonRows = await db.select().from(schema.conversations);
  await assertCount('conversations', rows.length, neonRows.length);
}

async function migrateMessages(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM messages').all() as Record<string, unknown>[];
  if (rows.length === 0) { pass('messages: 0 rows (empty)'); return; }

  const sqliteConvs = sqlite.prepare('SELECT id FROM conversations').all() as Record<string, unknown>[];
  const neonConvs = await db.select({ id: schema.conversations.id }).from(schema.conversations);
  // Map by position (conversations migrated in order)
  const convIdMap = new Map<number, number>();
  sqliteConvs.forEach((sc, i) => {
    const nc = neonConvs[i];
    if (nc) convIdMap.set(sc['id'] as number, nc.id);
  });

  await db.insert(schema.messages).values(
    rows.map((r) => ({
      conversationId: convIdMap.get(r['conversation_id'] as number) ?? (r['conversation_id'] as number),
      role: r['role'] as 'user' | 'assistant',
      content: r['content'] as string,
      sequence: r['sequence'] as number,
      createdAt: r['created_at'] as string,
    })),
  );

  const neonRows = await db.select().from(schema.messages);
  await assertCount('messages', rows.length, neonRows.length);
}

// ── Spot checks ───────────────────────────────────────────────────────────

async function spotCheckBalances(): Promise<void> {
  log('Running spot check: total debt balance...');

  const sqliteResult = sqlite
    .prepare('SELECT COALESCE(SUM(balance), 0) as total FROM tranches')
    .get() as { total: number };
  const sqliteTotal = sqliteResult.total;

  const neonResult = await db
    .select({ total: sqlHelper`COALESCE(SUM(${schema.tranches.balance}), 0)` })
    .from(schema.tranches);

  const neonTotalPence = Number((neonResult[0] as { total: unknown }).total);
  const sqliteTotalPence = toPence(sqliteTotal);

  if (Math.abs(neonTotalPence - sqliteTotalPence) > 1) {
    // Allow 1 pence rounding tolerance
    fail(
      `Balance mismatch: SQLite total ${sqliteTotal} (→ ${sqliteTotalPence}p), ` +
      `Neon total ${neonTotalPence}p`,
    );
  }
  pass(`Total balance matches: ${neonTotalPence}p (±1p rounding tolerance)`);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log('Starting SQLite → Neon migration harness...');
  log(`SQLite source: ${SQLITE_PATH}`);

  await truncateAll();

  log('Migrating tables...');
  await migrateDebts();
  await migrateTranches();
  await migrateIncomeSources();
  await migrateExpenses();
  await migrateWindfalls();
  await migrateSettings();
  await migrateExpenseEvents();
  await migrateProgressSnapshots();
  await migrateConversations();
  await migrateMessages();

  await spotCheckBalances();

  log('');
  log('✅ Migration harness complete. All row counts match.');
  log('');
  log('IMPORTANT: This migrated your data to Neon with user_id = NULL.');
  log('In Plan 2 (Auth), after registering with Supabase, run:');
  log('  UPDATE <table> SET user_id = \'<your-uuid>\' WHERE user_id IS NULL');
  log('for each table to claim your existing data.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
