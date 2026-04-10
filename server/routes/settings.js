'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/settings — return all settings as { key: value, ... }
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(obj);
});

// PUT /api/settings — upsert key-value pairs (body: { key: value, ... })
router.put('/', (req, res) => {
  const db = getDb();
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const upsertAll = db.transaction(pairs => {
    for (const [k, v] of pairs) upsert.run(k, String(v));
  });
  const pairs = Object.entries(req.body).filter(([, v]) => v !== undefined && v !== null);
  upsertAll(pairs);
  const rows = db.prepare('SELECT key, value FROM settings').all();
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

module.exports = router;
