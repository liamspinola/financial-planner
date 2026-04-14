# Financial Advisor Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Advisor page with persistent multi-session chat backed by Claude CLI, typewriter response reveal, and per-conversation financial context snapshots.

**Architecture:** Express routes at `/api/advisor` handle conversation + message CRUD; a shared `server/lib/claude.js` utility wraps the Claude CLI spawn; `server/engine/advisor.js` owns prompt assembly. The React frontend is a single `Advisor.jsx` view with an inline session list panel and chat panel.

**Tech Stack:** React 19, Express 5, better-sqlite3, Claude CLI (existing), lucide-react (existing), Tailwind CSS (existing).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `server/db/schema.sql` | Modify | Add `conversations` + `messages` tables |
| `server/lib/claude.js` | Create | Shared Claude CLI spawn utility (`callClaude`) |
| `server/routes/ai.js` | Modify | Use shared `callClaude` from lib |
| `server/engine/advisor.js` | Create | `buildContextSnapshot()`, `buildAdvisorPrompt()` |
| `server/routes/advisor.js` | Create | All `/api/advisor` endpoints |
| `server/index.js` | Modify | Mount `/api/advisor` router |
| `client/src/lib/api.js` | Modify | Add advisor API methods |
| `client/src/components/Sidebar.jsx` | Modify | Add Advisor nav entry |
| `client/src/App.jsx` | Modify | Add `/advisor` route |
| `client/src/views/Advisor.jsx` | Create | Full Advisor page |

---

## Task 1: Add conversations + messages tables to schema

**Files:**
- Modify: `server/db/schema.sql`

- [ ] **Step 1: Append the two new tables to `server/db/schema.sql`**

Add at the end of the file (after the `idx_spending_actuals_month` index line):

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL DEFAULT 'New conversation',
  use_context      INTEGER NOT NULL DEFAULT 1 CHECK (use_context IN (0, 1)),
  context_snapshot TEXT,
  summary          TEXT,
  deleted_at       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_active
  ON conversations (updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  INTEGER NOT NULL
                   REFERENCES conversations (id) ON DELETE CASCADE,
  role             TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT    NOT NULL,
  sequence         INTEGER NOT NULL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (conversation_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_seq
  ON messages (conversation_id, sequence);
```

- [ ] **Step 2: Verify tables are created on server start**

Start the server (`npm run dev` or `node server/index.js` from project root), then run:

```bash
sqlite3 finance.db ".tables"
```

Expected output includes: `conversations  messages`

- [ ] **Step 3: Commit**

```bash
git add server/db/schema.sql
git commit -m "feat: add conversations and messages tables for advisor chat"
```

---

## Task 2: Extract shared Claude CLI utility

**Files:**
- Create: `server/lib/claude.js`
- Modify: `server/routes/ai.js`

The `findClaudeExe` function is duplicated if left in `ai.js` alone. Extract it to a shared lib so `advisor.js` can reuse it without copying code.

- [ ] **Step 1: Create `server/lib/claude.js`**

```js
'use strict';

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

function findClaudeExe() {
  const desktopBase = path.join(
    process.env.LOCALAPPDATA || '',
    'Packages', 'Claude_pzs8sxrjxfjjc',
    'LocalCache', 'Roaming', 'Claude', 'claude-code'
  );
  if (fs.existsSync(desktopBase)) {
    const versions = fs.readdirSync(desktopBase).sort().reverse();
    for (const v of versions) {
      const exe = path.join(desktopBase, v, 'claude.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  const npmCmd = path.join(process.env.APPDATA || '', 'npm', 'claude.cmd');
  if (fs.existsSync(npmCmd)) return npmCmd;
  return 'claude';
}

const CLAUDE_EXE = findClaudeExe();

/**
 * Call the Claude CLI with a prompt string.
 * Resolves with the trimmed stdout string.
 * Rejects with a descriptive Error on timeout or non-zero exit.
 *
 * @param {string} prompt
 * @param {number} [timeoutMs=60000]
 * @returns {Promise<string>}
 */
function callClaude(prompt, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(CLAUDE_EXE, ['-p', prompt], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      shell: CLAUDE_EXE.endsWith('.cmd'),
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      reject(new Error('Claude CLI timed out'));
    }, timeoutMs);

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code !== 0) reject(new Error(`Claude CLI exited ${code}: ${stderr.trim()}`));
      else resolve(stdout.trim());
    });
  });
}

module.exports = { callClaude, CLAUDE_EXE };
```

- [ ] **Step 2: Update `server/routes/ai.js` to use the shared utility**

Replace the top of `ai.js`. The current file has `const { spawn } = require('child_process');`, the `findClaudeExe` function (lines 6–43), and `const CLAUDE_EXE = findClaudeExe();`. Replace all of that with a single import, and update the `spawn` call inside the `router.post('/')` handler to use `callClaude`.

Replace lines 1–43 of `server/routes/ai.js`:

```js
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../db/database');
const { callClaude } = require('../lib/claude');
```

Then inside `router.post('/')`, replace the entire `await new Promise(...)` block (which spans from `let stdout = ''` through `.catch(...)`) with:

```js
  let stdout;
  try {
    stdout = await callClaude(prompt, 180000);
  } catch (err) {
    return res.status(502).json({ error: 'Claude CLI unavailable: ' + err.message });
  }
