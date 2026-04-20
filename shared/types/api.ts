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
  frequency: z.enum(['weekly', 'fortnightly', 'monthly', 'annual']).default('monthly'),
  /** Pre-calculated monthly equivalent in pence */
  monthlyEquivalent: z.number().int().min(1),
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
