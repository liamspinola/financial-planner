'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { toMonthly } = require('../engine/calculator');

const VALID_FREQUENCIES = ['weekly', 'fortnightly', 'four_weekly', 'monthly', 'annual'];
function isFiniteNonNegative(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }

// GET /api/budget — all income sources and expenses
router.get('/', (req, res) => {
  const db = getDb();
  const income = db.prepare('SELECT * FROM income_sources ORDER BY id ASC').all();
  const expenses = db.prepare('SELECT * FROM expenses ORDER BY category ASC, id ASC').all();
  res.json({ income, expenses });
});

// POST /api/budget/income
router.post('/income', (req, res) => {
  const { label, amount, frequency } = req.body;
  if (!label || typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label is required' });
  if (!isFiniteNonNegative(amount)) return res.status(400).json({ error: 'amount must be a non-negative number' });
  const freq = frequency || 'monthly';
  if (!VALID_FREQUENCIES.includes(freq)) return res.status(400).json({ error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}` });
  const monthly_equivalent = toMonthly(amount, freq);
  const db = getDb();
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO income_sources (label, amount, frequency, monthly_equivalent) VALUES (?, ?, ?, ?)'
  ).run(label, amount, freq, monthly_equivalent);
  db.prepare('DELETE FROM plan_cache').run();
  res.status(201).json(db.prepare('SELECT * FROM income_sources WHERE id = ?').get(lastInsertRowid));
});

// PUT /api/budget/income/:id
router.put('/income/:id', (req, res) => {
  const { label, amount, frequency } = req.body;
  if (!label || typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label is required' });
  if (!isFiniteNonNegative(amount)) return res.status(400).json({ error: 'amount must be a non-negative number' });
  const freq = frequency || 'monthly';
  if (!VALID_FREQUENCIES.includes(freq)) return res.status(400).json({ error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}` });
  const monthly_equivalent = toMonthly(amount, freq);
  const db = getDb();
  const existing = db.prepare('SELECT id FROM income_sources WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    'UPDATE income_sources SET label = ?, amount = ?, frequency = ?, monthly_equivalent = ? WHERE id = ?'
  ).run(label, amount, freq, monthly_equivalent, req.params.id);
  db.prepare('DELETE FROM plan_cache').run();
  res.json(db.prepare('SELECT * FROM income_sources WHERE id = ?').get(req.params.id));
});

// DELETE /api/budget/income/:id
router.delete('/income/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM income_sources WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM income_sources WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM plan_cache').run();
  res.json({ ok: true });
});

// POST /api/budget/expenses
router.post('/expenses', (req, res) => {
  const { label, amount, category, is_essential } = req.body;
  if (!label || typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label is required' });
  if (!isFiniteNonNegative(amount)) return res.status(400).json({ error: 'amount must be a non-negative number' });
  if (!category || typeof category !== 'string') return res.status(400).json({ error: 'category is required' });
  const db = getDb();
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO expenses (label, amount, category, is_essential) VALUES (?, ?, ?, ?)'
  ).run(label, amount, category, is_essential ? 1 : 0);
  db.prepare('DELETE FROM plan_cache').run();
  res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(lastInsertRowid));
});

// PUT /api/budget/expenses/:id
router.put('/expenses/:id', (req, res) => {
  const { label, amount, category, is_essential } = req.body;
  if (!label || typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label is required' });
  if (!isFiniteNonNegative(amount)) return res.status(400).json({ error: 'amount must be a non-negative number' });
  if (!category || typeof category !== 'string') return res.status(400).json({ error: 'category is required' });
  const db = getDb();
  const existing = db.prepare('SELECT id FROM expenses WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    'UPDATE expenses SET label = ?, amount = ?, category = ?, is_essential = ? WHERE id = ?'
  ).run(label, amount, category, is_essential ? 1 : 0, req.params.id);
  db.prepare('DELETE FROM plan_cache').run();
  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id));
});

// DELETE /api/budget/expenses/:id
router.delete('/expenses/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM expenses WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM plan_cache').run();
  res.json({ ok: true });
});

module.exports = router;
