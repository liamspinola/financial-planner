/** Month-by-month payoff simulation. All monetary values in pence. */
export function simulate(
  debtMap: Map<number, unknown>,
  available: number,
  strategy: 'avalanche' | 'snowball',
  startDate: Date,
  windfalls?: Array<{ apply_month: number; amount: number }>,
  fundingDelay?: number,
  expenseEvents?: Array<{ apply_month: number; amount: number }>,
): {
  payoffMonths: number;
  totalInterest: number;
  monthlyStates: unknown[];
};
