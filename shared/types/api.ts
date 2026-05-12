/**
 * API request/response shapes.
 * Zod schemas provide runtime validation; z.infer<> gives TypeScript types.
 * Import the schema for server-side validation, the type for type annotations.
 */
import { z } from 'zod';

// ── Debt ──────────────────────────────────────────────────────────────────

export const CreateTrancheSchema = z.object({
  label: z.string().min(1).max(100),
  /** Balance in pence */
  balance: z.number().int().min(1),
  /** APR as decimal ratio, e.g. 0.2149 for 21.49% */
  apr: z.number().min(0).max(10),
  promoEndDate: z.string().nullable().optional(),
  postPromoApr: z.number().min(0).max(10).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateTrancheRequest = z.infer<typeof CreateTrancheSchema>;

export const CreateDebtSchema = z.object({
  name: z.string().min(1).max(200),
  lender: z.string().max(200).nullable().optional(),
  debtType: z.enum([
    'credit_card', 'personal_loan', 'overdraft',
    'student_loan', 'mortgage', 'other',
  ]).default('credit_card'),
  /** Fixed minimum payment in pence, or 0 if percentage-based */
  minimumPayment: z.number().int().min(0).default(0),
  /** Percentage-based minimum as decimal (e.g. 0.02 for 2%) */
  minPaymentPct: z.number().min(0).max(1).nullable().optional(),
  /** Minimum floor for percentage payments, in pence */
  minPaymentFloor: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  tranches: z.array(CreateTrancheSchema).min(1),
});
export type CreateDebtRequest = z.infer<typeof CreateDebtSchema>;

// ── Income ────────────────────────────────────────────────────────────────

export const CreateIncomeSourceSchema = z.object({
  label: z.string().min(1).max(200),
  /** Amount in pence */
  amount: z.number().int().min(1),
  /** four_weekly = 13 periods/year (supported by engine) */
  frequency: z.enum(['weekly', 'fortnightly', 'four_weekly', 'monthly', 'annual']).default('monthly'),
  /** Server-computed monthly equivalent in pence; clients do not need to supply this */
  monthlyEquivalent: z.number().int().min(1).optional(),
});
export type CreateIncomeSourceRequest = z.infer<typeof CreateIncomeSourceSchema>;

// ── Expense ───────────────────────────────────────────────────────────────

export const CreateExpenseSchema = z.object({
  label: z.string().min(1).max(200),
  /** Amount in pence */
  amount: z.number().int().min(0),
  category: z.string().min(1).max(100),
  isEssential: z.boolean().default(true),
});
export type CreateExpenseRequest = z.infer<typeof CreateExpenseSchema>;

// ── Windfall ──────────────────────────────────────────────────────────────

export const CreateWindfallSchema = z.object({
  label: z.string().min(1).max(200),
  /** Amount in pence */
  amount: z.number().int().min(1),
  applyMonth: z.number().int().min(1).max(360),
});
export type CreateWindfallRequest = z.infer<typeof CreateWindfallSchema>;

// ── Expense Events ────────────────────────────────────────────────────────

export const CreateExpenseEventSchema = z.object({
  label: z.string().min(1).max(200),
  /** Amount in pence */
  amount: z.number().int().min(1),
  applyMonth: z.number().int().min(1).max(360),
  category: z.enum(['expected', 'unexpected']).default('expected'),
});
export type CreateExpenseEventRequest = z.infer<typeof CreateExpenseEventSchema>;

// ── Progress Snapshots ────────────────────────────────────────────────────

export const CreateProgressSnapshotSchema = z.object({
  /** Format: YYYY-MM */
  snapshotMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  /** Map of debt/tranche id to remaining balance in pence */
  balances: z.record(z.string(), z.number().int().min(0)),
  notes: z.string().max(500).nullable().optional(),
});
export type CreateProgressSnapshotRequest = z.infer<typeof CreateProgressSnapshotSchema>;

// ── Spending Actuals ──────────────────────────────────────────────────────

export const CreateActualSchema = z.object({
  expenseId: z.number().int().positive().nullable().optional(),
  category: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  /** Actual amount spent in pence */
  amountActual: z.number().int().min(0),
  /** Format: YYYY-MM */
  recordMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
});
export type CreateActualRequest = z.infer<typeof CreateActualSchema>;

export const UpdateActualSchema = z.object({
  amountActual: z.number().int().min(0),
});
export type UpdateActualRequest = z.infer<typeof UpdateActualSchema>;

// ── Settings ──────────────────────────────────────────────────────────────

export const PutSettingsSchema = z.record(
  z.string().min(1),
  z.union([z.string(), z.number(), z.boolean()]),
);
export type PutSettingsRequest = z.infer<typeof PutSettingsSchema>;

// ── Plan what-if / lump-sum ───────────────────────────────────────────────

export const WhatIfSchema = z.object({
  /** Extra monthly payment in pence */
  extraMonthly: z.number().int().min(0),
});
export type WhatIfRequest = z.infer<typeof WhatIfSchema>;

export const LumpSumSchema = z.object({
  /** One-off payment amount in pence */
  amount: z.number().int().min(1),
  /** Month number (1 = next month) to apply the lump sum */
  applyMonth: z.number().int().min(1).default(1),
});
export type LumpSumRequest = z.infer<typeof LumpSumSchema>;

// ── AI ────────────────────────────────────────────────────────────────────

export const AIMessageSchema = z.object({
  conversationId: z.number().int().positive(),
  message: z.string().min(1).max(4000),
});
export type AIMessageRequest = z.infer<typeof AIMessageSchema>;

// ── Common ────────────────────────────────────────────────────────────────

export interface APIError {
  error: string;
  code?: string;
}

export interface APISuccess<T> {
  data: T;
}
