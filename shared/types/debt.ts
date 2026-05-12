/**
 * Debt domain types.
 * Monetary values are in INTEGER PENCE throughout (e.g. £12.34 = 1234).
 * APR / rate values are decimal ratios (e.g. 21.49% = 0.2149).
 */

export type DebtType =
  | 'credit_card'
  | 'personal_loan'
  | 'overdraft'
  | 'student_loan'
  | 'mortgage'
  | 'other';

export interface Tranche {
  id: number;
  debtId: number;
  label: string;
  /** Current balance in pence */
  balance: number;
  /** APR as a decimal ratio, e.g. 0.2149 for 21.49% */
  apr: number;
  promoEndDate: string | null;
  /** APR after promo period ends, as a decimal ratio */
  postPromoApr: number | null;
  sortOrder: number;
}

export interface Debt {
  id: number;
  userId: string | null;
  name: string;
  lender: string | null;
  debtType: DebtType;
  /** Fixed monthly minimum payment in pence, or 0 if percentage-based */
  minimumPayment: number;
  /** Percentage-based minimum as a decimal, e.g. 0.02 for 2% */
  minPaymentPct: number | null;
  /** Minimum floor for percentage-based minimums, in pence */
  minPaymentFloor: number | null;
  notes: string | null;
  createdAt: string;
}

export interface DebtWithTranches extends Debt {
  tranches: Tranche[];
}
