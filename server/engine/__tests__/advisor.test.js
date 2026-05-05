'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { buildContextSnapshot, buildAdvisorPrompt } = require('../advisor');

// Load real schema into an in-memory DB for each test
function makeDb() {
  const db = new Database(':memory:');
  const schema = fs.readFileSync(
    path.join(__dirname, '../../db/schema.sql'),
    'utf8'
  );
  db.exec(schema);
  return db;
}

// ---------------------------------------------------------------------------
// buildContextSnapshot
// ---------------------------------------------------------------------------
describe('buildContextSnapshot', () => {
  it('returns null when no debts exist', () => {
    const db = makeDb();
    expect(buildContextSnapshot(db)).toBeNull();
  });

  it('returns a non-empty string when debts, income, and expenses are present', () => {
    const db = makeDb();

    const { lastInsertRowid: debtId } = db.prepare(
      `INSERT INTO debts (name, lender, debt_type, minimum_payment) VALUES (?, ?, ?, ?)`
    ).run('Test Card', null, 'credit_card', 50);

    db.prepare(
      `INSERT INTO tranches (debt_id, label, balance, apr, sort_order) VALUES (?, ?, ?, ?, ?)`
    ).run(debtId, 'Main', 1000, 0.20, 0);

    db.prepare(
      `INSERT INTO income_sources (label, amount, frequency, monthly_equivalent) VALUES (?, ?, ?, ?)`
    ).run('Salary', 3000, 'monthly', 3000);

    db.prepare(
      `INSERT INTO expenses (label, amount, category, is_essential) VALUES (?, ?, ?, ?)`
    ).run('Rent', 800, 'housing', 1);

    const snapshot = buildContextSnapshot(db);
    expect(typeof snapshot).toBe('string');
    expect(snapshot.length).toBeGreaterThan(0);
    expect(snapshot).toContain('Test Card');
    expect(snapshot).toContain('1000');
    expect(snapshot).toContain('20.0%');
  });

  it('includes monthly take-home and surplus in the snapshot', () => {
    const db = makeDb();

    const { lastInsertRowid: debtId } = db.prepare(
      `INSERT INTO debts (name, lender, debt_type, minimum_payment) VALUES (?, ?, ?, ?)`
    ).run('Card', null, 'credit_card', 100);

    db.prepare(
      `INSERT INTO tranches (debt_id, label, balance, apr, sort_order) VALUES (?, ?, ?, ?, ?)`
    ).run(debtId, 'Main', 500, 0.15, 0);

    db.prepare(
      `INSERT INTO income_sources (label, amount, frequency, monthly_equivalent) VALUES (?, ?, ?, ?)`
    ).run('Salary', 2000, 'monthly', 2000);

    db.prepare(
      `INSERT INTO expenses (label, amount, category, is_essential) VALUES (?, ?, ?, ?)`
    ).run('Rent', 600, 'housing', 1);

    const snapshot = buildContextSnapshot(db);
    // take-home £2000
    expect(snapshot).toContain('£2000');
    // surplus = 2000 - 600 - 100 = 1300
    expect(snapshot).toContain('£1300');
  });
});

// ---------------------------------------------------------------------------
// buildAdvisorPrompt
// ---------------------------------------------------------------------------
describe('buildAdvisorPrompt', () => {
  const baseConv = {
    use_context: 0,
    context_snapshot: null,
    summary: null,
  };

  it('returns a valid non-empty string with no messages', () => {
    const prompt = buildAdvisorPrompt(baseConv, []);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Respond as the adviser:');
  });

  it('includes context snapshot when use_context=1 and snapshot is set', () => {
    const conv = {
      use_context: 1,
      context_snapshot: 'FINANCIAL SNAPSHOT: income £2000',
      summary: null,
    };
    const prompt = buildAdvisorPrompt(conv, []);
    expect(prompt).toContain('FINANCIAL SNAPSHOT: income £2000');
  });

  it('excludes context snapshot when use_context=0 even if snapshot is set', () => {
    const conv = {
      use_context: 0,
      context_snapshot: 'FINANCIAL SNAPSHOT: income £2000',
      summary: null,
    };
    const prompt = buildAdvisorPrompt(conv, []);
    expect(prompt).not.toContain('FINANCIAL SNAPSHOT');
  });

  it('includes rolling summary when present', () => {
    const conv = {
      use_context: 0,
      context_snapshot: null,
      summary: 'User is focused on paying off their credit card.',
    };
    const prompt = buildAdvisorPrompt(conv, []);
    expect(prompt).toContain('User is focused on paying off their credit card.');
  });

  it('includes message history formatted as User/Assistant turns', () => {
    const messages = [
      { role: 'user',      content: 'How do I start?' },
      { role: 'assistant', content: 'Begin with the highest APR.' },
    ];
    const prompt = buildAdvisorPrompt(baseConv, messages);
    expect(prompt).toContain('User: How do I start?');
    expect(prompt).toContain('Assistant: Begin with the highest APR.');
  });

  it('does not crash with empty messages array', () => {
    expect(() => buildAdvisorPrompt(baseConv, [])).not.toThrow();
  });
});
