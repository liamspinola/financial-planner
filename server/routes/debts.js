'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

function isFiniteNonNegative(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }
function isValidApr(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 2; }

function validateTranches(tranches) {
  for (const t of tranches) {
    if (!t.label || typeof t.label !== 'string') return 'Each tranche must have a label';
    if (!isFiniteNonNegative(t.balance)) return `Tranche "${t.label}": balance must be a non-negative number`;
    if (!isValidApr(t.apr)) return `Tranche "${t.label}": APR must be between 0 and 2 (i.e. 0%–200%)`;
    if (t.post_promo_apr != null && !isValidApr(t.post_promo_apr))
      return `Tranche "${t.label}": post-promo APR must be between 0 and 2`;
  }
  return null;
}

// GET /api/debts — all debts with their tranches
router.get('/', (req, res) => {
  const db = getDb();
  const debts = db.prepare('SELECT * FROM debts ORDER BY created_at ASC').all();
  const tranches = db.prepare('SELECT * FROM tranches ORDER BY sort_order ASC, id ASC').all();
  res.json({ debts, tranches });
});

function validateMinPayment(body) {
  const { minimum_payment, min_payment_pct, min_payment_floor } = body;
  if (minimum_payment != null && !isFiniteNonNegative(minimum_payment))
    return 'minimum_payment must be a non-negative number';
  if (min_payment_pct != null) {
    if (typeof min_payment_pct !== 'number' || !isFinite(min_payment_pct) || min_payment_pct < 0 || min_payment_pct > 1)
      return 'min_payment_pct must be a decimal between 0 and 1 (e.g. 0.02 for 2%)';
  }
  if (min_payment_floor != null && !isFiniteNonNegative(min_payment_floor))
    return 'min_payment_floor must be a non-negative number';
  return null;
}

// POST /api/debts — create a debt with its tranches
router.post('/', (req, res) => {
  const { name, lender, debt_type, minimum_payment, min_payment_pct, min_payment_floor, notes, tranches = [] } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const minErr = validateMinPayment(req.body);
  if (minErr) return res.status(400).json({ error: minErr });
  const trancheError = validateTranches(tranches);
  if (trancheError) return res.status(400).json({ error: trancheError });

  const db = getDb();
  const insertDebt = db.prepare(
    'INSERT INTO debts (name, lender, debt_type, minimum_payment, min_payment_pct, min_payment_floor, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertTranche = db.prepare(
    'INSERT INTO tranches (debt_id, label, balance, apr, promo_end_date, post_promo_apr, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const result = db.transaction(() => {
    const { lastInsertRowid } = insertDebt.run(
      name, lender || null, debt_type || 'credit_card', minimum_payment || 0,
      min_payment_pct ?? null, min_payment_floor ?? null, notes || null
    );
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
  const { name, lender, debt_type, minimum_payment, min_payment_pct, min_payment_floor, notes, tranches = [] } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const minErr = validateMinPayment(req.body);
  if (minErr) return res.status(400).json({ error: minErr });
  const trancheError = validateTranches(tranches);
  if (trancheError) return res.status(400).json({ error: trancheError });

  const existing = db.prepare('SELECT id FROM debts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Debt not found' });

  const updateDebt = db.prepare(
    'UPDATE debts SET name = ?, lender = ?, debt_type = ?, minimum_payment = ?, min_payment_pct = ?, min_payment_floor = ?, notes = ? WHERE id = ?'
  );
  const deleteTranches = db.prepare('DELETE FROM tranches WHERE debt_id = ?');
  const insertTranche = db.prepare(
    'INSERT INTO tranches (debt_id, label, balance, apr, promo_end_date, post_promo_apr, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  db.transaction(() => {
    updateDebt.run(
      name, lender || null, debt_type || 'credit_card', minimum_payment || 0,
      min_payment_pct ?? null, min_payment_floor ?? null, notes || null, id
    );
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
