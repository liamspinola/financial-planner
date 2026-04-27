# Strategy Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dominant two-card strategy row with a quiet peer card in the stats row, with the comparison table accessible on demand via an inline expand link.

**Architecture:** Single-file UI change in `Plan.jsx`. The existing `useLocalStorage` hook (already defined in the file) handles persistence. The existing stats grid is extended with a Strategy card; the comparison table moves to a collapsible block beneath the stats row.

**Tech Stack:** React, Tailwind CSS, localStorage

---

## File Map

| File | Change |
|------|--------|
| `client/src/views/Plan.jsx` | Remove strategy recommendation block; add `strategyOpen` state; add Strategy card to stats grid; add comparison reveal |

No new files. No new dependencies.

---

### Task 1: Remove the strategy recommendation block

**Files:**
- Modify: `client/src/views/Plan.jsx`

- [ ] **Step 1: Open `client/src/views/Plan.jsx` and locate the block to remove**

Find the comment `{/* Strategy recommendation */}`. The block runs from there through the closing `</div>` of the `grid grid-cols-1 lg:grid-cols-3` wrapper — it contains the `lg:col-span-2` recommended strategy card and the standalone comparison card.

- [ ] **Step 2: Delete the entire strategy recommendation block**

Remove this entire section (find by the opening comment):

```jsx
{/* Strategy recommendation */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
  <div className="lg:col-span-2 card p-5">
    <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Recommended Strategy</p>
    <h3 className="text-xl font-semibold text-teal-400 mb-2 capitalize">{plan.recommendation?.strategy} Method</h3>
    <p className="text-sm text-slate-300 leading-relaxed">{plan.recommendation?.reason}</p>
  </div>
  <div className="card p-5 overflow-hidden">
    <p className="text-xs uppercase tracking-wider text-slate-400 mb-3">Strategy Comparison</p>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-500">
          <th className="text-left pb-2"></th>
          <th className="text-right pb-2">Avalanche</th>
          <th className="text-right pb-2">Snowball</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-700/50">
        <tr>
          <td className="py-1.5 text-slate-400">Debt-free</td>
          <td className="py-1.5 text-right tabular-nums text-slate-200">{plan.comparison?.avalanche?.debtFreeDate}</td>
          <td className="py-1.5 text-right tabular-nums text-slate-200">{plan.comparison?.snowball?.debtFreeDate}</td>
        </tr>
        <tr>
          <td className="py-1.5 text-slate-400">Total interest</td>
          <td className="py-1.5 text-right tabular-nums text-slate-200">{gbp(plan.comparison?.avalanche?.totalInterest)}</td>
          <td className="py-1.5 text-right tabular-nums text-slate-200">{gbp(plan.comparison?.snowball?.totalInterest)}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

- [ ] **Step 3: Verify the app still renders without error**

Run: `npm run dev` (from project root)  
Navigate to the Plan page and generate a plan. The strategy section should simply be gone. No console errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/views/Plan.jsx
git commit -m "refactor: remove dominant strategy recommendation block"
```

---

### Task 2: Add `strategyOpen` localStorage state

**Files:**
- Modify: `client/src/views/Plan.jsx`

- [ ] **Step 1: Add the `strategyOpen` state alongside the other collapsible states**

Find this block (the collapsible section state declarations):

```js
// Collapsible section state
const [whatIfOpen, setWhatIfOpen] = useLocalStorage('plan_whatif_open', true);
const [chartOpen, setChartOpen] = useLocalStorage('plan_chart_open', true);
const [aiOpen, setAiOpen] = useLocalStorage('plan_ai_open', true);
const [budgetTipsOpen, setBudgetTipsOpen] = useLocalStorage('plan_budget_open', true);
const [guideOpen, setGuideOpen] = useLocalStorage('plan_guide_open', true);
```

Add one line at the top of that block:

```js
// Collapsible section state
const [strategyOpen, setStrategyOpen] = useLocalStorage('plan_strategy_open', false);
const [whatIfOpen, setWhatIfOpen] = useLocalStorage('plan_whatif_open', true);
const [chartOpen, setChartOpen] = useLocalStorage('plan_chart_open', true);
const [aiOpen, setAiOpen] = useLocalStorage('plan_ai_open', true);
const [budgetTipsOpen, setBudgetTipsOpen] = useLocalStorage('plan_budget_open', true);
const [guideOpen, setGuideOpen] = useLocalStorage('plan_guide_open', true);
```

Note: `false` is intentional — this section defaults collapsed, unlike the others.

- [ ] **Step 2: Commit**

```bash
git add client/src/views/Plan.jsx
git commit -m "feat: add strategyOpen localStorage state (defaults collapsed)"
```

---

### Task 3: Add Strategy card to the summary stats row

**Files:**
- Modify: `client/src/views/Plan.jsx`

- [ ] **Step 1: Compute the savings figure above the stats grid**

Find the `{/* Summary stats */}` comment. Directly above the `<div className={`grid gap-4 mb-6 ...`}>` line, add this derived value:

```jsx
{/* Summary stats */}
{(() => {
  // derived inline so no extra state needed
})()} 
```

