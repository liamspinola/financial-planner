# Financial Advisor Chat — Design Spec

**Date:** 2026-04-14  
**Status:** Approved  

## Problem

The app calculates and displays a payoff plan but has no conversational layer. Users can't ask "what if I do X?" in natural language, explore scenarios, or get advice tailored to their specific situation. The existing AI modes (A/B/C) generate a static narrative — they are one-shot, not interactive.

## Goal

A dedicated Advisor page where the user can have multi-turn conversations with Claude about their finances. Sessions are persistent, browseable, and historically coherent. The experience should feel like chatting with a knowledgeable adviser, not waiting for a document to generate.

---

## Constraints

- Claude CLI only (no Anthropic API key available). No streaming.
- Existing stack: React 19, Express 5, SQLite (WAL mode, better-sqlite3).
- Must integrate cleanly with existing codebase patterns.

---

## Data Model

Two new tables, added as a numbered migration in `server/db/database.js`.

```sql
-- PRAGMA foreign_keys = ON must be set in the DB initialiser (add if not present)

CREATE TABLE conversations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL DEFAULT 'New conversation',
  use_context      INTEGER NOT NULL DEFAULT 1 CHECK (use_context IN (0, 1)),
  context_snapshot TEXT,    -- JSON: financial state at session start (only when use_context=1)
  summary          TEXT,    -- rolling summary of messages older than the last 6 (for history trimming)
  deleted_at       TEXT,    -- NULL = active; soft delete
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_conversations_active
  ON conversations (updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  INTEGER NOT NULL
                   REFERENCES conversations (id) ON DELETE CASCADE,
  role             TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT    NOT NULL,
  sequence         INTEGER NOT NULL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (conversation_id, sequence)
);

CREATE INDEX idx_messages_conv_seq
  ON messages (conversation_id, sequence);
```

### Key decisions

**`use_context` per conversation, not global.**  
Different sessions have different purposes. Global toggle loses per-session intent. The global `settings` value (`advisor_use_context`) is just the default for new conversations.

**Context snapshot on first message send.**  
When `use_context = 1` and the first message is sent, snapshot the financial state as formatted text and store it on the conversation. The toggle is freely changeable until that point, then locks. This keeps old sessions historically coherent — advice from three months ago reads correctly against the finances that existed then, not today's numbers. Conversations created but never messaged carry no snapshot and cost nothing.

**`sequence` for message ordering.**  
Explicit integer sequence per conversation. Deterministic and queryable. Never rely on `id` or `created_at` ordering within a conversation.

**Soft delete on conversations.**  
`deleted_at` nullable timestamp. Hard cascade on messages (messages have no independent existence). Accidental deletions are recoverable.

**`summary` column for history trimming.**  
Stores a rolling summary of messages beyond the last 6. Regenerated every 6 messages. Keeps CLI prompts lean regardless of conversation length.

---

## Backend

### New file: `server/routes/advisor.js`

Mounted at `/api/advisor` in `server/index.js`.

#### Conversation endpoints

```
GET    /api/advisor/conversations          List active conversations, ordered by updated_at DESC
POST   /api/advisor/conversations          Create new conversation
PATCH  /api/advisor/conversations/:id      Rename title (user-initiated)
DELETE /api/advisor/conversations/:id      Soft delete (sets deleted_at = datetime('now'))
```

`POST /conversations` creates the row with `use_context = 1` by default. No snapshot is taken yet — the user can still toggle context before sending their first message.

#### Message endpoints

```
GET    /api/advisor/conversations/:id/messages   All messages ordered by sequence
POST   /api/advisor/conversations/:id/messages   Send message, receive reply
```

#### `POST /messages` flow

1. Validate conversation exists and `deleted_at IS NULL`
2. Determine next sequence: `seq = MAX(sequence) + 1` (or 1 if no messages yet)
3. If `seq === 1` and `use_context = 1`: build and store `context_snapshot` now (first message send is when the toggle locks)
4. Insert user message at `seq`
5. Build prompt via `buildAdvisorPrompt()` (see Engine section)
6. Call Claude CLI, await full response
7. Insert assistant message at `seq + 1`
8. If `seq === 1`: fire second lightweight CLI call to generate a 4–6 word session title; update `conversations.title`
9. If total message count is now a multiple of 6 and > 6: regenerate `summary` from all messages before the last 6, via a third CLI call
10. Update `conversations.updated_at = datetime('now')`
11. Return `{ userMessage, assistantMessage, titleUpdated? }`
8. Update `conversations.updated_at = datetime('now')`
9. Return `{ userMessage, assistantMessage, titleUpdated? }`

