const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'finance.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Each entry is tried once and silently ignored if it fails (e.g. column already exists).
const MIGRATIONS = [
  // Feature 3: debt notes
  'ALTER TABLE debts ADD COLUMN notes TEXT',
  // Feature 2: percentage-based minimum payments
  'ALTER TABLE debts ADD COLUMN min_payment_pct   REAL',
  'ALTER TABLE debts ADD COLUMN min_payment_floor REAL',
  // Expense events (money hits)
  `CREATE TABLE IF NOT EXISTS expense_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    label       TEXT    NOT NULL,
    amount      REAL    NOT NULL,
    apply_month INTEGER NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'expected',
    created_at  TEXT    DEFAULT (date('now'))
  )`,
];

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
    for (const sql of MIGRATIONS) {
      try { db.exec(sql); } catch { /* column already exists — safe to ignore */ }
    }
  }
  return db;
}

module.exports = { getDb };
