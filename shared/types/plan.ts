/**
 * Plan calculation result types.
 * Monetary values are in INTEGER PENCE.
 */

export type PayoffStrategy = 'avalanche' | 'snowball';

export interface PlanMonth {
  month: number;
  /** ISO date string of this month's payment date */
  date: string;
  /** Total debt balance remaining at end of month, in pence */
  totalBalance: number;
  /** Total interest accrued this month, in pence */
  interestPaid: number;
  /** Total principal paid this month, in pence */
  principalPaid: number;
  /** Total payment made this month, in pence */
  totalPayment: number;
  /** Per-debt breakdown */
  debtBreakdown: Array<{
    debtId: number;
    name: string;
    balance: number;
    payment: number;
    interestPaid: number;
  }>;
}

export interface PlanResult {
  strategy: PayoffStrategy;
  months: PlanMonth[];
  /** Total interest paid over the life of the plan, in pence */
  totalInterestPaid: number;
  /** Total amount paid over the life of the plan, in pence */
  totalPaid: number;
  /** ISO date string when debt is cleared */
  debtFreeDate: string;
  /** Number of months to debt freedom */
  monthCount: number;
}

export interface StrategyComparison {
  avalanche: PlanResult;
  snowball: PlanResult;
  /** Interest saved by choosing avalanche over snowball, in pence */
  interestSavedByAvalanche: number;
  /** Months saved by choosing avalanche over snowball */
  monthsSavedByAvalanche: number;
}
