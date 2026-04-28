/** Normalise an income amount to its monthly equivalent. */
export function toMonthly(amount: number, frequency: string): number;

/** Compute budget summary from raw engine-shaped rows (all amounts in pence). */
export function computeSummary(
  incomeSources: Array<{ monthly_equivalent: number }>,
  expenses: Array<{ amount: number; category: string; is_essential: boolean | 1 | 0 }>,
  debts: Array<{ id: number; minimum_payment: number; min_payment_pct: number | null; min_payment_floor: number | null }>,
  tranches?: Array<{ debt_id: number; balance: number; apr: number }>,
): {
  totalIncome: number;
  essentialExpenses: number;
  discretionaryExpenses: number;
  totalExpenses: number;
  surplusAfterExpenses: number;
  totalMinimums: number;
  availableForDebt: number;
  hasDeficit: boolean;
};

/** Group tranches by their parent debt ID, returning a Map keyed by debtId. */
export function groupTranchsByDebt(
  debts: Array<{
    id: number;
    name: string;
    debt_type: string;
    minimum_payment: number;
    min_payment_pct: number | null;
    min_payment_floor: number | null;
  }>,
  tranches: Array<{
    id: number;
    debt_id: number;
    label: string;
    balance: number;
    apr: number;
    promo_end_date: string | null;
    post_promo_apr: number | null;
    sort_order: number | null;
  }>,
): Map<number, unknown>;

/** Compute the effective minimum payment for a set of tranches. */
export function effectiveMinimumFromTranches(tranches: Array<{ balance: number; apr: number }>): number;
