'use strict';

const express = require('express');
const router = express.Router();
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');

/**
 * Resolve the Claude CLI executable path.
 * Checks the Windows desktop app install (versioned directory), then npm global,
 * then falls back to 'claude' (assumes it's in PATH).
 */
function findClaudeExe() {
  // 1. Desktop app (Windows Store / MSIX package) — pick the highest version dir
  const desktopBase = path.join(
    process.env.LOCALAPPDATA || '',
    'Packages',
    'Claude_pzs8sxrjxfjjc',
    'LocalCache',
    'Roaming',
    'Claude',
    'claude-code'
  );
  if (fs.existsSync(desktopBase)) {
    const versions = fs.readdirSync(desktopBase).sort().reverse();
    for (const v of versions) {
      const exe = path.join(desktopBase, v, 'claude.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }

  // 2. npm global install (claude.cmd)
  const npmCmd = path.join(process.env.APPDATA || '', 'npm', 'claude.cmd');
  if (fs.existsSync(npmCmd)) return npmCmd;

  // 3. Fallback — rely on system PATH
  return 'claude';
}

const CLAUDE_EXE = findClaudeExe();
console.log('[AI] Claude CLI resolved to:', CLAUDE_EXE);

function buildPrompt(data, mode) {
  const { summary, debts, tranches, income, expenses, recommendation, comparison } = data;

  const debtList = debts.map(d => {
    const dTranches = tranches.filter(t => t.debt_id === d.id);
    const trancheDesc = dTranches.map(t => {
      const aprPct = (t.apr * 100).toFixed(1);
      const promoNote = t.promo_end_date ? ` (0% promo until ${t.promo_end_date})` : '';
      return `${t.label}: £${t.balance.toFixed(0)} @ ${aprPct}% APR${promoNote}`;
    }).join(', ');
    return `- ${d.name}: ${trancheDesc} | Min payment: £${d.minimum_payment}/month`;
  }).join('\n');

  const stratLabel = recommendation.strategy === 'avalanche' ? 'Avalanche (highest APR first)' : 'Snowball (lowest balance first)';
  const altLabel = recommendation.strategy === 'avalanche' ? 'Snowball' : 'Avalanche';
  const winComp = comparison[recommendation.strategy];
  const altComp = comparison[recommendation.strategy === 'avalanche' ? 'snowball' : 'avalanche'];

  let prompt = `You are an experienced UK financial adviser. Analyse this person's financial position and write a clear, encouraging payoff plan explanation.

FINANCIAL SUMMARY:
- Monthly take-home income: £${summary.totalIncome.toFixed(0)}
- Monthly essential expenses: £${summary.essentialExpenses.toFixed(0)}
- Monthly discretionary expenses: £${summary.discretionaryExpenses.toFixed(0)}
- Monthly surplus after expenses: £${summary.surplusAfterExpenses.toFixed(0)}
- Monthly surplus after all debt minimums: £${summary.availableForDebt.toFixed(0)}

DEBTS (${stratLabel} order recommended):
${debtList}

PAYOFF PROJECTION:
- Recommended strategy: ${stratLabel}
- Debt-free date: ${winComp.debtFreeDate}
- Total interest: £${winComp.totalInterest.toFixed(0)}
- Alternative (${altLabel}): debt-free ${altComp.debtFreeDate}, total interest £${altComp.totalInterest.toFixed(0)}`;

  if (mode === 'C') {
    // Top discretionary categories by spend
    const discMap = {};
    for (const e of expenses) {
      if (!e.is_essential) {
        discMap[e.category] = (discMap[e.category] || 0) + e.amount;
      }
    }
    const topDisc = Object.entries(discMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, amt]) => `- ${cat}: £${amt.toFixed(0)}/month`)
      .join('\n');

    if (topDisc) {
      prompt += `\n\nTOP DISCRETIONARY SPENDING:
${topDisc}`;
    }

    prompt += `

Write:
1. A 3-paragraph plain-English explanation of the plan and why this strategy was chosen. Tone: experienced, direct, encouraging. No jargon. No bullet points in the paragraphs.
2. A bullet list of 3-5 specific budget recommendations with exact £ amounts and their impact on payoff speed. Focus on highest-leverage cuts only. Format each as: "• [Category]: Cut from £X to £Y/month — saves £Z in interest / speeds up payoff by N months"`;
  } else {
    prompt += `

Write a 3-paragraph plain-English explanation of this payoff plan and why this strategy was recommended. Tone: experienced, direct, encouraging. No jargon.`;
  }

  return prompt;
}

/**
 * Parse Claude's response into narrative and budget tips sections.
 */
function parseResponse(text, mode) {
  if (mode !== 'C') {
    return { narrative: text.trim(), budgetTips: null };
  }

  // Split on the bullet list section
  const bulletStart = text.search(/\n[•\-\*] /);
  if (bulletStart === -1) {
    return { narrative: text.trim(), budgetTips: null };
  }

  const narrative = text.slice(0, bulletStart).trim();
  const budgetTips = text.slice(bulletStart).trim();
  return { narrative, budgetTips };
}

// POST /api/ai — generate AI narrative, with caching
router.post('/', (req, res) => {
  const { mode = 'C' } = req.body;
  if (!['A', 'B', 'C'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
  if (mode === 'A') return res.json({ narrative: null, budgetTips: null, cached: false });

  const db = getDb();
  const debts    = db.prepare('SELECT * FROM debts').all();
  const tranches = db.prepare('SELECT * FROM tranches').all();
  const income   = db.prepare('SELECT * FROM income_sources').all();
  const expenses = db.prepare('SELECT * FROM expenses').all();

  if (debts.length === 0) return res.status(400).json({ error: 'No data to analyse' });

  // Check cache
  const inputHash = crypto.createHash('sha256')
    .update(JSON.stringify({ debts, tranches, income, expenses, mode }))
    .digest('hex');

  const cached = db.prepare('SELECT * FROM plan_cache WHERE id = 1').get();
  if (cached && cached.input_hash === inputHash && cached.ai_mode === mode && cached.ai_narrative) {
    return res.json({
      narrative: cached.ai_narrative,
      budgetTips: cached.ai_budget_tips || null,
      cached: true,
    });
  }

  // Need the plan result for the prompt
  const planCached = db.prepare('SELECT calc_result FROM plan_cache WHERE id = 1').get();
  if (!planCached) return res.status(400).json({ error: 'Generate the plan first before requesting AI analysis' });

  const planResult = JSON.parse(planCached.calc_result);
  const promptData = {
    summary: planResult.summary,
    debts,
    tranches,
    income,
    expenses,
    recommendation: planResult.recommendation,
    comparison: planResult.comparison,
  };

  const prompt = buildPrompt(promptData, mode);

  // Call Claude CLI using the resolved full path to the executable.
  const result = spawnSync(CLAUDE_EXE, ['-p', prompt], {
    timeout: 180000, // 3 minutes — Claude CLI can be slow on first call
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    shell: CLAUDE_EXE.endsWith('.cmd'),
  });

  if (result.error) {
    console.error('Claude CLI error:', result.error);
    return res.status(502).json({ error: 'Claude CLI unavailable: ' + result.error.message });
  }
  if (result.status !== 0) {
    console.error('Claude CLI stderr:', result.stderr);
    return res.status(502).json({ error: 'Claude CLI returned non-zero exit: ' + (result.stderr || '') });
  }

  const { narrative, budgetTips } = parseResponse(result.stdout, mode);

  // Update cache with AI content
  db.prepare(`
    UPDATE plan_cache SET ai_narrative = ?, ai_budget_tips = ?, ai_mode = ?, input_hash = ?, generated_at = datetime('now')
    WHERE id = 1
  `).run(narrative, budgetTips || null, mode, inputHash);

  res.json({ narrative, budgetTips, cached: false });
});

module.exports = router;
