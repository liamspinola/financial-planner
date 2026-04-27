# Expense Events (Money Hits) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users schedule one-off expense hits (birthdays, trips, emergencies) in any future month so the simulation shows their realistic impact on the payoff timeline.

**Architecture:** Mirrors the windfall system exactly — a new `expense_events` DB table, a CRUD route, and the engine subtracts the hit from `monthlyExtra` (clamped to 0) for that month. The guide surfaces an `expense_hit` milestone. No schema change to existing tables; added via the existing MIGRATIONS array in `database.js`.

**Tech Stack:** better-sqlite3, Express, React, existing windfall UI patterns.

---

## Design Decisions

- **Amounts stored positive** — the UI labels them as costs, the simulation subtracts them. No negative numbers stored.
- **Category**: `'expected'` (holidays, birthdays, car service) or `'unexpected'` (emergency, medical, repairs). Stored in DB, shown visually in the UI (amber vs red).
- **Simulation clamping**: `monthlyExtra = Math.max(0, available + freedMinimums + windfall - expenseHit)`. In a very bad month, only minimums are paid — extra goes to zero, not negative.
- **Plan cache**: expense_events are included in the input hash, so any change invalidates the cache.
- **LumpSum Advisor**: the advisor runs its own `simulate()` calls — those must also receive expense_events.
- **Guide milestone**: an `expense_hit` milestone appears in the guide entry for that month.

---

## File Map

| File | Change |
|------|--------|
| `server/db/database.js` | Add migration to create `expense_events` table |
| `server/routes/expense-events.js` | New — CRUD route mirroring `windfalls.js` |
| `server/index.js` | Register `/api/expense-events` route |
| `server/engine/amortisation.js` | Accept `expenseEvents` param; subtract hit from `monthlyExtra`; add `expenseHit` to `monthState` |
| `server/engine/guide.js` | Destructure `expenseHit`; add `expense_hit` milestone |
| `server/routes/plan.js` | Load expense_events; pass to all `simulate()` calls; include in cache hash |
| `client/src/lib/api.js` | Add expense-events API methods |
| `client/src/views/Plan.jsx` | Add Expense Events UI section (mirrors Windfall section) |

---

## Task 1: DB migration — create `expense_events` table

**Files:**
- Modify: `server/db/database.js`

- [ ] **Step 1: Add the migration**

In `server/db/database.js`, add to the `MIGRATIONS` array:

```js
const MIGRATIONS = [
  // Feature 3: debt notes
  'ALTER TABLE debts ADD COLUMN notes TEXT',
  // Feature 2: percentage-based minimum payments
  'ALTER TABLE debts ADD COLUMN min_payment_pct   REAL',
  'ALTER TABLE debts ADD COLUMN min_payment_floor REAL',
  // Expense events (money hits)
  `CREATE TABLE IF NOT EXISTS expense_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    label       TEXT    NOT NULL,
    amount      REAL    NOT NULL,
    apply_month INTEGER NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'expected',
    created_at  TEXT    DEFAULT (date('now'))
  )`,
];
```

- [ ] **Step 2: Verify the migration runs**

Start the server (or restart it). Check the DB:
```bash
sqlite3 finance.db ".schema expense_events"
```
Expected output:
```
CREATE TABLE expense_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    label       TEXT    NOT NULL,
    amount      REAL    NOT NULL,
    apply_month INTEGER NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'expected',
    created_at  TEXT    DEFAULT (date('now'))
  )
```

- [ ] **Step 3: Commit**

```bash
git add server/db/database.js
git commit -m "feat: add expense_events table via migration"
```

---

## Task 2: Server CRUD route for expense events

**Files:**
- Create: `server/routes/expense-events.js`

- [ ] **Step 1: Create the route file**

Create `server/routes/expense-events.js`:

```js
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
```

- [ ] **Step 2: Register the route in index.js**

In `server/index.js`, add after the windfalls line:

```js
app.use('/api/windfalls',      require('./routes/windfalls'));
app.use('/api/expense-events', require('./routes/expense-events'));
```

- [ ] **Step 3: Smoke-test the route**

