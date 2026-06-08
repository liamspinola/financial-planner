import { buildAnalysisPrompt } from '../../../ai/prompts/analysis';
import type { EngineExpense } from '../../../db/mappers';

// ── Fixtures ────────────────────────────────────────────────────────────────

const BASE_DATA = {
  summary: {
    totalIncome: 300000,
    essentialExpenses: 100000,
    discretionaryExpenses: 50000,
    surplusAfterExpenses: 150000,
    availableForDebt: 147500,
  },
  debts: [{ id: 1, name: 'Visa', minimum_payment: 2500 }],
  tranches: [{ debt_id: 1, label: 'Main', balance: 150000, apr: 0.2149, promo_end_date: null }],
  recommendation: { strategy: 'avalanche' as const },
  comparison: {
    avalanche: { debtFreeDate: '01/2027', totalInterest: 5000 },
    snowball:  { debtFreeDate: '03/2027', totalInterest: 5300 },
  },
  expenses: [] as EngineExpense[],
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildAnalysisPrompt — mode B', () => {
  it('contains the monthly income', () => {
    const prompt = buildAnalysisPrompt(BASE_DATA, 'B', BASE_DATA.expenses);
    expect(prompt).toContain('£3000');
  });

  it('contains the debt name', () => {
    const prompt = buildAnalysisPrompt(BASE_DATA, 'B', BASE_DATA.expenses);
    expect(prompt).toContain('Visa');
  });

  it('contains the APR', () => {
    const prompt = buildAnalysisPrompt(BASE_DATA, 'B', BASE_DATA.expenses);
    expect(prompt).toContain('21.5%');
  });

  it('contains the debt-free date for the recommended strategy', () => {
    const prompt = buildAnalysisPrompt(BASE_DATA, 'B', BASE_DATA.expenses);
    expect(prompt).toContain('01/2027');
  });

  it('contains the alternative strategy info', () => {
    const prompt = buildAnalysisPrompt(BASE_DATA, 'B', BASE_DATA.expenses);
    expect(prompt).toContain('Snowball');
    expect(prompt).toContain('03/2027');
  });

  it('ends with 3-paragraph instruction for mode B', () => {
    const prompt = buildAnalysisPrompt(BASE_DATA, 'B', BASE_DATA.expenses);
    expect(prompt).toContain('3-paragraph');
    expect(prompt).not.toContain('budget recommendations');
  });
});

describe('buildAnalysisPrompt — mode C', () => {
  const MODE_C_EXPENSES: EngineExpense[] = [
    { id: 1, amount: 8000, category: 'dining',      is_essential: 0 },
    { id: 2, amount: 5000, category: 'subscriptions', is_essential: 0 },
    { id: 3, amount: 3000, category: 'transport',   is_essential: 1 },
  ];

  it('includes TOP DISCRETIONARY SPENDING section', () => {
    const prompt = buildAnalysisPrompt(BASE_DATA, 'C', MODE_C_EXPENSES);
    expect(prompt).toContain('TOP DISCRETIONARY SPENDING');
    expect(prompt).toContain('dining');
    expect(prompt).toContain('subscriptions');
  });

  it('does NOT include essential expenses in discretionary list', () => {
    const prompt = buildAnalysisPrompt(BASE_DATA, 'C', MODE_C_EXPENSES);
    expect(prompt).not.toContain('transport');
  });

  it('includes budget recommendations instruction for mode C', () => {
    const prompt = buildAnalysisPrompt(BASE_DATA, 'C', MODE_C_EXPENSES);
    expect(prompt).toContain('budget recommendations');
    expect(prompt).toContain('£ amounts');
  });

  it('omits TOP DISCRETIONARY SPENDING section when all expenses are essential', () => {
    const allEssential: EngineExpense[] = [
      { id: 1, amount: 50000, category: 'rent', is_essential: 1 },
    ];
    const prompt = buildAnalysisPrompt(BASE_DATA, 'C', allEssential);
    expect(prompt).not.toContain('TOP DISCRETIONARY SPENDING');
  });
});

describe('buildAnalysisPrompt — snowball strategy', () => {
  it('labels strategy as Snowball when snowball is recommended', () => {
    const data = {
      ...BASE_DATA,
      recommendation: { strategy: 'snowball' as const },
    };
    const prompt = buildAnalysisPrompt(data, 'B', []);
    expect(prompt).toContain('Snowball');
    expect(prompt).toContain('Avalanche');
  });
});