All three potential CLI calls (reply, title, summary) complete server-side before the response is sent. Single round trip from the client's perspective.

---

## Engine

### New file: `server/engine/advisor.js`

Single exported function: `buildAdvisorPrompt(conversation, messages, financialContext)`.

Keeping prompt construction out of the route handler makes it independently testable and keeps the route thin.

#### System prompt (always included)

```
You are a friendly, experienced UK financial adviser. Give clear, specific, 
actionable advice. Keep responses conversational — short paragraphs, bullet 
points where helpful. Never give generic disclaimers. The user's financial 
data is real and current. Always respond in British English.
```

#### Context block (when `use_context = 1`)

Pre-formatted human-readable summary derived from the stored `context_snapshot`:

```
FINANCIAL SNAPSHOT (as of [date]):
- Monthly take-home: £X
- Monthly surplus after bills and minimums: £X
- Total debt: £X across N accounts
  · [Debt name] — £X @ X% APR (minimum £X/mo)
  ...
- Current plan: [strategy], debt-free [date], £X total interest
```

#### History management

- Last 6 messages included verbatim as `User:` / `Assistant:` turns
- If `conversation.summary` is set, prepend: `"Earlier in this conversation: [summary]"`
- Prompt stays lean regardless of conversation length

---

## Frontend

### New view: `client/src/views/Advisor.jsx`

Added to sidebar navigation between Plan and Progress.

### Layout

Two-column split:

**Left panel (session list, fixed width ~220px):**
- "New session" button at top (creates conversation, navigates to it)
- Each row: session title, relative date ("Today", "3 days ago"), message count
- Active session: teal left border
- Double-click title to rename inline (PATCH on blur/Enter)
- Hover reveals trash icon → soft delete with confirmation

**Right panel (chat, flex-fill):**
- Header: session title + "Use my financial data" toggle (reflects `use_context`, freely toggleable until the first message is sent — locks after that, since the context snapshot is captured on first send)
- Messages area: user messages right-aligned (blue), assistant left-aligned (slate). Timestamps on hover only
- Thinking state: three animated dots while awaiting CLI response
- Typewriter reveal: once response arrives, play it out at ~30 words/second via `setInterval`. Fast enough to feel alive; slow enough to read
- Input: auto-growing textarea, submits on `Cmd/Ctrl+Enter` or send button
- Subtle suggestions: 3 greyed-out pill prompts below input, only visible when input is empty, disappear on first keypress

### Suggested starter prompts (subtle, below input when empty)

```
What's the fastest way to clear my debt?
If I got a pay rise, what difference would it make?
Should I focus on my overdraft or credit card first?
```

### State management

Local `useState` in `Advisor.jsx`. No global state. Sessions and messages fetched from API. Current conversation messages held in component state; switching sessions replaces the array.

---

## Files Created / Modified

| File | Change |
|------|--------|
| `server/db/database.js` | Add migration for `conversations` + `messages` tables; add `PRAGMA foreign_keys = ON` |
| `server/routes/advisor.js` | New — all advisor endpoints |
| `server/engine/advisor.js` | New — `buildAdvisorPrompt()` |
| `server/index.js` | Mount `/api/advisor` router |
| `client/src/views/Advisor.jsx` | New — full Advisor page |
| `client/src/lib/api.js` | Add advisor API methods |
| `client/src/components/Sidebar.jsx` | Add Advisor nav entry |

---

## Error Handling

- Claude CLI timeout (>60s): return 504, display "Claude took too long — try again" in chat
- CLI exit non-zero: return 502, display error inline in chat (don't crash the conversation)
- Conversation not found or soft-deleted: 404
- Sending message to a conversation after it's been deleted client-side: refresh session list

---

## What This Is Not

- No streaming (CLI constraint)
- No message editing or regeneration
- No export / copy conversation
- No per-message feedback (thumbs up/down)

These are all addable later without schema changes.
