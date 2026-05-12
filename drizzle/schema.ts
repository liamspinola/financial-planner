/**
 * Drizzle schema for Liam's Wicked Financial Planner.
 *
 * Key conventions:
 * - All monetary columns are INTEGER (pence). e.g. £12.34 → 1234
 * - All APR / rate columns are DOUBLE PRECISION (decimal ratio). e.g. 21.49% → 0.2149
 * - user_id is TEXT (Supabase UUID) and nullable in Plan 1.
 *   Plan 2 adds NOT NULL after auth is wired and existing data is backfilled.
 * - No FK from user_id to auth.users — Neon and Supabase are separate services.
 *   Isolation is enforced at the application layer (middleware + WHERE clauses).
 */

import {
  pgTable,
  serial,
  integer,
  text,
  doublePrecision,
  boolean,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Debts ─────────────────────────────────────────────────────────────────

export const debts = pgTable('debts', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  lender: text('lender'),
  debtType: text('debt_type').notNull().default('credit_card'),
  /** Fixed monthly minimum payment in pence */
  minimumPayment: integer('minimum_payment').notNull().default(0),
  /** Percentage-based minimum as decimal (e.g. 0.02 = 2%) */
  minPaymentPct: doublePrecision('min_payment_pct'),
  /** Floor for percentage minimums, in pence */
  minPaymentFloor: integer('min_payment_floor'),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`current_date::text`),
});

export const tranches = pgTable('tranches', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  debtId: integer('debt_id')
    .notNull()
    .references(() => debts.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  /** Current balance in pence */
  balance: integer('balance').notNull(),
  /** APR as decimal ratio (e.g. 0.2149 for 21.49%) */
  apr: doublePrecision('apr').notNull(),
  promoEndDate: text('promo_end_date'),
  postPromoApr: doublePrecision('post_promo_apr'),
  sortOrder: integer('sort_order').default(0),
});

// ── Income ────────────────────────────────────────────────────────────────

export const incomeSources = pgTable('income_sources', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  label: text('label').notNull(),
  /** Amount in pence */
  amount: integer('amount').notNull(),
  frequency: text('frequency').notNull().default('monthly'),
  /** Pre-calculated monthly equivalent in pence */
  monthlyEquivalent: integer('monthly_equivalent').notNull(),
});

// ── Expenses ──────────────────────────────────────────────────────────────

export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  label: text('label').notNull(),
  /** Amount in pence */
  amount: integer('amount').notNull(),
  category: text('category').notNull(),
  isEssential: boolean('is_essential').notNull().default(true),
});

// ── Plan cache ────────────────────────────────────────────────────────────

export const planCache = pgTable('plan_cache', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  inputHash: text('input_hash').notNull(),
  strategy: text('strategy').notNull(),
  calcResult: text('calc_result').notNull(),
  aiNarrative: text('ai_narrative'),
  aiBudgetTips: text('ai_budget_tips'),
  generatedAt: text('generated_at').notNull(),
  aiMode: text('ai_mode').notNull().default('C'),
});

// ── Windfalls ─────────────────────────────────────────────────────────────

export const windfalls = pgTable('windfalls', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  label: text('label').notNull(),
  /** Amount in pence */
  amount: integer('amount').notNull(),
  applyMonth: integer('apply_month').notNull(),
  createdAt: text('created_at').default(sql`current_date::text`),
});

// ── Settings ──────────────────────────────────────────────────────────────
// Note: Plan 2 adds composite unique (key, user_id) when user_id becomes NOT NULL.

export const settings = pgTable(
  'settings',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id'),
    key: text('key').notNull(),
    value: text('value').notNull(),
  },
  (table) => ({
    keyUserUnique: unique('uq_settings_key_user').on(table.key, table.userId),
  }),
);

// ── Progress snapshots ────────────────────────────────────────────────────

export const progressSnapshots = pgTable('progress_snapshots', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  snapshotMonth: text('snapshot_month').notNull(),
  recordedAt: text('recorded_at').default(sql`now()::text`),
  /** Total remaining balance in pence */
  totalBalance: integer('total_balance').notNull(),
  balancesJson: text('balances_json').notNull(),
  notes: text('notes'),
});

// ── Spending actuals ──────────────────────────────────────────────────────

export const spendingActuals = pgTable(
  'spending_actuals',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id'),
    expenseId: integer('expense_id').references(() => expenses.id, {
      onDelete: 'set null',
    }),
    category: text('category').notNull(),
    label: text('label').notNull(),
    /** Actual amount spent in pence */
    amountActual: integer('amount_actual').notNull(),
    recordMonth: text('record_month').notNull(),
  },
  (table) => ({
    monthIdx: index('idx_spending_actuals_month').on(table.recordMonth),
  }),
);

// ── Expense events ────────────────────────────────────────────────────────

export const expenseEvents = pgTable('expense_events', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  label: text('label').notNull(),
  /** Amount in pence */
  amount: integer('amount').notNull(),
  applyMonth: integer('apply_month').notNull(),
  category: text('category').notNull().default('expected'),
  createdAt: text('created_at').default(sql`current_date::text`),
});

// ── Conversations ─────────────────────────────────────────────────────────

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  title: text('title').notNull().default('New conversation'),
  useContext: boolean('use_context').notNull().default(true),
  contextSnapshot: text('context_snapshot'),
  summary: text('summary'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`now()::text`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`now()::text`),
});

// ── Messages ──────────────────────────────────────────────────────────────

export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id'),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    sequence: integer('sequence').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`now()::text`),
  },
  (table) => ({
    convSeqIdx: index('idx_messages_conv_seq').on(
      table.conversationId,
      table.sequence,
    ),
    convSeqUnique: unique('uq_messages_conv_seq').on(
      table.conversationId,
      table.sequence,
    ),
  }),
);

// ── User AI keys (new table — for BYOK Anthropic key storage) ─────────────
// Added here so Plan 3 (AI layer) can use it without a separate migration.

export const userAiKeys = pgTable('user_ai_keys', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  /** AES-256-GCM ciphertext of the API key */
  encryptedKey: text('encrypted_key').notNull(),
  /** Random 12-byte IV (hex-encoded), unique per key */
  iv: text('iv').notNull(),
  provider: text('provider').notNull().default('anthropic'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`now()::text`),
});