```bash
curl -s -X POST http://localhost:3001/api/expense-events \
  -H "Content-Type: application/json" \
  -d '{"label":"Birthday gift","amount":150,"apply_month":3,"category":"expected"}' | jq .
```
Expected: `{"id":1,"label":"Birthday gift","amount":150,"apply_month":3,"category":"expected","created_at":"..."}`

```bash
curl -s http://localhost:3001/api/expense-events | jq .
```
Expected: `[{"id":1,...}]`

- [ ] **Step 4: Commit**

```bash
git add server/routes/expense-events.js server/index.js
git commit -m "feat: add expense-events CRUD route"
```

---

## Task 3: Update simulation engine to apply expense hits

**Files:**
- Modify: `server/engine/amortisation.js` (lines 93, 115-124, 159-168)
- Modify: `server/engine/guide.js` (lines 35, 72-78)

### amortisation.js

- [ ] **Step 1: Add `expenseEvents` parameter to `simulate()`**

Current signature (line 93):
```js
function simulate(debtMap, available, strategy, startDate, windfalls = [], fundingDelay = 0) {
```

Replace with:
```js
function simulate(debtMap, available, strategy, startDate, windfalls = [], fundingDelay = 0, expenseEvents = []) {
```

- [ ] **Step 2: Compute `expenseHit` alongside windfall, update `monthlyExtra`, add to `monthState`**

Current block (lines 115-124):
```js
    // Add any windfalls scheduled for this month
    const windfall = windfalls
      .filter(w => w.apply_month === m + 1)
      .reduce((s, w) => s + w.amount, 0);

    // During emergency fund phase, redirect extra payments to savings (no extra on debts)
    const inFundingPhase = m < fundingDelay;

    // Extra payment this month = surplus above all effective minimums + any freed minimums + windfalls
    const monthlyExtra = inFundingPhase ? 0 : (available + freedMinimums + windfall);
```

Replace with:
```js
    // Add any windfalls scheduled for this month
    const windfall = windfalls
      .filter(w => w.apply_month === m + 1)
      .reduce((s, w) => s + w.amount, 0);

    // Subtract any expense events scheduled for this month
    const expenseHit = expenseEvents
      .filter(e => e.apply_month === m + 1)
      .reduce((s, e) => s + e.amount, 0);

    // During emergency fund phase, redirect extra payments to savings (no extra on debts)
    const inFundingPhase = m < fundingDelay;

    // Extra payment this month = surplus above all effective minimums + any freed minimums + windfalls - expense hits
    // Clamped to 0: a bad expense month means we only pay minimums, never negative
    const monthlyExtra = inFundingPhase ? 0 : Math.max(0, available + freedMinimums + windfall - expenseHit);
```

Current `monthState` initialisation (lines 159-168):
```js
    const monthState = {
      month: m + 1,
      date: simMonth,
      payments: [],
      totalInterestThisMonth: 0,
      debtsCleared: [],
      windfall: windfall > 0 ? windfall : null,
      isFundingPhase: inFundingPhase,
      fundingSaving: inFundingPhase ? available : 0,
    };
```

Replace with:
```js
    const monthState = {
      month: m + 1,
      date: simMonth,
      payments: [],
      totalInterestThisMonth: 0,
      debtsCleared: [],
      windfall: windfall > 0 ? windfall : null,
      expenseHit: expenseHit > 0 ? expenseHit : null,
      isFundingPhase: inFundingPhase,
      fundingSaving: inFundingPhase ? available : 0,
    };
```

### guide.js

- [ ] **Step 3: Destructure `expenseHit` from state and add milestone**

Current destructure (line 35):
```js
    const { month, date, payments, debtsCleared, balances, windfall, isFundingPhase, fundingSaving } = state;
```

Replace with:
```js
    const { month, date, payments, debtsCleared, balances, windfall, expenseHit, isFundingPhase, fundingSaving } = state;
```

Current windfall milestone block (lines 72-78):
```js
    // Milestones: windfall applied
    if (windfall) {
      entry.milestones.push({
        type: 'windfall',
        amount: windfall,
        message: `Windfall of ${formatGbp(windfall)} applied to target debt this month`,
      });
    }
```