```

And remove `if (res.headersSent) return;` — it's no longer needed since we use try/catch now.

- [ ] **Step 3: Verify AI route still works**

Start the server. Navigate to the Plan page in the browser, generate a plan, and trigger an AI narrative (Mode B or C). Confirm it still returns a response.

- [ ] **Step 4: Commit**

```bash
git add server/lib/claude.js server/routes/ai.js
git commit -m "refactor: extract Claude CLI spawn to shared server/lib/claude.js"
```

---

## Task 3: Build the advisor engine

**Files:**
- Create: `server/engine/advisor.js`

- [ ] **Step 1: Create `server/engine/advisor.js`**

```js
'use strict';

const SYSTEM_PROMPT =
  'You are a friendly, experienced UK financial adviser. ' +
  'Give clear, specific, actionable advice. ' +
  'Keep responses conversational — short paragraphs, bullet points where helpful. ' +
  'Never give generic disclaimers. The user\'s financial data is real and current. ' +
  'Always respond in British English.';

/**
 * Build a formatted plain-text snapshot of the user's current financial state.
 * Returns null if no debts are entered yet.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {string|null}
 */
function buildContextSnapshot(db) {
  const debts    = db.prepare('SELECT * FROM debts').all();
  const tranches = db.prepare('SELECT * FROM tranches').all();
  const income   = db.prepare('SELECT * FROM income_sources').all();
  const expenses = db.prepare('SELECT * FROM expenses').all();

  if (debts.length === 0) return null;

  const totalIncome    = income.reduce((s, i) => s + i.monthly_equivalent, 0);
  const totalExpenses  = expenses.reduce((s, e) => s + e.amount, 0);
  const totalMinimums  = debts.reduce((s, d) => s + (d.minimum_payment || 0), 0);
  const surplus        = totalIncome - totalExpenses - totalMinimums;
  const totalDebt      = tranches.reduce((s, t) => s + t.balance, 0);

  const debtLines = debts.map(d => {
    const dt     = tranches.filter(t => t.debt_id === d.id);
    const bal    = dt.reduce((s, t) => s + t.balance, 0);
    const maxApr = dt.length > 0 ? Math.max(...dt.map(t => t.apr)) * 100 : 0;
    const min    = d.minimum_payment || 0;
    return `  · ${d.name} — £${bal.toFixed(0)} @ ${maxApr.toFixed(1)}% APR (min £${min.toFixed(0)}/mo)`;
  }).join('\n');

  let planLine = '';
  const cached = db.prepare('SELECT calc_result FROM plan_cache WHERE id = 1').get();
  if (cached) {
    try {
      const p = JSON.parse(cached.calc_result);
      planLine = `\n- Current plan: ${p.recommendation?.strategy ?? 'avalanche'}, ` +
                 `debt-free ${p.debtFreeDate}, £${(p.totalInterest ?? 0).toFixed(0)} total interest`;
    } catch { /* malformed cache — skip plan line */ }
  }

  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    `FINANCIAL SNAPSHOT (as of ${date}):\n` +
    `- Monthly take-home: £${totalIncome.toFixed(0)}\n` +
    `- Monthly surplus after bills and minimums: £${surplus.toFixed(0)}\n` +
    `- Total debt: £${totalDebt.toFixed(0)} across ${debts.length} account${debts.length !== 1 ? 's' : ''}\n` +
    debtLines +
    planLine
  );
}

/**
 * Build the full prompt string to send to the Claude CLI for a chat reply.
 *
 * @param {Object}   conversation              - DB row for the conversation
 * @param {number}   conversation.use_context  - 1 | 0
 * @param {string}   conversation.context_snapshot - pre-built snapshot text or null
 * @param {string}   conversation.summary      - rolling older-message summary or null
 * @param {Array}    messages                  - last ≤6 message rows ordered by sequence ASC
 * @returns {string}
 */
function buildAdvisorPrompt(conversation, messages) {
  const parts = [SYSTEM_PROMPT];

  if (conversation.use_context && conversation.context_snapshot) {
    parts.push(conversation.context_snapshot);
  }

  if (conversation.summary) {
    parts.push(`Earlier in this conversation: ${conversation.summary}`);
  }

  if (messages.length > 0) {
    const history = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    parts.push(history);
  }

  parts.push('Respond as the adviser:');
  return parts.join('\n\n');
}

module.exports = { buildContextSnapshot, buildAdvisorPrompt };
```

- [ ] **Step 2: Verify the module loads cleanly**

```bash
node -e "const a = require('./server/engine/advisor'); console.log(Object.keys(a))"
```

Expected output: `[ 'buildContextSnapshot', 'buildAdvisorPrompt' ]`

- [ ] **Step 3: Commit**

```bash
git add server/engine/advisor.js
git commit -m "feat: add advisor engine — buildContextSnapshot and buildAdvisorPrompt"
```

---

## Task 4: Build advisor routes

**Files:**
- Create: `server/routes/advisor.js`

- [ ] **Step 1: Create `server/routes/advisor.js`**

```js
'use strict';

