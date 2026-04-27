# Strategy Card Redesign

**Date:** 2026-04-17  
**Status:** Approved

## Context

The "Recommended Strategy" and "Strategy Comparison" sections currently occupy a large two-card row at the very top of plan results — a `lg:col-span-2` card with a dominant teal `<h3>` heading and a full comparison table. This is the most visually prominent element on the page despite being secondary information. The user wants to reduce visual noise while keeping the strategy information accessible.

## Goal

Demote the strategy UI from "dominant call-out" to "quiet stat" — always visible, never demanding. The comparison data remains accessible on demand.

---

## Design

### Strategy stat card

Replace the existing two-card strategy row with a single peer card added to the existing summary stats row (Debt-Free Date · Payoff Duration · Total Interest).

The card reads:

```
STRATEGY
Avalanche
saves £340  ·  see comparison ↓
```

- **Title:** `STRATEGY` — same `text-xs uppercase tracking-wider text-slate-400` label as the other stat cards
- **Strategy name:** `text-lg font-semibold text-teal-400` — same weight as "Debt-Free Date" value, no larger
- **Third line (single line):** savings figure and expand link sit together — `saves £340 · see comparison ↓`. This keeps the card to three lines, matching the visual height of the other stat cards and preserving the rhythm of the stats row.
  - Savings text: `text-xs text-slate-400` — e.g. `saves £340` (difference in totalInterest). If equal, `same cost`. If `plan.comparison` is null or either strategy's data is missing, show only `see comparison ↓` with no savings prefix.
  - Separator: `·` in `text-xs text-slate-600`
  - Expand link: `text-xs text-slate-500 hover:text-slate-300 underline cursor-pointer` — `see comparison ↓` / `see comparison ↑`

### Comparison reveal

When the expand link is clicked, a comparison table appears/disappears (no animation) **beneath the entire stats row** (full width, `card p-4 mt-2`), not inside the card itself. This avoids breaking the uniform card height in the stats row.

The table is the same Avalanche vs Snowball table that exists today (debt-free date + total interest), just repositioned.

Collapse state persists in `localStorage` under the key `plan_strategy_open` (default: `false` — collapsed). This is intentional — unlike the other collapsible sections which default open, the comparison table is secondary detail and should not appear on first load.

### Mobile behaviour

The stats row uses a dynamic `grid-cols` count. On small screens (below `lg`) all cards already stack to a single column via Tailwind's responsive grid. The Strategy card participates in that same stack naturally — no special handling needed.

### Removed

- The `{/* Strategy recommendation */}` block — the `lg:col-span-2` card with strategy name + reason paragraph and the standalone comparison card, plus their `grid-cols-1 lg:grid-cols-3` wrapper
- The standalone "Strategy Comparison" card

The `recommendation.reason` text is **dropped from the UI** — it added verbosity without decision-relevant value. The savings figure is the reason.

---

## Files to modify

- `client/src/views/Plan.jsx`
  - Remove the `{/* Strategy recommendation */}` block (find by that comment)
  - Add `strategyOpen` state via `useLocalStorage('plan_strategy_open', false)`
  - Extend the summary stats grid to include the new Strategy card — update the dynamic `grid-cols` count from `plan.emergencyFund ? 4 : 3` to `plan.emergencyFund ? 5 : 4`
  - Add the conditional comparison reveal block beneath the stats row

---

## Data available

`plan.recommendation.strategy` — `"avalanche"` or `"snowball"`  
`plan.comparison.avalanche.totalInterest` and `plan.comparison.snowball.totalInterest` — used to compute savings  
`plan.comparison.avalanche.debtFreeDate` and `plan.comparison.snowball.debtFreeDate` — used in comparison table

---

## Verification

1. Run `npm run dev`, navigate to Plan page, generate a plan
2. Confirm the old two-card strategy row is gone
3. Confirm the stats row now has 4 (or 5 with emergency fund) cards including Strategy
4. Confirm the savings figure is correct (difference between the two `totalInterest` values)
5. Confirm clicking "see comparison ↓" reveals the comparison table beneath the stats row and "see comparison ↑" collapses it
6. Confirm collapse state persists across page navigation and refresh
7. Confirm at a narrow viewport the Strategy card stacks correctly with the other stat cards