Actually, derive it as a variable inside the JSX using a fragment. The cleanest approach is to compute it before the return or in a `useMemo`. Add this alongside the other `useMemo`/derived values near the top of the component (after the `monthDateMap` useMemo):

```js
const strategySavings = useMemo(() => {
  const a = plan?.comparison?.avalanche?.totalInterest;
  const s = plan?.comparison?.snowball?.totalInterest;
  if (a == null || s == null) return null;
  return Math.round(Math.abs(a - s));
}, [plan?.comparison]);
```

- [ ] **Step 2: Update the stats grid `grid-cols` count**

Find:

```jsx
<div className={`grid gap-4 mb-6 ${plan.emergencyFund ? 'grid-cols-4' : 'grid-cols-3'}`}>
```

Replace with:

```jsx
<div className={`grid gap-4 mb-6 ${plan.emergencyFund ? 'grid-cols-5' : 'grid-cols-4'}`}>
```

- [ ] **Step 3: Add the Strategy card as the last card in the stats row**

The stats row currently ends with the optional emergency fund card. Add the Strategy card after it (still inside the same grid `<div>`):

```jsx
<div className="card p-4 text-center">
  <p className="text-xs text-slate-400 mb-1">Strategy</p>
  <p className="text-lg font-semibold text-teal-400 capitalize">{plan.recommendation?.strategy}</p>
  <p className="text-xs mt-1">
    {strategySavings != null && strategySavings > 0 && (
      <span className="text-slate-400">saves {gbp(strategySavings)} </span>
    )}
    {strategySavings != null && strategySavings === 0 && (
      <span className="text-slate-400">same cost </span>
    )}
    {strategySavings != null && strategySavings > 0 && (
      <span className="text-slate-600">· </span>
    )}
    <button
      onClick={() => setStrategyOpen(o => !o)}
      className="text-slate-500 hover:text-slate-300 underline cursor-pointer"
    >
      see comparison {strategyOpen ? '↑' : '↓'}
    </button>
  </p>
</div>
```

- [ ] **Step 4: Verify the stats row renders correctly**

Run: `npm run dev`, generate a plan. Confirm:
- Stats row now shows 4 cards (or 5 with emergency fund)
- Strategy card shows the strategy name in teal
- Savings figure appears (or not, if equal)
- "see comparison ↓" link is visible and underlined
- Card height matches the other stat cards

- [ ] **Step 5: Commit**

```bash
git add client/src/views/Plan.jsx
git commit -m "feat: add Strategy stat card to summary stats row"
```

---

### Task 4: Add the comparison reveal beneath the stats row

**Files:**
- Modify: `client/src/views/Plan.jsx`

- [ ] **Step 1: Add the comparison table block immediately after the closing `</div>` of the stats grid**

Find the closing `</div>` that ends the stats grid (it comes just before `{/* What-If panel */}`). Insert this block between them:

```jsx
{strategyOpen && (
  <div className="card p-4 mb-6">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-500">
          <th className="text-left pb-2"></th>
          <th className="text-right pb-2">Avalanche</th>
          <th className="text-right pb-2">Snowball</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-700/50">
        <tr>
          <td className="py-1.5 text-slate-400">Debt-free</td>
          <td className="py-1.5 text-right tabular-nums text-slate-200">{plan.comparison?.avalanche?.debtFreeDate}</td>
          <td className="py-1.5 text-right tabular-nums text-slate-200">{plan.comparison?.snowball?.debtFreeDate}</td>
        </tr>
        <tr>
          <td className="py-1.5 text-slate-400">Total interest</td>
          <td className="py-1.5 text-right tabular-nums text-slate-200">{gbp(plan.comparison?.avalanche?.totalInterest)}</td>
          <td className="py-1.5 text-right tabular-nums text-slate-200">{gbp(plan.comparison?.snowball?.totalInterest)}</td>
        </tr>
      </tbody>
    </table>
  </div>
)}
```

- [ ] **Step 2: Verify expand/collapse behaviour**

Run: `npm run dev`, generate a plan.
- By default the comparison table should NOT be visible
- Click "see comparison ↓" — table appears beneath the stats row, link changes to "see comparison ↑"
- Click again — table disappears
- Navigate away to another page and back — state persists (collapsed if you left it collapsed)
- Refresh the page — state persists

- [ ] **Step 3: Commit**

```bash
git add client/src/views/Plan.jsx
git commit -m "feat: add collapsible comparison table beneath strategy stat card"
```

---

## Final Verification Checklist

- [ ] Old two-card strategy row is gone (no `Recommended Strategy` heading, no `Strategy Comparison` card)
- [ ] Stats row shows 4 cards (5 with emergency fund), Strategy card is last
- [ ] Strategy name is `text-lg font-semibold text-teal-400 capitalize` — same visual weight as other stat values
- [ ] Savings line shows correct £ difference between strategies (or "same cost" if equal, or nothing if data missing)
- [ ] "see comparison ↓/↑" is underlined, toggles the table, persists via localStorage
- [ ] Comparison table appears full-width beneath stats row (not inside the card)
- [ ] At narrow viewport (< 768px) Strategy card stacks correctly with the other stat cards
- [ ] No console errors
