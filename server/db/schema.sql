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
