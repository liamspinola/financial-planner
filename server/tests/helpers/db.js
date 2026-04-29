'use strict';

function seedDebt(db, overrides = {}) {
  const { lastInsertRowid: debtId } = db.prepare(
    `INSERT INTO debts (name, lender, debt_type, minimum_payment)
     VALUES (?, ?, ?, ?)`
  ).run(
    overrides.name || 'Test Credit Card',
    overrides.lender || null,
    overrides.debt_type || 'credit_card',
    overrides.minimum_payment ?? 50
  );

  const { lastInsertRowid: trancheId } = db.prepare(
    `INSERT INTO tranches (debt_id, label, balance, apr, sort_order)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    debtId,
    overrides.trancheLabel || 'Main Balance',
    overrides.balance ?? 1000,
    overrides.apr ?? 0.20,
    overrides.sort_order ?? 0
  );

  return { debtId, trancheId };
}

function seedIncome(db, overrides = {}) {
  const amount = overrides.amount ?? 3000;
  const frequency = overrides.frequency || 'monthly';
  const FREQ_MAP = {
    weekly: (52 / 12),
    fortnightly: (26 / 12),
    four_weekly: (13 / 12),
    monthly: 1,
    annual: (1 / 12),
  };
  const monthly_equivalent = overrides.monthly_equivalent ?? amount * (FREQ_MAP[frequency] || 1);

  const { lastInsertRowid } = db.prepare(
    `INSERT INTO income_sources (label, amount, frequency, monthly_equivalent)
     VALUES (?, ?, ?, ?)`
  ).run(
    overrides.label || 'Salary',
    amount,
    frequency,
    monthly_equivalent
  );
  return lastInsertRowid;
}

function seedExpense(db, overrides = {}) {
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO expenses (label, amount, category, is_essential)
     VALUES (?, ?, ?, ?)`
  ).run(
    overrides.label || 'Rent',
    overrides.amount ?? 800,
    overrides.category || 'housing',
    overrides.is_essential ?? 1
  );
  return lastInsertRowid;
}

function clearAll(db) {
  const tables = [
    'messages', 'conversations',
    'spending_actuals', 'progress_snapshots', 'plan_cache',
    'expense_events', 'windfalls', 'expenses', 'income_sources',
    'tranches', 'debts', 'settings',
  ];
  for (const t of tables) {
    try { db.exec(`DELETE FROM ${t}`); } catch { /* table may not exist in migration-free DBs */ }
  }
}

module.exports = { seedDebt, seedIncome, seedExpense, clearAll };
