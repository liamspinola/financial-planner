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
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/progress',  require('./routes/progress'));
app.use('/api/actuals',   require('./routes/actuals'));
app.use('/api/advisor',   require('./routes/advisor'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Financial Planner API running on http://localhost:${PORT}`);
});
