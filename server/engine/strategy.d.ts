/** Compare avalanche vs snowball results and recommend one. */
export function recommend(
  avalanche: { payoffMonths: number; totalInterest: number; monthlyStates: unknown[] },
  snowball:  { payoffMonths: number; totalInterest: number; monthlyStates: unknown[] },
): {
  recommended: 'avalanche' | 'snowball';
  reason: string;
  interestSaved: number;
  monthsSaved: number;
};
