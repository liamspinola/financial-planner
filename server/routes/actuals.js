'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

function isFiniteNonNeg(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }

// GET /api/actuals?month=YYYY-MM
router.get('/', (req, res) => {
  const { month } = req.query;
  const db = getDb();
  if (month) {
    res.json(db.prepare('SELECT * FROM spending_actuals WHERE record_month = ? ORDER BY category ASC, id ASC').all(month));
  } else {
    res.json(db.prepare('SELECT * FROM spending_actuals ORDER BY record_month DESC, category ASC').all());
  }
});

// GET /api/actuals/summary?month=YYYY-MM
router.get('/summary', (req, res) => {
  const { month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return res.status(400).json({ error: 'month param must be YYYY-MM' });

  const db = getDb();
  // Aggregate actuals by category for the month
  const actuals = db.prepare(`
    SELECT category, SUM(amount_actual) AS actual
    FROM spending_actuals
    WHERE record_month = ?
    GROUP BY category
  `).all(month);

  // Budgeted by category
  const budgeted = db.prepare(`
    SELECT category, SUM(amount) AS budgeted
    FROM expenses
    GROUP BY category
  `).all();

  // Merge: include all categories from either set
  const map = {};
  for (const b of budgeted) map[b.category] = { category: b.category, budgeted: b.budgeted, actual: 0 };
  for (const a of actuals) {
    if (map[a.category]) map[a.category].actual = a.actual;
    else map[a.category] = { category: a.category, budgeted: 0, actual: a.actual };
  }

  const rows = Object.values(map)
    .map(r => ({ ...r, delta: r.actual - r.budgeted }))
    .sort((a, b) => a.category.localeCompare(b.category));

  res.json(rows);
});

// POST /api/actuals
router.post('/', (req, res) => {
  const { expense_id, category, label, amount_actual, record_month } = req.body;
  if (!category || typeof category !== 'string') return res.status(400).json({ error: 'category is required' });
  if (!label || typeof label !== 'string') return res.status(400).json({ error: 'label is required' });
  if (!isFiniteNonNeg(amount_actual)) return res.status(400).json({ error: 'amount_actual must be a non-negative number' });
  if (!record_month || !/^\d{4}-\d{2}$/.test(record_month)) return res.status(400).json({ error: 'record_month must be YYYY-MM' });

  const db = getDb();
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO spending_actuals (expense_id, category, label, amount_actual, record_month) VALUES (?, ?, ?, ?, ?)'
  ).run(expense_id || null, category, label, amount_actual, record_month);

  res.status(201).json(db.prepare('SELECT * FROM spending_actuals WHERE id = ?').get(lastInsertRowid));
});

// PUT /api/actuals/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM spending_actuals WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Actual not found' });

  const { amount_actual } = req.body;
  if (!isFiniteNonNeg(amount_actual)) return res.status(400).json({ error: 'amount_actual must be a non-negative number' });

  db.prepare('UPDATE spending_actuals SET amount_actual = ? WHERE id = ?').run(amount_actual, id);
  res.json(db.prepare('SELECT * FROM spending_actuals WHERE id = ?').get(id));
});

// DELETE /api/actuals/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM spending_actuals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Actual not found' });
  db.prepare('DELETE FROM spending_actuals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
