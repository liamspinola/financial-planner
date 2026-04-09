'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/debts — all debts with their tranches
router.get('/', (req, res) => {
  const db = getDb();
  const debts = db.prepare('SELECT * FROM debts ORDER BY created_at ASC').all();
  const tranches = db.prepare('SELECT * FROM tranches ORDER BY sort_order ASC, id ASC').all();
  res.json({ debts, tranches });
});

// POST /api/debts — create a debt with its tranches
router.post('/', (req, res) => {
  const { name, lender, debt_type, minimum_payment, tranches = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const db = getDb();
  const insertDebt = db.prepare(
    'INSERT INTO debts (name, lender, debt_type, minimum_payment) VALUES (?, ?, ?, ?)'
  );
  const insertTranche = db.prepare(
    'INSERT INTO tranches (debt_id, label, balance, apr, promo_end_date, post_promo_apr, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const result = db.transaction(() => {
    const { lastInsertRowid } = insertDebt.run(name, lender || null, debt_type || 'credit_card', minimum_payment || 0);
    for (let i = 0; i < tranches.length; i++) {
      const t = tranches[i];
      insertTranche.run(lastInsertRowid, t.label, t.balance, t.apr, t.promo_end_date || null, t.post_promo_apr || null, i);
    }
    return lastInsertRowid;
  })();

  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(result);
  const debtTranches = db.prepare('SELECT * FROM tranches WHERE debt_id = ? ORDER BY sort_order').all(result);
  res.status(201).json({ debt, tranches: debtTranches });
});

// PUT /api/debts/:id — update a debt and replace all its tranches
router.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { name, lender, debt_type, minimum_payment, tranches = [] } = req.body;

  const existing = db.prepare('SELECT id FROM debts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Debt not found' });

  const updateDebt = db.prepare(
    'UPDATE debts SET name = ?, lender = ?, debt_type = ?, minimum_payment = ? WHERE id = ?'
  );
  const deleteTranches = db.prepare('DELETE FROM tranches WHERE debt_id = ?');
  const insertTranche = db.prepare(
    'INSERT INTO tranches (debt_id, label, balance, apr, promo_end_date, post_promo_apr, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  db.transaction(() => {
    updateDebt.run(name, lender || null, debt_type || 'credit_card', minimum_payment || 0, id);
    deleteTranches.run(id);
    for (let i = 0; i < tranches.length; i++) {
      const t = tranches[i];
      insertTranche.run(id, t.label, t.balance, t.apr, t.promo_end_date || null, t.post_promo_apr || null, i);
    }
  })();

  // Invalidate plan cache on any data change
  db.prepare('DELETE FROM plan_cache').run();

  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(id);
  const debtTranches = db.prepare('SELECT * FROM tranches WHERE debt_id = ? ORDER BY sort_order').all(id);
  res.json({ debt, tranches: debtTranches });
});

// DELETE /api/debts/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM debts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Debt not found' });

  db.prepare('DELETE FROM debts WHERE id = ?').run(id); // tranches cascade
  db.prepare('DELETE FROM plan_cache').run();
  res.json({ ok: true });
});

module.exports = router;
