import { useState, useEffect } from 'react';
import { TrendingDown, Wallet, Clock, AlertTriangle } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { api } from '../lib/api';
import { gbp, daysUntil, ukDate, aprPct, monthsLabel } from '../lib/format';
import StatCard from '../components/StatCard';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ChartTooltip from '../components/ChartTooltip';
import { DEBT_COLORS, PROMO_ALERT_DAYS } from '../lib/constants';

export default function Dashboard() {
  const [plan, setPlan] = useState(null);
  const [debts, setDebts] = useState([]);
  const [tranches, setTranches] = useState([]);
  const [income, setIncome] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [planData, debtData, budgetData] = await Promise.all([
        api.getCachedPlan().catch(() => null),
        api.getDebts(),
        api.getBudget(),
      ]);
      setPlan(planData);
      setDebts(debtData.debts);
      setTranches(debtData.tranches);
      setIncome(budgetData.income);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-8 flex justify-center"><Spinner /></div>;

  const totalDebt = tranches.reduce((s, t) => s + t.balance, 0);
  const totalIncome = income.reduce((s, i) => s + i.monthly_equivalent, 0);

  // Promo expiry alerts (within PROMO_ALERT_DAYS)
  const promoAlerts = tranches.filter(t => {
    if (!t.promo_end_date) return false;
    const days = daysUntil(t.promo_end_date);
    return days !== null && days >= 0 && days <= PROMO_ALERT_DAYS;
  }).map(t => {
    const debt = debts.find(d => d.id === t.debt_id);
    return { ...t, debtName: debt?.name || 'Unknown', days: daysUntil(t.promo_end_date) };
  });

  return (
    <div className="p-8">
      <PageHeader title="Dashboard" subtitle="Your financial overview at a glance" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Debt"
          value={gbp(totalDebt)}
          color="red"
          icon={TrendingDown}
          sub={`${debts.length} account${debts.length !== 1 ? 's' : ''}`}
        />
        <StatCard
          label="Monthly Income"
          value={gbp(totalIncome)}
          color="green"
          icon={Wallet}
        />
        <StatCard
          label="Months to Debt-Free"
          value={plan ? monthsLabel(plan.payoffMonths) : '—'}
          color="teal"
          icon={Clock}
          sub={plan ? `By ${plan.debtFreeDate}` : 'Generate a plan first'}
        />
        <StatCard
          label="Total Interest to Pay"
          value={plan ? gbp(plan.totalInterest) : '—'}
          color="amber"
          sub={plan ? `Using ${plan.recommendation?.strategy} strategy` : 'Generate a plan first'}
        />
      </div>

      {/* Promo alerts */}
      {promoAlerts.length > 0 && (
        <div className="space-y-3 mb-8">
          {promoAlerts.map(t => (
            <div key={t.id} className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <span className="font-medium text-amber-300">{t.debtName} — {t.label}</span>
                <span className="text-slate-300 ml-1">
                  0% promo expires {ukDate(t.promo_end_date)} ({t.days} days) — then moves to {aprPct(t.post_promo_apr)} APR
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {plan && plan.chartData?.length > 0 ? (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Debt Payoff Timeline</h3>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={plan.chartData} margin={{ top: 4, right: 16, bottom: 0, left: 16 }}>
              <defs>
                {plan.debtIds.map((id, i) => (
                  <linearGradient key={id} id={`grad_${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={DEBT_COLORS[i % DEBT_COLORS.length]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={DEBT_COLORS[i % DEBT_COLORS.length]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tickFormatter={v => `£${(v/1000).toFixed(0)}k`} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              {plan.debtIds.map((id, i) => (
                <Area
                  key={id}
                  type="monotone"
                  dataKey={`debt_${id}`}
                  name={plan.debtNames[id]}
                  stroke={DEBT_COLORS[i % DEBT_COLORS.length]}
                  fill={`url(#grad_${id})`}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card p-8 text-center text-slate-500">
          <p className="text-sm">No plan generated yet. Go to the <strong className="text-teal-400">Plan</strong> tab to generate your payoff plan.</p>
        </div>
      )}
    </div>
  );
}
