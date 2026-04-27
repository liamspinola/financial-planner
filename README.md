# Liam's Wicked Financial Planner Tool

A full-stack debt payoff planner for the UK. Enter your debts, income, and expenses to get a month-by-month payoff plan using the Avalanche or Snowball strategy, with optional AI-generated narrative via Claude.

## Features

### Debt Management
- Track multiple accounts with **multi-tranche support** (e.g. 0% promo + standard rate on the same card)
- **Promotional rate tracking** — automatic APR conversion on expiry with 60-day dashboard alerts
- **Percentage-based minimum payments** — model credit card minimums as `MAX(floor, balance × %)` for accurate declining minimums as balances fall
- **Debt notes** — free-text memo per account for lender numbers, balance transfer references, or reminders

### Budget Tracking
- Log income sources with frequency conversion (weekly, fortnightly, 4-weekly, monthly, annual)
- Categorised expenses with essential vs discretionary classification
- **Emergency fund goal** — set a savings target; the plan redirects extra payments to savings first until the fund is built (following MoneyHelper/StepChange guidance)
- **Monthly Review tab** — log actual spending per category, see budgeted vs actual variances, and get an impact estimate ("X extra days on your payoff date")

### Payoff Simulation
- Month-by-month amortisation engine comparing **Avalanche vs Snowball** strategies
- **FCA-compliant payment allocation** — all payments prioritise the highest-APR tranche first (CONC 6.7)
- **Windfall / lump sum payments** — schedule one-off payments (bonuses, tax rebates) in a specific month; the simulator applies them to the target debt and marks them in the action guide
- **What-If extra payment slider** — see how much sooner you'd be debt-free and how much interest you'd save by paying an extra £X/month, without touching your real budget
- SHA-256 hash-based plan caching avoids redundant recalculation

### Plan & Guidance
- Strategy recommendation with plain-English reasoning (interest saved, speed, psychological quick wins)
- Side-by-side Avalanche vs Snowball comparison table
- Month-by-month **action guide** with payment amounts, debt payoff milestones, promo expiry warnings, halfway marker, and windfall callouts
- Balance-over-time chart (print/PDF optimised)
- **AI analysis** — optional plan narration and budget recommendations via Claude CLI

### Progress Tracking
- Record actual monthly balances per debt
- Compound chart overlays your **plan projection** (dashed) against **recorded actuals** (solid)
- "vs plan" indicator showing how many £ ahead or behind you are

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Recharts |
| Backend | Node.js, Express 5, better-sqlite3 |
| Database | SQLite (WAL mode) |
| AI | Claude CLI (subprocess) |

## Getting Started

### Prerequisites

- Node.js 18+
- (Optional) [Claude CLI](https://claude.ai/code) installed for AI analysis

### Installation

```bash
npm run install:all
```

### Configuration

Copy `.env.example` to `.env` in the project root and adjust as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | API server port |
| `CLIENT_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `DB_PATH` | `finance.db` (project root) | Path to the SQLite database file |

### Running

```bash
# Start both frontend (port 3000) and backend (port 3001)
npm start

# Start individually
npm run server   # API only
npm run client   # Frontend only
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Debts** — Add each debt account. Split balances into segments if you have a promo rate alongside a standard rate. Use "% of balance" minimum if your card charges a percentage rather than a fixed amount.
2. **Budget** — Add income sources and expenses. Set an emergency fund target if you want to build a buffer before accelerating debt payoff.
3. **Plan** — Optionally add windfall payments, then click "Generate Plan". Use the What-If slider to explore scenarios without changing your real data. Choose an AI mode before generating if you want a narrative.
4. **Progress** — Each month, record your actual balances to see how you track against the plan.
5. **Dashboard** — Overview of total debt, income, payoff timeline, and upcoming promo expirations.

## Project Structure

```
financial-planner/
├── client/                  # React + Vite frontend
│   └── src/
│       ├── components/      # Shared UI components (Sidebar, StatCard, ChartTooltip, …)
│       ├── views/           # Page-level components
│       │   ├── Dashboard.jsx
│       │   ├── Debts.jsx
│       │   ├── Budget.jsx   # Includes Monthly Review tab
│       │   ├── Plan.jsx     # Includes What-If panel and Windfalls section
│       │   └── Progress.jsx # Actual vs plan tracking
│       └── lib/             # API client, formatters, shared constants
└── server/                  # Express API
    ├── db/                  # SQLite setup, schema, and migration runner
    ├── engine/              # Financial calculation engine
    │   ├── calculator.js    # Income/expense summary and grouping
    │   ├── amortisation.js  # Month-by-month payoff simulation (windfalls, % minimums, emergency fund)
    │   ├── strategy.js      # Avalanche vs Snowball recommendation
    │   └── guide.js         # Monthly action guide builder
    └── routes/              # API route handlers
        ├── debts.js
        ├── budget.js
        ├── plan.js          # Includes /whatif endpoint
        ├── ai.js
        ├── windfalls.js
        ├── settings.js
        ├── progress.js
        └── actuals.js
```

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET/POST/PUT/DELETE` | `/api/debts` | Debt accounts and tranches |
| `GET/POST/PUT/DELETE` | `/api/budget/income` | Income sources |
| `GET/POST/PUT/DELETE` | `/api/budget/expenses` | Expense entries |
| `POST` | `/api/plan` | Generate payoff plan |
| `GET` | `/api/plan/cached` | Retrieve cached plan |
| `POST` | `/api/plan/whatif` | Ephemeral scenario: extra monthly payment |
| `POST` | `/api/ai` | Generate AI narrative (mode A/B/C) |
| `GET/POST/PUT/DELETE` | `/api/windfalls` | Lump sum payment schedule |
| `GET/PUT` | `/api/settings` | App settings (emergency fund target/current) |
| `GET/POST/PUT/DELETE` | `/api/progress` | Monthly balance snapshots |
| `GET/POST/PUT/DELETE` | `/api/actuals` | Monthly spending actuals |
| `GET` | `/api/actuals/summary` | Budgeted vs actual by category for a month |

## Tests

Unit tests cover the financial engine (amortisation, calculator, strategy):

```bash
cd server
npm test
```

## Disclaimer

This app provides financial guidance only and does not constitute regulated financial advice. For complex debt situations, consider contacting [StepChange Debt Charity](https://www.stepchange.org) (0800 138 1111) or [Citizens Advice](https://www.citizensadvice.org.uk).
