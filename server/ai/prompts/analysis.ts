import type { EngineExpense } from '../../db/mappers';

interface AnalysisData {
  summary: Record<string, number>;
  debts: Array<{ id?: number; name: string; minimum_payment: number }>;
  tranches: Array<{ debt_id: number; label: string; balance: number; apr: number; promo_end_date: string | null }>;
  recommendation: { strategy: string };
  comparison: Record<string, { debtFreeDate: string; totalInterest: number }>;
  expenses: EngineExpense[];
}

export function buildAnalysisPrompt(data: AnalysisData, mode: 'B' | 'C', expenses: EngineExpense[]): string {
  const { summary, debts, tranches, recommendation, comparison } = data;

  const debtList = debts.map(d => {
    const dTranches = tranches.filter(t => t.debt_id === (d as any).id);
    const trancheDesc = dTranches.map(t => {
      const aprPct = (t.apr * 100).toFixed(1);
      const promoNote = t.promo_end_date ? ` (0% promo until ${t.promo_end_date})` : '';
      return `${t.label}: £${t.balance.toFixed(0)} @ ${aprPct}% APR${promoNote}`;
    }).join(', ');
    return `- ${d.name}: ${trancheDesc} | Min payment: £${d.minimum_payment}/month`;
  }).join('\n');

  const stratLabel = recommendation.strategy === 'avalanche' ? 'Avalanche (highest APR first)' : 'Snowball (lowest balance first)';
  const altLabel   = recommendation.strategy === 'avalanche' ? 'Snowball' : 'Avalanche';
  const winComp    = comparison[recommendation.strategy]!;
  const altComp    = comparison[recommendation.strategy === 'avalanche' ? 'snowball' : 'avalanche']!;

  let prompt = `You are an experienced UK financial adviser. Analyse this person's financial position and write a clear, encouraging payoff plan explanation.\n\nFINANCIAL SUMMARY:\n- Monthly take-home income: £${summary['totalIncome']!.toFixed(0)}\n- Monthly essential expenses: £${summary['essentialExpenses']!.toFixed(0)}\n- Monthly discretionary expenses: £${summary['discretionaryExpenses']!.toFixed(0)}\n- Monthly surplus after expenses: £${summary['surplusAfterExpenses']!.toFixed(0)}\n- Monthly surplus after all debt minimums: £${summary['availableForDebt']!.toFixed(0)}\n\nDEBTS (${stratLabel} order recommended):\n${debtList}\n\nPAYOFF PROJECTION:\n- Recommended strategy: ${stratLabel}\n- Debt-free date: ${winComp.debtFreeDate}\n- Total interest: £${winComp.totalInterest.toFixed(0)}\n- Alternative (${altLabel}): debt-free ${altComp.debtFreeDate}, total interest £${altComp.totalInterest.toFixed(0)}`;

  if (mode === 'C') {
    const discMap: Record<string, number> = {};
    for (const e of expenses) {
      if (!e.is_essential) discMap[e.category] = (discMap[e.category] ?? 0) + e.amount;
    }
    const topDisc = Object.entries(discMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, amt]) => `- ${cat}: £${(amt as number).toFixed(0)}/month`).join('\n');
    if (topDisc) prompt += `\n\nTOP DISCRETIONARY SPENDING:\n${topDisc}`;
    prompt += `\n\nWrite:\n1. A 3-paragraph plain-English explanation of the plan and why this strategy was chosen. Tone: experienced, direct, encouraging. No jargon. No bullet points in the paragraphs.\n2. A bullet list of 3-5 specific budget recommendations with exact £ amounts and their impact on payoff speed. Focus on highest-leverage cuts only. Format each as: "• [Category]: Cut from £X to £Y/month — saves £Z in interest / speeds up payoff by N months"`;
  } else {
    prompt += `\n\nWrite a 3-paragraph plain-English explanation of this payoff plan and why this strategy was recommended. Tone: experienced, direct, encouraging. No jargon.`;
  }

  return prompt;
}