Replace with:
```js
    // Milestones: windfall applied
    if (windfall) {
      entry.milestones.push({
        type: 'windfall',
        amount: windfall,
        message: `Windfall of ${formatGbp(windfall)} applied to target debt this month`,
      });
    }

    // Milestones: expense hit
    if (expenseHit) {
      entry.milestones.push({
        type: 'expense_hit',
        amount: expenseHit,
        message: `Expense of ${formatGbp(expenseHit)} this month — extra debt payment reduced accordingly`,
      });
    }
```

- [ ] **Step 4: Commit**

```bash
git add server/engine/amortisation.js server/engine/guide.js
git commit -m "feat: simulation engine applies expense hits against monthlyExtra"
```

---

## Task 4: Load expense events in plan.js and pass to simulate()

**Files:**
- Modify: `server/routes/plan.js`

The plan route runs `simulate()` in three places:
1. Main plan (lines 47-48): avalanche + snowball
2. What-if route (line ~170): single simulate
3. Lump sum advisor route (lines ~273, ~293, ~339): three simulate calls

- [ ] **Step 1: Load expense_events in the main plan route**

In the main `router.post('/')` handler, after the windfalls load (line 19):
```js
  const windfalls = db.prepare('SELECT * FROM windfalls ORDER BY apply_month ASC').all();
```

Add:
```js
  const expenseEvents = db.prepare('SELECT * FROM expense_events ORDER BY apply_month ASC').all();
```

- [ ] **Step 2: Pass `expenseEvents` to the two main simulate() calls**

Current (lines 47-48):
```js
  const avalanche = simulate(debtMap, summary.availableForDebt, 'avalanche', startDate, windfalls, fundingDelay);
  const snowball  = simulate(debtMap, summary.availableForDebt, 'snowball',  startDate, windfalls, fundingDelay);
```

Replace with:
```js
  const avalanche = simulate(debtMap, summary.availableForDebt, 'avalanche', startDate, windfalls, fundingDelay, expenseEvents);
  const snowball  = simulate(debtMap, summary.availableForDebt, 'snowball',  startDate, windfalls, fundingDelay, expenseEvents);
```

- [ ] **Step 3: Include expenseEvents in the input hash**

Current hash object (lines 128-134):
```js
  const inputHash = crypto.createHash('sha256')
    .update(JSON.stringify({
      debts: sortById(debts),
      tranches: sortById(tranches),
      income: sortById(income),
      expenses: sortById(expenses),
      windfalls: sortById(windfalls),
    }))
    .digest('hex');
```

Replace with:
```js
  const inputHash = crypto.createHash('sha256')
    .update(JSON.stringify({
      debts: sortById(debts),
      tranches: sortById(tranches),
      income: sortById(income),
      expenses: sortById(expenses),
      windfalls: sortById(windfalls),
      expenseEvents: sortById(expenseEvents),
    }))
    .digest('hex');
```

- [ ] **Step 4: Load and pass expense events in the whatif route**

In `router.post('/whatif')`, after the existing windfalls/income/expenses loads, read the current code around line 154-170 to find the simulate() call. Add the expense_events load and pass it through.

Read the current whatif route to find the exact simulate call:
```js
  const windfalls = db.prepare('SELECT * FROM windfalls ORDER BY apply_month ASC').all();
```
If windfalls are already loaded there, add after:
```js
  const expenseEvents = db.prepare('SELECT * FROM expense_events ORDER BY apply_month ASC').all();
```
Then pass `expenseEvents` as the 7th arg to the whatif `simulate()` call.

- [ ] **Step 5: Load and pass expense events in the lumpsum advisor route**

In `router.post('/lumpsum')`, find all `simulate()` calls (there are 3: baseline, withLump, and the per-debt analysis loop). Add the same load and pass-through pattern.

Read the lumpsum route in plan.js starting around line 189 to find the simulate calls, then:
```js
  const expenseEvents = db.prepare('SELECT * FROM expense_events ORDER BY apply_month ASC').all();
```
Add this after windfalls are loaded, and pass as 7th arg to every `simulate()` call in that route.

- [ ] **Step 6: Commit**

