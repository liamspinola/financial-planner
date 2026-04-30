'use strict';

const express = require('express');
const cors = require('cors');
const { getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

// Initialise DB on startup
getDb();

app.use('/api/debts',     require('./routes/debts'));
app.use('/api/budget',    require('./routes/budget'));
app.use('/api/plan',      require('./routes/plan'));
app.use('/api/ai',        require('./routes/ai'));
app.use('/api/windfalls', require('./routes/windfalls'));
app.use('/api/expense-events', require('./routes/expense-events'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/progress',  require('./routes/progress'));
app.use('/api/actuals',   require('./routes/actuals'));
app.use('/api/advisor',   require('./routes/advisor'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Test-only reset endpoint — wipes all data so each E2E test starts clean
if (process.env.NODE_ENV === 'test') {
  app.post('/api/__reset', (req, res) => {
    const db = getDb();
    db.exec(`
      DELETE FROM messages;
      DELETE FROM conversations;
      DELETE FROM spending_actuals;
      DELETE FROM progress_snapshots;
      DELETE FROM plan_cache;
      DELETE FROM expense_events;
      DELETE FROM windfalls;
      DELETE FROM expenses;
      DELETE FROM income_sources;
      DELETE FROM tranches;
      DELETE FROM debts;
      DELETE FROM settings;
    `);
    res.json({ ok: true });
  });
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Liam's Wicked Financial Planner Tool API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
