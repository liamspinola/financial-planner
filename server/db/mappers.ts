/**
 * Adapters from Drizzle camelCase row types to the snake_case shapes
 * expected by server/engine/*.js (which are frozen JavaScript and cannot be changed).
 *
 * All monetary values remain in pence — no conversion happens here.
 */

import * as schema from '../../drizzle/schema';

// ── Drizzle row types (using $inferSelect — the recommended pattern) ────────

export type DebtRow     = typeof schema.debts.$inferSelect;
export type TrancheRow  = typeof schema.tranches.$inferSelect;
export type IncomeRow   = typeof schema.incomeSources.$inferSelect;
export type ExpenseRow  = typeof schema.expenses.$inferSelect;
export type WindfallRow = typeof schema.windfalls.$inferSelect;
export type ExpEventRow = typeof schema.expenseEvents.$inferSelect;
export type ConvRow     = typeof schema.conversations.$inferSelect;

// ── Engine-expected snake_case shapes ──────────────────────────────────────

export interface EngineDebt {
  id: number;
  name: string;
  debt_type: string;
  minimum_payment: number;
  min_payment_pct: number | null;
  min_payment_floor: number | null;
}

export interface EngineTranche {
  id: number;
  debt_id: number;
  label: string;
  balance: number;
  apr: number;
  promo_end_date: string | null;
  post_promo_apr: number | null;
  sort_order: number | null;
}

export interface EngineIncome {
  id: number;
  monthly_equivalent: number;
}

export interface EngineExpense {
  id: number;
  amount: number;
  category: string;
  /** Engine checks `is_essential === 1` for SQLite compatibility, so we pass boolean */
  is_essential: boolean;
}

export interface EngineWindfall {
  id: number;
  amount: number;
  apply_month: number;
}

export interface EngineExpEvent {
  id: number;
  amount: number;
  apply_month: number;
}

export interface EngineConv {
  id: number;
  use_context: boolean;
  context_snapshot: string | null;
  summary: string | null;
}

// ── Mapper functions ───────────────────────────────────────────────────────

export function toEngineDebt(r: DebtRow): EngineDebt {
  return {
    id: r.id,
    name: r.name,
    debt_type: r.debtType,
    minimum_payment: r.minimumPayment,
    min_payment_pct: r.minPaymentPct ?? null,
    min_payment_floor: r.minPaymentFloor ?? null,
  };
}

export function toEngineTranche(r: TrancheRow): EngineTranche {
  return {
    id: r.id,
    debt_id: r.debtId,
    label: r.label,
    balance: r.balance,
    apr: r.apr,
    promo_end_date: r.promoEndDate ?? null,
    post_promo_apr: r.postPromoApr ?? null,
    sort_order: r.sortOrder ?? null,
  };
}

export function toEngineIncome(r: IncomeRow): EngineIncome {
  return {
    id: r.id,
    monthly_equivalent: r.monthlyEquivalent,
  };
}

export function toEngineExpense(r: ExpenseRow): EngineExpense {
  return {
    id: r.id,
    amount: r.amount,
    category: r.category,
    is_essential: r.isEssential,
  };
}

export function toEngineWindfall(r: WindfallRow): EngineWindfall {
  return {
    id: r.id,
    amount: r.amount,
    apply_month: r.applyMonth,
  };
}

export function toEngineExpEvent(r: ExpEventRow): EngineExpEvent {
  return {
    id: r.id,
    amount: r.amount,
    apply_month: r.applyMonth,
  };
}

export function toEngineConv(r: ConvRow): EngineConv {
  return {
    id: r.id,
    use_context: r.useContext,
    context_snapshot: r.contextSnapshot ?? null,
    summary: r.summary ?? null,
  };
}
