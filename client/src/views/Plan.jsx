import { useState, useEffect } from 'react';
import { Printer, RefreshCw, TrendingDown, Info } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { api } from '../lib/api';
import { gbp, monthsLabel } from '../lib/format';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';

const DEBT_COLORS = ['#14b8a6','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316'];

const AI_MODES = [
  { value: 'C', label: 'Full Analysis', desc: 'Plan narration + budget recommendations (uses Claude AI)' },
  { value: 'B', label: 'Plan Narration', desc: 'Plain-English explanation of the plan (uses Claude AI)' },
  { value: 'A', label: 'No AI',          desc: 'Pure calculation only — no AI, no tokens used' },
];

function GuideEntry({ entry }) {
  const hasEvents = entry.milestones.length > 0;
  return (
    <div className={`border-l-2 pl-4 py-2 ${hasEvents ? 'border-teal-500' : 'border-slate-700'}`}>
      <p className="text-xs font-semibold text-slate-400 mb-1">{entry.dateLabel}</p>
      {entry.actions.map((a, i) => (
        <p key={i} className={`text-sm ${a.isTarget ? 'text-teal-300 font-medium' : 'text-slate-300'}`}>
          {a.label}
        </p>
      ))}
      {entry.milestones.map((m, i) => (
        <p key={i} className={`text-xs mt-1 font-medium ${
          m.type === 'paid_off'    ? 'text-green-400' :
          m.type === 'promo_warning' ? 'text-amber-400' :
          m.type === 'halfway'    ? 'text-teal-400' :
          m.type === 'final'      ? 'text-green-300' : 'text-slate-400'
        }`}>
          {m.type === 'paid_off' ? '🎉 ' : m.type === 'promo_warning' ? '⚠ ' : m.type === 'halfway' ? '📍 ' : m.type === 'final' ? '✅ ' : ''}
          {m.message}
        </p>
      ))}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-800 border border-slate-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-400 mb-2">Month {label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="font-semibold tabular-nums text-slate-100">{gbp(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Plan() {
  const [plan, setPlan] = useState(null);
  const [aiMode, setAiMode] = useState('C');
  const [generating, setGenerating] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiData, setAiData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { loadCached(); }, []);

  async function loadCached() {
    try {
      const cached = await api.getCachedPlan();
      if (cached) {
        setPlan(cached);
        if (cached.aiNarrative) {
          setAiData({ narrative: cached.aiNarrative, budgetTips: cached.aiBudgetTips });
          setAiMode(cached.aiMode || 'C');
        }
      }
    } catch { /* no cached plan yet */ }
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const result = await api.generatePlan();
      setPlan(result);
      setAiData(null);
      if (aiMode !== 'A') {
        setGeneratingAI(true);
        try {
          const ai = await api.generateAI(aiMode);
          setAiData(ai);
        } catch (aiErr) {
          setAiData({ error: aiErr.message });
        } finally {
          setGeneratingAI(false);
        }
      }
    } catch (err) {
      setError(err.data?.message || err.message);
    } finally {
      setGenerating(false);
    }
  }

  // Milestones for reference lines (paid off months)
  const paidOffMonths = plan?.guide?.flatMap(e =>
    e.milestones.filter(m => m.type === 'paid_off').map(() => e.month)
  ) || [];

  return (
    <div className="p-8">
      <PageHeader
        title="Payoff Plan"
        subtitle="Your personalised debt elimination strategy"
        actions={
          <button onClick={() => window.print()} className="btn-ghost no-print">
            <Printer size={15} /> Print / Save PDF
          </button>
        }
      />

      {/* Generate controls */}
      <div className="card p-5 mb-6 no-print">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <label className="label mb-2">AI Analysis Mode</label>
            <div className="flex gap-2">
              {AI_MODES.map(m => (
                <button
                  key={m.value}
                  onClick={() => setAiMode(m.value)}
                  title={m.desc}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    aiMode === m.value
                      ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                      : 'bg-transparent border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {AI_MODES.find(m => m.value === aiMode)?.desc}
            </p>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="btn-teal disabled:opacity-50"
          >
            {generating ? <Spinner size={16} /> : <RefreshCw size={15} />}
            {generating ? 'Calculating…' : 'Generate Plan'}
          </button>
        </div>
        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      {!plan && !generating && (
        <div className="card p-12 text-center text-slate-500">
          <TrendingDown size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Add your debts and budget, then click "Generate Plan" to see your personalised payoff strategy.</p>
        </div>
      )}

      {plan && (
        <>
          {/* Strategy recommendation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="lg:col-span-2 card p-5">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Recommended Strategy</p>
              <h3 className="text-xl font-semibold text-teal-400 mb-2 capitalize">{plan.recommendation?.strategy} Method</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{plan.recommendation?.reason}</p>
            </div>
            <div className="card p-5 overflow-hidden">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-3">Strategy Comparison</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="text-left pb-2"></th>
                    <th className="text-right pb-2">Avalanche</th>
                    <th className="text-right pb-2">Snowball</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  <tr>
                    <td className="py-1.5 text-slate-400">Debt-free</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-200">{plan.comparison?.avalanche?.debtFreeDate}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-200">{plan.comparison?.snowball?.debtFreeDate}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-400">Total interest</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-200">{gbp(plan.comparison?.avalanche?.totalInterest)}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-200">{gbp(plan.comparison?.snowball?.totalInterest)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="card p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">Debt-Free Date</p>
              <p className="text-lg font-semibold text-teal-400">{plan.debtFreeDate}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">Payoff Duration</p>
              <p className="text-lg font-semibold text-slate-100">{monthsLabel(plan.payoffMonths)}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">Total Interest</p>
              <p className="text-lg font-semibold text-amber-400">{gbp(plan.totalInterest)}</p>
            </div>
          </div>

          {/* Timeline chart */}
          {plan.chartData?.length > 0 && (
            <div className="card p-6 mb-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Balance Over Time</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={plan.chartData} margin={{ top: 4, right: 16, bottom: 0, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tickFormatter={v => `£${(v/1000).toFixed(0)}k`} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  {paidOffMonths.map((m, i) => (
                    <ReferenceLine key={i} x={m} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} />
                  ))}
                  {plan.debtIds.map((id, i) => (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={`debt_${id}`}
                      name={plan.debtNames[id]}
                      stroke={DEBT_COLORS[i % DEBT_COLORS.length]}
                      dot={false}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* AI narrative */}
          {generatingAI && (
            <div className="card p-6 mb-6 flex items-center gap-3 text-sm text-slate-400">
              <Spinner size={16} /> Generating AI analysis…
            </div>
          )}
          {aiData && !generatingAI && (
            <div className="mb-6 space-y-4">
              {aiData.error ? (
                <div className="card p-5 border-red-500/30 bg-red-500/5 text-sm text-red-300">
                  AI analysis unavailable: {aiData.error}
                </div>
              ) : (
                <>
                  {aiData.narrative && (
                    <div className="card p-6 bg-slate-800/80">
                      <div className="flex items-center gap-2 mb-4">
                        <p className="text-xs uppercase tracking-wider text-teal-400 font-semibold">Financial Analysis</p>
                        {aiData.cached && <span className="text-xs text-slate-500">(cached)</span>}
                      </div>
                      <div className="prose prose-sm prose-invert max-w-[65ch] leading-relaxed text-slate-300 space-y-3">
                        {aiData.narrative.split('\n\n').map((para, i) => (
                          <p key={i}>{para}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {aiData.budgetTips && (
                    <div className="card p-6">
                      <p className="text-xs uppercase tracking-wider text-amber-400 font-semibold mb-4">Budget Recommendations</p>
                      <div className="space-y-2">
                        {aiData.budgetTips.split('\n').filter(l => l.trim()).map((line, i) => (
                          <p key={i} className="text-sm text-slate-300 leading-relaxed">{line}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step-by-step guide */}
          <div className="card p-6 mb-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Monthly Action Guide</h3>
            <div className="space-y-1 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
              {plan.guide?.map((entry, i) => (
                <GuideEntry key={i} entry={entry} />
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="flex items-start gap-2 text-xs text-slate-500 mt-4">
            <Info size={13} className="mt-0.5 shrink-0" />
            <p>
              This app provides financial guidance only and does not constitute regulated financial advice.
              For complex debt situations, consider contacting{' '}
              <strong>StepChange Debt Charity</strong> (0800 138 1111) or <strong>Citizens Advice</strong>.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