const express = require('express');
const router  = express.Router();
const { getDb }                              = require('../db/database');
const { callClaude }                         = require('../lib/claude');
const { buildContextSnapshot, buildAdvisorPrompt } = require('../engine/advisor');

// ─── Conversations ────────────────────────────────────────────────────────────

// GET /api/advisor/conversations
router.get('/conversations', (req, res) => {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS message_count
    FROM conversations c
    WHERE c.deleted_at IS NULL
    ORDER BY c.updated_at DESC
  `).all();
  res.json(rows);
});

// POST /api/advisor/conversations
router.post('/conversations', (req, res) => {
  const db     = getDb();
  const result = db.prepare(
    `INSERT INTO conversations (use_context) VALUES (1)`
  ).run();
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?')
    .get(result.lastInsertRowid);
  res.status(201).json(conv);
});

// PATCH /api/advisor/conversations/:id  — rename title and/or toggle use_context
router.patch('/conversations/:id', (req, res) => {
  const db   = getDb();
  const conv = db.prepare(
    'SELECT * FROM conversations WHERE id = ? AND deleted_at IS NULL'
  ).get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  const { title, useContext } = req.body;

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title must be a non-empty string' });
    }
    db.prepare(
      `UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(title.trim(), conv.id);
  }

  if (useContext !== undefined) {
    const count = db.prepare(
      'SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?'
    ).get(conv.id).n;
    if (count > 0) {
      return res.status(409).json({
        error: 'Cannot change context setting after conversation has started',
      });
    }
    db.prepare('UPDATE conversations SET use_context = ? WHERE id = ?')
      .run(useContext ? 1 : 0, conv.id);
  }

  const updated = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conv.id);
  res.json(updated);
});

// DELETE /api/advisor/conversations/:id  — soft delete
router.delete('/conversations/:id', (req, res) => {
  const db   = getDb();
  const conv = db.prepare(
    'SELECT id FROM conversations WHERE id = ? AND deleted_at IS NULL'
  ).get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  db.prepare(`UPDATE conversations SET deleted_at = datetime('now') WHERE id = ?`)
    .run(conv.id);
  res.status(204).end();
});

// ─── Messages ─────────────────────────────────────────────────────────────────

// GET /api/advisor/conversations/:id/messages
router.get('/conversations/:id/messages', (req, res) => {
  const db   = getDb();
  const conv = db.prepare(
    'SELECT id FROM conversations WHERE id = ? AND deleted_at IS NULL'
  ).get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  const messages = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY sequence ASC'
  ).all(req.params.id);
  res.json(messages);
});

// POST /api/advisor/conversations/:id/messages
router.post('/conversations/:id/messages', async (req, res) => {
  const db = getDb();
  const { content } = req.body;

  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content must be a non-empty string' });
  }

  const conv = db.prepare(
    'SELECT * FROM conversations WHERE id = ? AND deleted_at IS NULL'
  ).get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  // Next sequence number
  const lastSeq  = db.prepare(
    'SELECT MAX(sequence) AS m FROM messages WHERE conversation_id = ?'
  ).get(conv.id).m || 0;
  const userSeq  = lastSeq + 1;
  const isFirst  = userSeq === 1;

  // Capture context snapshot on first message if context is enabled
  if (isFirst && conv.use_context === 1 && !conv.context_snapshot) {
    const snapshot = buildContextSnapshot(db);
    if (snapshot) {
      db.prepare('UPDATE conversations SET context_snapshot = ? WHERE id = ?')
        .run(snapshot, conv.id);
      conv.context_snapshot = snapshot; // update local reference for prompt building
    }
  }

  // Insert user message
  db.prepare(
    `INSERT INTO messages (conversation_id, role, content, sequence) VALUES (?, 'user', ?, ?)`
  ).run(conv.id, content.trim(), userSeq);

  const userMessage = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? AND sequence = ?'
  ).get(conv.id, userSeq);

  // Fetch last ≤6 messages (includes the user message just inserted) for prompt
  const recentMessages = db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY sequence DESC
    LIMIT 6
  `).all(conv.id).reverse();

  // Build prompt and call Claude for the main reply
  const prompt = buildAdvisorPrompt(conv, recentMessages);
  let assistantContent;
  try {
    assistantContent = await callClaude(prompt, 60000);
  } catch (err) {
    if (err.message.includes('timed out')) {
      return res.status(504).json({ error: 'Claude took too long — please try again' });
    }
    return res.status(502).json({ error: 'Claude is unavailable: ' + err.message });
  }

  // Insert assistant message
  const assistantSeq = userSeq + 1;
  db.prepare(
    `INSERT INTO messages (conversation_id, role, content, sequence) VALUES (?, 'assistant', ?, ?)`
  ).run(conv.id, assistantContent, assistantSeq);

  const assistantMessage = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? AND sequence = ?'
  ).get(conv.id, assistantSeq);

  let newTitle;

  // Auto-generate title from the first user message
  if (isFirst) {
    try {
      const titlePrompt =
        `Give a conversation title of 4-6 words for a financial chat that started with: ` +
        `"${content.trim().slice(0, 200)}". ` +
        `Respond with only the title — no punctuation, no quotes.`;
      const raw   = await callClaude(titlePrompt, 30000);
      const title = raw.trim().slice(0, 60);
      if (title) {
        db.prepare(`UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(title, conv.id);
        newTitle = title;
      }
    } catch { /* non-critical — keep default title */ }
  }

  // Regenerate rolling summary every 6 messages (at total counts 8, 14, 20 …)
  const totalMessages = assistantSeq;
  if (totalMessages > 6 && totalMessages % 6 === 2) {
    try {
      const olderMessages = db.prepare(`
        SELECT role, content FROM messages
        WHERE conversation_id = ?
        ORDER BY sequence ASC
        LIMIT ?
      `).all(conv.id, totalMessages - 6);

      if (olderMessages.length > 0) {
        const historyText = olderMessages
          .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n');
        const summaryPrompt =
          `In 2-3 sentences, summarise the key points from this financial advice conversation:\n\n` +
          `${historyText}\n\nSummary:`;
        const summary = await callClaude(summaryPrompt, 30000);
        db.prepare('UPDATE conversations SET summary = ? WHERE id = ?')
          .run(summary.trim(), conv.id);
      }
    } catch { /* non-critical — keep existing summary */ }
  }

  // Update conversation timestamp so it sorts to top of list
  db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`)
    .run(conv.id);

  res.json({ userMessage, assistantMessage, newTitle: newTitle ?? null });
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/advisor.js
git commit -m "feat: add /api/advisor conversation and message routes"
```