```bash
git add server/routes/plan.js
git commit -m "feat: plan route loads and passes expense events to all simulate() calls"
```

---

## Task 5: Client API and UI

**Files:**
- Modify: `client/src/lib/api.js`
- Modify: `client/src/views/Plan.jsx`

### api.js

- [ ] **Step 1: Add expense-events API methods**

In `client/src/lib/api.js`, after the windfalls block:
```js
  // Windfalls
  getWindfalls:    ()            => request('GET',    '/windfalls'),
  createWindfall:  (w)           => request('POST',   '/windfalls', w),
  updateWindfall:  (id, w)       => request('PUT',    `/windfalls/${id}`, w),
  deleteWindfall:  (id)          => request('DELETE', `/windfalls/${id}`),
```

Add:
```js
  // Expense events
  getExpenseEvents:    ()          => request('GET',    '/expense-events'),
  createExpenseEvent:  (e)         => request('POST',   '/expense-events', e),
  updateExpenseEvent:  (id, e)     => request('PUT',    `/expense-events/${id}`, e),
  deleteExpenseEvent:  (id)        => request('DELETE', `/expense-events/${id}`),
```

### Plan.jsx

- [ ] **Step 2: Add state and load function for expense events**

In `Plan.jsx`, find the windfalls state (around line 50):
```js
  const [windfalls, setWindfalls] = useState([]);
```

Add below it:
```js
  const [expenseEvents, setExpenseEvents] = useState([]);
  const [editingEv, setEditingEv] = useState(null);
  const [evForm, setEvForm] = useState({ label: '', amount: '', apply_month: '', category: 'expected' });
```

Find `loadWindfalls` function and add a parallel loader:
```js
  async function loadExpenseEvents() {
    try { setExpenseEvents(await api.getExpenseEvents()); } catch { /* non-critical */ }
  }
```

In the `useEffect` that calls `loadWindfalls()` on mount, also call `loadExpenseEvents()`.

- [ ] **Step 3: Add saveExpenseEvent and deleteExpenseEvent functions**

After the existing `saveWindfall` and `deleteWindfall` functions, add:

```js
  async function saveExpenseEvent() {
    const payload = {
      label: evForm.label.trim(),
      amount: parseFloat(evForm.amount),
      apply_month: parseInt(evForm.apply_month, 10),
      category: evForm.category,
    };
    try {
      if (editingEv !== null) {
        await api.updateExpenseEvent(editingEv, payload);
        setEditingEv(null);
      } else {
        await api.createExpenseEvent(payload);
      }
      setEvForm({ label: '', amount: '', apply_month: '', category: 'expected' });
      await loadExpenseEvents();
      loadPlan();
    } catch (err) {
      console.error('Failed to save expense event', err);
    }
  }

  async function deleteExpenseEvent(id) {
    await api.deleteExpenseEvent(id);
    await loadExpenseEvents();
    loadPlan();
  }
```

- [ ] **Step 4: Add the Expense Events UI section**

In `Plan.jsx`, find the closing `</div>` of the Windfall section (after the "Add windfall" button, around line 313). Add the Expense Events section immediately after, before the `<LumpSumAdvisor>` line:

```jsx
        {/* Expense Events */}
        <div className="mt-5 border-t border-slate-700 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Expense Events</h4>
          <p className="text-xs text-slate-500 mb-3">
            Schedule one-off costs (holidays, birthdays, car repairs) to see their impact on your payoff timeline.
          </p>
          {expenseEvents.length > 0 && (
            <div className="space-y-1 mb-3">
              {expenseEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 text-sm">
                  {editingEv === ev.id ? (
                    <>
                      <input className="input flex-1 py-1 text-xs" placeholder="Label" value={evForm.label} onChange={e => setEvForm(f => ({ ...f, label: e.target.value }))} />
                      <input className="input w-24 py-1 text-xs" type="number" min="1" placeholder="£ amount" value={evForm.amount} onChange={e => setEvForm(f => ({ ...f, amount: e.target.value }))} />
                      <select className="input py-1 text-xs" value={evForm.category} onChange={e => setEvForm(f => ({ ...f, category: e.target.value }))}>
                        <option value="expected">Expected</option>
                        <option value="unexpected">Unexpected</option>
                      </select>
                      <select className="input py-1 text-xs" value={evForm.apply_month} onChange={e => setEvForm(f => ({ ...f, apply_month: e.target.value }))}>
                        <option value="">Select month</option>
                        {(plan?.chartData || []).map(p => (
                          <option key={p.month} value={p.month}>{formatMonthLabel(p.date)}</option>
                        ))}
                      </select>
                      <button onClick={saveExpenseEvent} className="btn-sm-teal text-xs">Save</button>
                      <button onClick={() => { setEditingEv(null); setEvForm({ label: '', amount: '', apply_month: '', category: 'expected' }); }} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className={`font-medium ${ev.category === 'unexpected' ? 'text-red-400' : 'text-amber-400'}`}>
                        -£{ev.amount.toLocaleString('en-GB')}
                      </span>
                      <span className="text-slate-300">{ev.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${ev.category === 'unexpected' ? 'bg-red-900/40 text-red-300' : 'bg-amber-900/40 text-amber-300'}`}>
                        {ev.category}
                      </span>
                      <span className="text-slate-500">
                        {monthDateMap[ev.apply_month] ? formatMonthLabel(monthDateMap[ev.apply_month]) : `month ${ev.apply_month}`}
                      </span>
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => { setEditingEv(ev.id); setEvForm({ label: ev.label, amount: ev.amount, apply_month: ev.apply_month, category: ev.category }); }} className="p-1 text-slate-400 hover:text-slate-200"><Edit2 size={11} /></button>
                        <button onClick={() => deleteExpenseEvent(ev.id)} className="p-1 text-slate-400 hover:text-red-400"><Trash2 size={11} /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {editingEv === null && (
            <div className="flex items-center gap-2 flex-wrap">
              <input className="input flex-1 min-w-[120px] py-1 text-xs" placeholder="Label (e.g. Holiday to Spain)" value={evForm.label} onChange={e => setEvForm(f => ({ ...f, label: e.target.value }))} />
              <input className="input w-28 py-1 text-xs" type="number" min="1" placeholder="£ amount" value={evForm.amount} onChange={e => setEvForm(f => ({ ...f, amount: e.target.value }))} />
              <select className="input py-1 text-xs" value={evForm.category} onChange={e => setEvForm(f => ({ ...f, category: e.target.value }))}>
                <option value="expected">Expected</option>
                <option value="unexpected">Unexpected</option>
              </select>
              <select className="input py-1 text-xs" value={evForm.apply_month} onChange={e => setEvForm(f => ({ ...f, apply_month: e.target.value }))}>
                <option value="">Select month</option>
                {(plan?.chartData || []).map(p => (
                  <option key={p.month} value={p.month}>{formatMonthLabel(p.date)}</option>
                ))}
              </select>
              <button
                onClick={saveExpenseEvent}
                disabled={!evForm.label || !evForm.amount || !evForm.apply_month}
                className="btn-sm-teal text-xs disabled:opacity-40"
              >
                <Plus size={12} /> Add expense
              </button>
            </div>
          )}
        </div>
```

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/api.js client/src/views/Plan.jsx
git commit -m "feat: expense events UI — add, edit, delete with category and calendar month picker"
```

---

## Verification

End-to-end checklist:
- [ ] Add an "expected" expense (e.g. £500 Holiday, month 3) — plan regenerates, payoff date extends slightly
- [ ] Add an "unexpected" expense (e.g. £800 Car repair, month 6) — larger impact on payoff
- [ ] Add a windfall AND an expense in the same month — net effect is correct (windfall - expense applied)
- [ ] Add an expense larger than `available + freedMinimums + windfall` — plan doesn't crash, that month only pays minimums
- [ ] Edit an expense event — change amount or month, plan recalculates
- [ ] Delete an expense event — plan recalculates back to previous timeline
- [ ] Expected events show amber `-£500`, unexpected events show red `-£800` with category badge
- [ ] Guide entries for affected months show `expense_hit` milestone message
- [ ] Lump Sum Advisor still works correctly with expense events present
