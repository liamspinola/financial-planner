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
      conv.context_snapshot = snapshot;
    }
  }

  // Insert user message
  db.prepare(
    `INSERT INTO messages (conversation_id, role, content, sequence) VALUES (?, 'user', ?, ?)`
  ).run(conv.id, content.trim(), userSeq);

  const userMessage = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? AND sequence = ?'
  ).get(conv.id, userSeq);

  // Fetch last ≤6 messages for prompt (includes the user message just inserted)
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

  // Regenerate rolling summary every 6 messages (at total counts 8, 14, 20...)
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
