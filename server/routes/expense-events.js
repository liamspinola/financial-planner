'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

const VALID_CATEGORIES = ['expected', 'unexpected'];

function isFinitePositive(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
function isPositiveInt(v)    { return Number.isInteger(v) && v >= 1; }

function validate({ label, amount, apply_month, category }) {
  if (!label || typeof label !== 'string' || !label.trim()) return 'label is required';
  if (!isFinitePositive(amount)) return 'amount must be a positive number';
  if (!isPositiveInt(apply_month)) return 'apply_month must be a positive integer (month offset from plan start)';
  if (!VALID_CATEGORIES.includes(category)) return `category must be one of: ${VALID_CATEGORIES.join(', ')}`;
  return null;
}

// GET /api/expense-events
router.get('/', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM expense_events ORDER BY apply_month ASC, id ASC').all());
});

// POST /api/expense-events
router.post('/', (req, res) => {
  const { label, amount, apply_month, category = 'expected' } = req.body;
  const err = validate({ label, amount, apply_month, category });
  if (err) return res.status(400).json({ error: err });

  const db = getDb();
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO expense_events (label, amount, apply_month, category) VALUES (?, ?, ?, ?)'
  ).run(label.trim(), amount, apply_month, category);

  db.prepare('DELETE FROM plan_cache').run();
  res.status(201).json(db.prepare('SELECT * FROM expense_events WHERE id = ?').get(lastInsertRowid));
});

// PUT /api/expense-events/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM expense_events WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Expense event not found' });

  const { label, amount, apply_month, category = 'expected' } = req.body;
  const err = validate({ label, amount, apply_month, category });
  if (err) return res.status(400).json({ error: err });

  db.prepare('UPDATE expense_events SET label = ?, amount = ?, apply_month = ?, category = ? WHERE id = ?')
    .run(label.trim(), amount, apply_month, category, id);
  db.prepare('DELETE FROM plan_cache').run();
  res.json(db.prepare('SELECT * FROM expense_events WHERE id = ?').get(id));
});

// DELETE /api/expense-events/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM expense_events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Expense event not found' });
  db.prepare('DELETE FROM expense_events WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM plan_cache').run();
  res.json({ ok: true });
});

module.exports = router;
