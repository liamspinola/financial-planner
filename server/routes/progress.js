'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/progress — all snapshots ordered by month
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM progress_snapshots ORDER BY snapshot_month ASC').all();
  res.json(rows.map(r => ({ ...r, balances: JSON.parse(r.balances_json) })));
});

// POST /api/progress — upsert a snapshot for the given month
router.post('/', (req, res) => {
  const { snapshot_month, balances, notes } = req.body;
  if (!snapshot_month || !/^\d{4}-\d{2}$/.test(snapshot_month))
    return res.status(400).json({ error: 'snapshot_month must be YYYY-MM' });
  const monthNum = parseInt(snapshot_month.split('-')[1], 10);
  if (monthNum < 1 || monthNum > 12)
    return res.status(400).json({ error: 'snapshot_month must be a valid calendar month (01–12)' });
  if (!balances || typeof balances !== 'object')
    return res.status(400).json({ error: 'balances must be an object { debtId: amount }' });

  const total_balance = Object.values(balances).reduce((s, v) => s + (Number(v) || 0), 0);
  const db = getDb();
  db.prepare(`
    INSERT INTO progress_snapshots (snapshot_month, total_balance, balances_json, notes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(snapshot_month) DO UPDATE SET
      total_balance = excluded.total_balance,
      balances_json = excluded.balances_json,
      notes         = excluded.notes,
      recorded_at   = datetime('now')
  `).run(snapshot_month, total_balance, JSON.stringify(balances), notes || null);

  const row = db.prepare('SELECT * FROM progress_snapshots WHERE snapshot_month = ?').get(snapshot_month);
  res.json({ ...row, balances: JSON.parse(row.balances_json) });
});

// PUT /api/progress/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { balances, notes } = req.body;
  const existing = db.prepare('SELECT * FROM progress_snapshots WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Snapshot not found' });
  if (!balances || typeof balances !== 'object')
    return res.status(400).json({ error: 'balances must be an object' });

  const total_balance = Object.values(balances).reduce((s, v) => s + (Number(v) || 0), 0);
  db.prepare('UPDATE progress_snapshots SET total_balance = ?, balances_json = ?, notes = ? WHERE id = ?')
    .run(total_balance, JSON.stringify(balances), notes || null, id);

  const row = db.prepare('SELECT * FROM progress_snapshots WHERE id = ?').get(id);
  res.json({ ...row, balances: JSON.parse(row.balances_json) });
});

// DELETE /api/progress/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM progress_snapshots WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Snapshot not found' });
  db.prepare('DELETE FROM progress_snapshots WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