---

## Task 5: Mount the advisor router

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add the advisor route to `server/index.js`**

Add one line after the existing `app.use('/api/actuals', ...)` line:

```js
app.use('/api/advisor',   require('./routes/advisor'));
```

- [ ] **Step 2: Smoke-test the API**

Start the server, then run these curl commands (requires the server to have at least one debt entered — if none, add one via the Debts UI first):

```bash
# Create a conversation
curl -s -X POST http://localhost:3001/api/advisor/conversations \
  -H "Content-Type: application/json" | python -m json.tool

# Should return: { "id": 1, "title": "New conversation", "use_context": 1, ... }

# List conversations
curl -s http://localhost:3001/api/advisor/conversations | python -m json.tool
# Should return an array with one item

# Send a message (this calls Claude — takes 10-30 seconds)
curl -s -X POST http://localhost:3001/api/advisor/conversations/1/messages \
  -H "Content-Type: application/json" \
  -d '{"content":"What is the best way to pay off debt faster?"}' | python -m json.tool
# Should return: { userMessage: {...}, assistantMessage: {...}, newTitle: "..." }

# Fetch messages
curl -s http://localhost:3001/api/advisor/conversations/1/messages | python -m json.tool
# Should return array of 2 messages (user + assistant)
```

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: mount /api/advisor router"
```

---

## Task 6: Add advisor API client methods

**Files:**
- Modify: `client/src/lib/api.js`

- [ ] **Step 1: Add advisor methods to `client/src/lib/api.js`**

After the `deleteWindfall` line, add:

```js
  // Advisor
  getConversations:   ()              => request('GET',    '/advisor/conversations'),
  createConversation: ()              => request('POST',   '/advisor/conversations'),
  patchConversation:  (id, data)      => request('PATCH',  `/advisor/conversations/${id}`, data),
  deleteConversation: (id)            => request('DELETE', `/advisor/conversations/${id}`),
  getMessages:        (id)            => request('GET',    `/advisor/conversations/${id}/messages`),
  sendMessage:        (id, content)   => request('POST',   `/advisor/conversations/${id}/messages`, { content }, 90000),
```

The 90000ms timeout on `sendMessage` covers the main Claude call (≤60s) plus the title generation call (≤30s) that happen server-side before the response is sent.

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/api.js
git commit -m "feat: add advisor API methods to api.js client"
```

---

## Task 7: Add Advisor to the sidebar and router

**Files:**
- Modify: `client/src/components/Sidebar.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add Advisor nav entry to `client/src/components/Sidebar.jsx`**

Add `MessageSquare` to the lucide-react import and insert the advisor entry between Plan and Progress in the NAV array:

```js
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CreditCard, Wallet, BarChart3, MessageSquare, TrendingUp } from 'lucide-react';

const NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/debts',     icon: CreditCard,      label: 'Debts'     },
  { to: '/budget',    icon: Wallet,          label: 'Budget'    },
  { to: '/plan',      icon: BarChart3,       label: 'Plan'      },
  { to: '/advisor',   icon: MessageSquare,   label: 'Advisor'   },
  { to: '/progress',  icon: TrendingUp,      label: 'Progress'  },
];
```

(The rest of Sidebar.jsx is unchanged.)

- [ ] **Step 2: Add the `/advisor` route to `client/src/App.jsx`**

Add the import and route:

```js
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar   from './components/Sidebar';
import Dashboard from './views/Dashboard';
import Debts     from './views/Debts';
import Budget    from './views/Budget';
import Plan      from './views/Plan';
import Advisor   from './views/Advisor';
import Progress  from './views/Progress';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-navy-900">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/debts"    element={<Debts />} />
            <Route path="/budget"   element={<Budget />} />
            <Route path="/plan"     element={<Plan />} />
            <Route path="/advisor"  element={<Advisor />} />
            <Route path="/progress" element={<Progress />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Create a placeholder `client/src/views/Advisor.jsx` so the route doesn't crash**

```jsx
export default function Advisor() {
  return <div className="p-8 text-slate-400">Advisor coming soon</div>;
}
```

- [ ] **Step 4: Verify in browser**

Start the dev server. Navigate to `/advisor`. The sidebar should show an "Advisor" entry with the message-square icon. The page should show "Advisor coming soon". No console errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Sidebar.jsx client/src/App.jsx client/src/views/Advisor.jsx
git commit -m "feat: add Advisor nav entry and route placeholder"
```

---

## Task 8: Build Advisor.jsx — session list panel

**Files:**
- Modify: `client/src/views/Advisor.jsx`

- [ ] **Step 1: Replace the placeholder with the full Advisor view**

Replace the contents of `client/src/views/Advisor.jsx` entirely:

```jsx
import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, MessageSquare, Check, X } from 'lucide-react';
import { api } from '../lib/api';
import Spinner from '../components/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(isoStr) {
  const d     = new Date(isoStr);
  const now   = new Date();
  const diffMs = now - d;
  const days  = Math.floor(diffMs / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SessionRow({ conv, isActive, onSelect, onDelete, onRename }) {
  const [editing, setEditing]   = useState(false);
  const [title, setTitle]       = useState(conv.title);
  const [confirming, setConfirm] = useState(false);
  const inputRef                = useRef(null);

  useEffect(() => { setTitle(conv.title); }, [conv.title]);

  function handleDoubleClick() {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitRename() {
    const trimmed = title.trim();
    if (trimmed && trimmed !== conv.title) onRename(conv.id, trimmed);
    else setTitle(conv.title);
    setEditing(false);
  }

  return (
    <div
      onClick={() => !editing && onSelect(conv.id)}
      className={`group relative flex flex-col px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-1 ${
        isActive
          ? 'bg-slate-700/60 border-l-2 border-teal-500'
          : 'hover:bg-slate-700/30 border-l-2 border-transparent'
      }`}
    >
      {editing ? (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  commitRename();
              if (e.key === 'Escape') { setTitle(conv.title); setEditing(false); }
            }}
            onBlur={commitRename}
            className="flex-1 bg-slate-600 text-slate-100 text-xs rounded px-1.5 py-0.5 outline-none border border-teal-500/50 min-w-0"
            autoFocus
          />
        </div>
      ) : (
        <p
          onDoubleClick={handleDoubleClick}
          className="text-xs font-medium text-slate-200 truncate pr-5 leading-snug"
        >
          {conv.title}
        </p>
      )}
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[10px] text-slate-500">{relativeDate(conv.updated_at)}</span>
        {conv.message_count > 0 && (
          <span className="text-[10px] text-slate-600">· {Math.floor(conv.message_count / 2)} msg{Math.floor(conv.message_count / 2) !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Delete button — hover only */}
      {!editing && (
        confirming ? (
          <div
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { onDelete(conv.id); setConfirm(false); }}
              className="p-0.5 rounded text-red-400 hover:bg-red-500/20"
              title="Confirm delete"
            >
              <Check size={11} />
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="p-0.5 rounded text-slate-400 hover:bg-slate-600"
              title="Cancel"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setConfirm(true); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-opacity"
            title="Delete conversation"
          >
            <Trash2 size={12} />
          </button>
        )
      )}
    </div>
  );
}

// ─── Chat panel and main view are in the next task ────────────────────────────

export default function Advisor() {
  const [conversations, setConversations] = useState([]);
  const [activeId,      setActiveId]      = useState(null);
  const [loadingConvs,  setLoadingConvs]  = useState(true);

  async function loadConversations() {
    try {
      const data = await api.getConversations();
      setConversations(data);
      return data;
    } catch {
      setConversations([]);
      return [];
    } finally {
      setLoadingConvs(false);
    }
  }

  useEffect(() => {
    loadConversations().then(data => {
      if (data.length > 0 && !activeId) setActiveId(data[0].id);
    });
  }, []);

  async function handleNew() {
    const conv = await api.createConversation();
    setConversations(prev => [conv, ...prev]);
    setActiveId(conv.id);
  }

  async function handleDelete(id) {
    await api.deleteConversation(id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeId === id) {
      const remaining = conversations.filter(c => c.id !== id);
      setActiveId(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  async function handleRename(id, title) {
    const updated = await api.patchConversation(id, { title });
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: updated.title } : c));
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Session list panel */}
      <div className="w-56 shrink-0 bg-slate-800/60 border-r border-slate-700 flex flex-col">
        <div className="px-3 py-3 border-b border-slate-700">
          <button
            onClick={handleNew}
            className="w-full btn-teal text-xs flex items-center justify-center gap-1.5"
          >
            <Plus size={13} /> New session
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loadingConvs ? (
            <div className="flex justify-center pt-6"><Spinner size={16} /></div>
          ) : conversations.length === 0 ? (
            <div className="text-center pt-8">
              <MessageSquare size={24} className="mx-auto text-slate-600 mb-2" />
              <p className="text-xs text-slate-500">No sessions yet</p>
            </div>
          ) : (
            conversations.map(conv => (
              <SessionRow
                key={conv.id}
                conv={conv}
                isActive={conv.id === activeId}
                onSelect={setActiveId}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))
          )}
        </div>
      </div>

      {/* Chat panel placeholder — replaced in Task 9 */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">
          {activeId ? `Chat for session ${activeId} goes here` : 'Select or create a session'}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `/advisor`. The left panel should show the sessions list with a "New session" button. Click "New session" — a new entry appears. Double-click its title to rename it. Hover over it to reveal the trash icon. Click trash, confirm deletion.

- [ ] **Step 3: Commit**

```bash
git add client/src/views/Advisor.jsx
git commit -m "feat: Advisor session list panel with create/rename/delete"
```

---

## Task 9: Build Advisor.jsx — full chat panel with typewriter

**Files:**
- Modify: `client/src/views/Advisor.jsx`

- [ ] **Step 1: Replace the entire file with the complete Advisor view**

This replaces the placeholder chat panel from Task 8 with the full implementation:

```jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, MessageSquare, Check, X, Send, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '../lib/api';
import Spinner from '../components/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(isoStr) {
  const d      = new Date(isoStr);
  const now    = new Date();
  const days   = Math.floor((now - d) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const SUGGESTIONS = [
  "What's the fastest way to clear my debt?",
  'If I got a pay rise, what difference would it make?',
  'Should I focus on my overdraft or credit card first?',
];

// ─── SessionRow ───────────────────────────────────────────────────────────────

function SessionRow({ conv, isActive, onSelect, onDelete, onRename }) {
  const [editing,    setEditing]   = useState(false);
  const [title,      setTitle]     = useState(conv.title);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setTitle(conv.title); }, [conv.title]);

  function commitRename() {
    const trimmed = title.trim();
    if (trimmed && trimmed !== conv.title) onRename(conv.id, trimmed);
    else setTitle(conv.title);
    setEditing(false);
  }

  return (
    <div
      onClick={() => !editing && onSelect(conv.id)}
      className={`group relative flex flex-col px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-1 ${
        isActive
          ? 'bg-slate-700/60 border-l-2 border-teal-500'
          : 'hover:bg-slate-700/30 border-l-2 border-transparent'
      }`}
    >
      {editing ? (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  commitRename();
              if (e.key === 'Escape') { setTitle(conv.title); setEditing(false); }
            }}
            onBlur={commitRename}
            className="flex-1 bg-slate-600 text-slate-100 text-xs rounded px-1.5 py-0.5 outline-none border border-teal-500/50 min-w-0"
            autoFocus
          />
        </div>
      ) : (
        <p
          onDoubleClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }}
          className="text-xs font-medium text-slate-200 truncate pr-5 leading-snug"
        >
          {conv.title}
        </p>
      )}
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[10px] text-slate-500">{relativeDate(conv.updated_at)}</span>
        {conv.message_count > 0 && (
          <span className="text-[10px] text-slate-600">
            · {Math.floor(conv.message_count / 2)} msg{Math.floor(conv.message_count / 2) !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!editing && (
        confirming ? (
          <div
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5"
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => { onDelete(conv.id); setConfirming(false); }}
              className="p-0.5 rounded text-red-400 hover:bg-red-500/20" title="Confirm delete">
              <Check size={11} />
            </button>
            <button onClick={() => setConfirming(false)}
              className="p-0.5 rounded text-slate-400 hover:bg-slate-600" title="Cancel">
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setConfirming(true); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-opacity"
            title="Delete conversation"
          >
            <Trash2 size={12} />
          </button>
        )
      )}
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ role, content }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'rounded-br-sm bg-blue-600/30 text-blue-100 border border-blue-500/20'
            : 'rounded-bl-sm bg-slate-700/60 text-slate-200 border border-slate-600/40'
        }`}
      >
        {content}
      </div>
    </div>
  );
}

