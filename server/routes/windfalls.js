'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

function isFinitePositive(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
function isPositiveInt(v)    { return Number.isInteger(v) && v >= 1; }

function validate({ label, amount, apply_month }) {
  if (!label || typeof label !== 'string' || !label.trim()) return 'label is required';
  if (!isFinitePositive(amount)) return 'amount must be a positive number';
  if (!isPositiveInt(apply_month)) return 'apply_month must be a positive integer (month offset from plan start)';
  return null;
}

// GET /api/windfalls
router.get('/', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM windfalls ORDER BY apply_month ASC, id ASC').all());
});

// POST /api/windfalls
router.post('/', (req, res) => {
  const { label, amount, apply_month } = req.body;
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });

  const db = getDb();
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO windfalls (label, amount, apply_month) VALUES (?, ?, ?)'
  ).run(label.trim(), amount, apply_month);

  db.prepare('DELETE FROM plan_cache').run();
  res.status(201).json(db.prepare('SELECT * FROM windfalls WHERE id = ?').get(lastInsertRowid));
});

// PUT /api/windfalls/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM windfalls WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Windfall not found' });

  const { label, amount, apply_month } = req.body;
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });

  db.prepare('UPDATE windfalls SET label = ?, amount = ?, apply_month = ? WHERE id = ?')
    .run(label.trim(), amount, apply_month, id);
  db.prepare('DELETE FROM plan_cache').run();
  res.json(db.prepare('SELECT * FROM windfalls WHERE id = ?').get(id));
});

// DELETE /api/windfalls/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM windfalls WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Windfall not found' });
  db.prepare('DELETE FROM windfalls WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM plan_cache').run();
  res.json({ ok: true });
});

module.exports = router;
