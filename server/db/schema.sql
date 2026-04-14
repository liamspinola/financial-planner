CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  lender TEXT,
  debt_type TEXT NOT NULL DEFAULT 'credit_card',
  minimum_payment REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS tranches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  balance REAL NOT NULL,
  apr REAL NOT NULL,
  promo_end_date TEXT,
  post_promo_apr REAL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS income_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  monthly_equivalent REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  is_essential INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS plan_cache (
  id INTEGER PRIMARY KEY,
  input_hash TEXT NOT NULL,
  strategy TEXT NOT NULL,
  calc_result TEXT NOT NULL,
  ai_narrative TEXT,
  ai_budget_tips TEXT,
  generated_at TEXT NOT NULL,
  ai_mode TEXT NOT NULL DEFAULT 'C'
);

CREATE TABLE IF NOT EXISTS windfalls (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  label       TEXT NOT NULL,
  amount      REAL NOT NULL,
  apply_month INTEGER NOT NULL,
  created_at  TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS progress_snapshots (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_month TEXT NOT NULL UNIQUE,
  recorded_at    TEXT DEFAULT (datetime('now')),
  total_balance  REAL NOT NULL,
  balances_json  TEXT NOT NULL,
  notes          TEXT
);

CREATE TABLE IF NOT EXISTS spending_actuals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id    INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
  category      TEXT NOT NULL,
  label         TEXT NOT NULL,
  amount_actual REAL NOT NULL,
  record_month  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spending_actuals_month ON spending_actuals(record_month);

CREATE TABLE IF NOT EXISTS conversations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL DEFAULT 'New conversation',
  use_context      INTEGER NOT NULL DEFAULT 1 CHECK (use_context IN (0, 1)),
  context_snapshot TEXT,
  summary          TEXT,
  deleted_at       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_active
  ON conversations (updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  INTEGER NOT NULL
                   REFERENCES conversations (id) ON DELETE CASCADE,
  role             TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT    NOT NULL,
  sequence         INTEGER NOT NULL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (conversation_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_seq
  ON messages (conversation_id, sequence);