// ─── ThinkingDots ─────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-slate-700/60 border border-slate-600/40 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        <span className="text-xs text-slate-400 italic mr-1">Claude is thinking</span>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block"
            style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

function ChatPanel({ conv, onContextToggle, onTitleUpdate }) {
  const [messages,      setMessages]      = useState([]);
  const [loadingMsgs,   setLoadingMsgs]   = useState(false);
  const [sending,       setSending]       = useState(false);
  const [input,         setInput]         = useState('');
  const [typewriter,    setTypewriter]    = useState(null); // { messageId, text, displayed }
  const [error,         setError]         = useState(null);
  const messagesEndRef  = useRef(null);
  const textareaRef     = useRef(null);
  const typewriterTimer = useRef(null);
  const hasMessages     = messages.length > 0 || sending;

  // Scroll to bottom whenever messages or typewriter text changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typewriter?.displayed, sending]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!conv?.id) return;
    setMessages([]);
    setTypewriter(null);
    setError(null);
    setInput('');
    clearInterval(typewriterTimer.current);
    setLoadingMsgs(true);
    api.getMessages(conv.id)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false));
  }, [conv?.id]);

  // Typewriter: reveal response word by word at ~30 words/sec
  useEffect(() => {
    if (!typewriter) return;

    typewriterTimer.current = setInterval(() => {
      setTypewriter(prev => {
        if (!prev) return null;
        const words         = prev.text.split(' ');
        const displayedWords = prev.displayed ? prev.displayed.split(' ') : [];
        if (displayedWords.length >= words.length) {
          clearInterval(typewriterTimer.current);
          return prev; // setTimeout in handleSend will clear this and set real content
        }
        // Reveal 2 words per tick (66ms × 2 words ≈ 30 words/sec)
        const next = words.slice(0, displayedWords.length + 2).join(' ');
        return { ...prev, displayed: next };
      });
    }, 66);

    return () => clearInterval(typewriterTimer.current);
  }, [typewriter?.messageId]); // re-run only when a new message starts, not on every tick

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);
    setError(null);
    textareaRef.current?.focus();

    try {
      const { userMessage, assistantMessage, newTitle } = await api.sendMessage(conv.id, text);

      // Add both messages; assistant message starts with empty content (typewriter fills it in)
      setMessages(prev => [...prev, userMessage, { ...assistantMessage, content: '' }]);

      // Start typewriter — track by messageId so we identify the right bubble precisely
      setTypewriter({ messageId: assistantMessage.id, text: assistantMessage.content, displayed: '' });

      // After the typewriter duration, replace the placeholder with the real content
      const wordCount  = assistantMessage.content.split(' ').length;
      const durationMs = Math.ceil(wordCount / 2) * 66 + 300;
      setTimeout(() => {
        setMessages(prev =>
          prev.map(m => m.id === assistantMessage.id ? assistantMessage : m)
        );
        setTypewriter(null);
      }, durationMs);

      if (newTitle) onTitleUpdate(conv.id, newTitle);
    } catch (err) {
      setError(err.message || 'Something went wrong — please try again.');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  // Overlay typewriter text onto the in-progress message, identified by ID
  const displayMessages = messages.map(m => {
    if (typewriter && m.id === typewriter.messageId) {
      return { ...m, content: typewriter.displayed };
    }
    return m;
  });

  const contextLocked = messages.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-slate-200 truncate mr-4">
          {conv.title}
        </h2>
        <button
          onClick={() => !contextLocked && onContextToggle(conv)}
          disabled={contextLocked}
          title={contextLocked ? 'Context is locked once conversation starts' : 'Toggle financial data context'}
          className={`flex items-center gap-2 text-xs transition-colors ${
            contextLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:text-slate-200'
          } ${conv.use_context ? 'text-teal-400' : 'text-slate-500'}`}
        >
          {conv.use_context
            ? <ToggleRight size={18} className="text-teal-400" />
            : <ToggleLeft  size={18} />
          }
          Use my financial data
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loadingMsgs ? (
          <div className="flex justify-center pt-8"><Spinner size={20} /></div>
        ) : displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <MessageSquare size={32} className="text-slate-600" />
            <p className="text-sm text-slate-500">Start a conversation</p>
            <p className="text-xs text-slate-600 max-w-xs">
              Ask anything about your finances — strategy, scenarios, or just thinking out loud.
            </p>
          </div>
        ) : (
          <>
            {displayMessages.map(m => (
              <MessageBubble key={m.id} role={m.role} content={m.content} />
            ))}
            {sending && !typewriter && <ThinkingDots />}
          </>
        )}
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pb-4 pt-2 border-t border-slate-700 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your finances…"
            rows={1}
            disabled={sending}
            className="flex-1 resize-none bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/50 disabled:opacity-50 leading-relaxed"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="btn-teal p-2.5 rounded-xl disabled:opacity-40 shrink-0"
            title="Send (Ctrl+Enter)"
          >
            {sending ? <Spinner size={16} /> : <Send size={16} />}
          </button>
        </div>

        {/* Subtle suggestions — only visible when input is empty */}
        {!hasMessages && !input && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="text-[11px] text-slate-600 border border-slate-700/50 rounded-full px-2.5 py-1 hover:text-slate-400 hover:border-slate-600 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-600 mt-1.5 text-right">Ctrl+Enter to send</p>
      </div>
    </div>
  );
}

