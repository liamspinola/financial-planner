/**
 * seed.js — API-level helpers that create test data via the live REST API.
 * Using the API (rather than direct DB access) validates the API layer as a side effect
 * and keeps test setup decoupled from DB internals.
 */

const BASE = 'http://localhost:3001';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`seed POST ${path} failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function put(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`seed PUT ${path} failed ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Individual seeders ───────────────────────────────────────────────────────

export function seedDebt(overrides = {}) {
  return post('/api/debts', {
    name: 'Test Credit Card',
    lender: 'Test Bank',
    debt_type: 'credit_card',
    minimum_payment: 50,
    tranches: [{ label: 'Main Balance', balance: 2000, apr: 0.20 }],
    ...overrides,
  });
}

export function seedDebtWithPromo(daysUntilExpiry) {
  const d = new Date();
  d.setDate(d.getDate() + daysUntilExpiry);
  const promoDate = d.toISOString().slice(0, 10);
  return post('/api/debts', {
    name: 'Promo Card',
    lender: 'Promo Bank',
    debt_type: 'credit_card',
    minimum_payment: 25,
    tranches: [{
      label: 'Promo Balance',
      balance: 1500,
      apr: 0.0,
      promo_end_date: promoDate,
      post_promo_apr: 0.24,
    }],
  });
}

export function seedIncome(overrides = {}) {
  return post('/api/budget/income', {
    label: 'Salary',
    amount: 3000,
    frequency: 'monthly',
    ...overrides,
  });
}

export function seedExpense(overrides = {}) {
  return post('/api/budget/expenses', {
    label: 'Groceries',
    amount: 300,
    category: 'groceries',
    is_essential: true,
    ...overrides,
  });
}

export function seedWindfall(overrides = {}) {
  return post('/api/windfalls', {
    label: 'Tax rebate',
    amount: 500,
    apply_month: 3,
    ...overrides,
  });
}

export function seedExpenseEvent(overrides = {}) {
  return post('/api/expense-events', {
    label: 'Car repair',
    amount: 400,
    apply_month: 2,
    category: 'expected',
    ...overrides,
  });
}

export function seedEmergencyFund(target = 1000, current = 500) {
  return put('/api/settings', {
    emergency_fund_target: target,
    emergency_fund_current: current,
  });
}

export async function seedActual(expenseId, category, label, amount, month) {
  return post('/api/actuals', {
    expense_id: expenseId,
    category,
    label,
    amount_actual: amount,
    record_month: month,
  });
}

export async function seedSnapshot(month, balances, notes = '') {
  return post('/api/progress', { snapshot_month: month, balances, notes });
}

// ─── Composite seeders ────────────────────────────────────────────────────────

/**
 * Seeds minimum viable state to generate a plan:
 * one debt (£2000 @ 20% APR) + one income (£3000/month).
 * Returns { debt, income }.
 */
export async function seedMinimalPlanData() {
  const { debt } = await seedDebt();
  const income = await seedIncome();
  return { debt, income };
}

/**
 * Seeds minimal plan data then generates the plan via API.
 * Returns { debt, income, plan }.
 */
export async function seedAndGeneratePlan() {
  const { debt, income } = await seedMinimalPlanData();
  const res = await fetch(`${BASE}/api/plan`, { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`generatePlan failed ${res.status}: ${text}`);
  }
  const plan = await res.json();
  return { debt, income, plan };
}