// ─── Main Advisor view ────────────────────────────────────────────────────────

export default function Advisor() {
  const [conversations, setConversations] = useState([]);
  const [activeId,      setActiveId]      = useState(null);
  const [loadingConvs,  setLoadingConvs]  = useState(true);

  const activeConv = conversations.find(c => c.id === activeId) ?? null;

  async function loadConversations() {
    try {
      const data = await api.getConversations();
      setConversations(data);
      return data;
    } catch {
      setConversations([]);
      return [];
    } finally {
      setLoadingConvs(false);
    }
  }

  useEffect(() => {
    loadConversations().then(data => {
      if (data.length > 0) setActiveId(data[0].id);
    });
  }, []);

  async function handleNew() {
    const conv = await api.createConversation();
    setConversations(prev => [conv, ...prev]);
    setActiveId(conv.id);
  }

  async function handleDelete(id) {
    await api.deleteConversation(id);
    const remaining = conversations.filter(c => c.id !== id);
    setConversations(remaining);
    if (activeId === id) setActiveId(remaining.length > 0 ? remaining[0].id : null);
  }

  async function handleRename(id, title) {
    const updated = await api.patchConversation(id, { title });
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: updated.title } : c));
  }

  async function handleContextToggle(conv) {
    const updated = await api.patchConversation(conv.id, { useContext: conv.use_context === 0 });
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, use_context: updated.use_context } : c));
  }

  function handleTitleUpdate(id, newTitle) {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Session list */}
      <div className="w-56 shrink-0 bg-slate-800/60 border-r border-slate-700 flex flex-col">
        <div className="px-3 py-3 border-b border-slate-700">
          <button
            onClick={handleNew}
            className="w-full btn-teal text-xs flex items-center justify-center gap-1.5"
          >
            <Plus size={13} /> New session
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loadingConvs ? (
            <div className="flex justify-center pt-6"><Spinner size={16} /></div>
          ) : conversations.length === 0 ? (
            <div className="text-center pt-8">
              <MessageSquare size={24} className="mx-auto text-slate-600 mb-2" />
              <p className="text-xs text-slate-500">No sessions yet</p>
            </div>
          ) : (
            conversations.map(conv => (
              <SessionRow
                key={conv.id}
                conv={conv}
                isActive={conv.id === activeId}
                onSelect={setActiveId}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))
          )}
        </div>
      </div>

      {/* Chat */}
      {activeConv ? (
        <ChatPanel
          key={activeConv.id}
          conv={activeConv}
          onContextToggle={handleContextToggle}
          onTitleUpdate={handleTitleUpdate}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
          <MessageSquare size={40} className="text-slate-700" />
          <p className="text-slate-500 text-sm">No session selected</p>
          <button onClick={handleNew} className="btn-teal text-xs flex items-center gap-1.5 mt-1">
            <Plus size={13} /> Start a new session
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the bounce keyframe animation to `client/src/index.css` (or equivalent global CSS)**

Find the global CSS file (likely `client/src/index.css`) and add at the end:

```css
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-4px); opacity: 1; }
}
```

- [ ] **Step 3: Verify end-to-end in browser**

1. Navigate to `/advisor`
2. Click "New session" — session appears in left panel, empty chat on the right
3. The "Use my financial data" toggle is ON by default
4. The three subtle suggestion pills are visible below the input
5. Click a suggestion — it fills the input
6. Press Ctrl+Enter or click Send
7. A "Claude is thinking…" indicator appears with three bouncing dots
8. After 10-30 seconds, the response appears word-by-word (typewriter)
9. The session title in the left panel updates automatically
10. Start a second new session — both appear in the list, click between them without losing messages

- [ ] **Step 4: Commit**

```bash
git add client/src/views/Advisor.jsx client/src/index.css
git commit -m "feat: complete Advisor chat view with typewriter, sessions, and context toggle"
```

---

## Task 10: Final integration check

- [ ] **Step 1: Verify context snapshot is captured correctly**

Create a new session. Ensure the "Use my financial data" toggle is ON. Send a message. Then run:

```bash
sqlite3 finance.db "SELECT id, title, context_snapshot IS NOT NULL as has_snapshot FROM conversations;"
```

Expected: `1|<auto-title>|1` — the snapshot column is populated after the first message.

- [ ] **Step 2: Verify toggle locks after first message**

In the UI, send one message in a conversation. Confirm the "Use my financial data" toggle is greyed out and unclickable.

Run the API directly to confirm the 409 response:

```bash
curl -s -X PATCH http://localhost:3001/api/advisor/conversations/1 \
  -H "Content-Type: application/json" \
  -d '{"useContext":false}' | python -m json.tool
# Expected: {"error":"Cannot change context setting after conversation has started"}
```

- [ ] **Step 3: Verify soft delete**

Delete a session in the UI. Then run:

```bash
sqlite3 finance.db "SELECT id, title, deleted_at FROM conversations;"
```

Expected: the deleted session has a `deleted_at` timestamp but still exists in the DB. The UI no longer shows it.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Financial Advisor Chat — complete implementation"
```
