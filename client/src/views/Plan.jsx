import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Printer, RefreshCw, TrendingDown, Info, Plus, Edit2, Trash2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine,
} from 'recharts';
import { api } from '../lib/api';
import { gbp, monthsLabel } from '../lib/format';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ChartTooltip from '../components/ChartTooltip';
import LumpSumAdvisor from '../components/LumpSumAdvisor';
import { DEBT_COLORS } from '../lib/constants';

// Convert **text** to <strong> spans inline, returning mixed text/element array
function renderInline(text) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part);
}

// Render AI narrative: drop standalone **title** lines and --- separators
function renderNarrative(text) {
  return text.split('\n\n').filter(para => {
    const s = para.trim();
    if (/^\*\*.+\*\*$/.test(s)) return false; // standalone bold title
    if (/^-{3,}$/.test(s)) return false;       // horizontal rule
    return s.length > 0;
  }).map((para, i) => <p key={i}>{renderInline(para)}</p>);
}

// Render budget tips: strip leading bullet/dash, convert **bold**
function renderBudgetTips(text) {
  return text.split('\n').filter(l => l.trim()).map((line, i) => (
    <p key={i} className="text-sm text-slate-300 leading-relaxed">
      {renderInline(line.replace(/^[-•]\s*/, ''))}
    </p>
  ));
}

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
          m.type === 'paid_off'      ? 'text-green-400' :
          m.type === 'promo_warning' ? 'text-amber-400' :
          m.type === 'halfway'       ? 'text-teal-400'  :
          m.type === 'final'         ? 'text-green-300' :
          m.type === 'windfall'      ? 'text-violet-400' : 'text-slate-400'
        }`}>
          {m.type === 'paid_off' ? '🎉 ' : m.type === 'promo_warning' ? '⚠ ' : m.type === 'halfway' ? '📍 ' : m.type === 'final' ? '✅ ' : m.type === 'windfall' ? '💰 ' : ''}
          {m.message}
        </p>
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
  const [chartWidth, setChartWidth] = useState(680);
  const chartContainerRef = useRef(null);

  // What-If state
  const [whatIfExtra, setWhatIfExtra] = useState(50);
  const [whatIfResult, setWhatIfResult] = useState(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  // Windfalls state
  const [windfalls, setWindfalls] = useState([]);
  const [wfForm, setWfForm] = useState({ label: '', amount: '', apply_month: '' });
  const [editingWf, setEditingWf] = useState(null); // id being edited

  useEffect(() => { loadCached(); loadWindfalls(); }, []);

  // Measure container width for the chart so it fills the card on screen
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setChartWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [plan]); // re-run when plan loads so the chart div is in the DOM

  // Force an exact 680px render before the browser captures the print layout,
  // preventing ResponsiveContainer's stale measurement from clipping the chart.
  useEffect(() => {
    const onBeforePrint = () => { flushSync(() => setChartWidth(680)); };
    window.addEventListener('beforeprint', onBeforePrint);
    return () => window.removeEventListener('beforeprint', onBeforePrint);
  }, []);

  async function loadWindfalls() {
    try { setWindfalls(await api.getWindfalls()); } catch { /* ignore */ }
  }

  async function saveWindfall() {
    const payload = {
      label: wfForm.label.trim(),
      amount: parseFloat(wfForm.amount),
      apply_month: parseInt(wfForm.apply_month, 10),
    };
    if (!payload.label || isNaN(payload.amount) || isNaN(payload.apply_month)) return;
    if (editingWf) {
      const updated = await api.updateWindfall(editingWf, payload);
      setWindfalls(ws => ws.map(w => w.id === editingWf ? updated : w));
      setEditingWf(null);
    } else {
      const created = await api.createWindfall(payload);
      setWindfalls(ws => [...ws, created]);
    }
    setWfForm({ label: '', amount: '', apply_month: '' });
  }

  async function deleteWindfall(id) {
    await api.deleteWindfall(id);
    setWindfalls(ws => ws.filter(w => w.id !== id));
  }

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

  async function runWhatIf(extra) {
    if (!plan) return;
    setWhatIfLoading(true);
    try {
      const result = await api.whatIfPlan(extra);
      setWhatIfResult(result);
    } catch { /* silently ignore */ } finally {
      setWhatIfLoading(false);
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

        {/* Windfall payments */}
        <div className="mt-5 border-t border-slate-700 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Windfall / Lump Sum Payments</h4>
          {windfalls.length > 0 && (
            <div className="space-y-1 mb-3">
              {windfalls.map(w => (
                <div key={w.id} className="flex items-center gap-3 text-sm">
                  {editingWf === w.id ? (
                    <>
                      <input className="input flex-1 py-1 text-xs" placeholder="Label" value={wfForm.label} onChange={e => setWfForm(f => ({ ...f, label: e.target.value }))} />
                      <input className="input w-24 py-1 text-xs" type="number" min="1" placeholder="£ amount" value={wfForm.amount} onChange={e => setWfForm(f => ({ ...f, amount: e.target.value }))} />
                      <input className="input w-20 py-1 text-xs" type="number" min="1" max={plan?.payoffMonths || undefined} placeholder="Month #" value={wfForm.apply_month} onChange={e => setWfForm(f => ({ ...f, apply_month: e.target.value }))} />
                      <button onClick={saveWindfall} className="btn-sm-teal text-xs">Save</button>
                      <button onClick={() => { setEditingWf(null); setWfForm({ label: '', amount: '', apply_month: '' }); }} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="text-violet-400 font-medium">£{w.amount.toLocaleString('en-GB')}</span>
                      <span className="text-slate-300">{w.label}</span>
                      <span className="text-slate-500">month {w.apply_month}</span>
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => { setEditingWf(w.id); setWfForm({ label: w.label, amount: w.amount, apply_month: w.apply_month }); }} className="p-1 text-slate-400 hover:text-slate-200"><Edit2 size={11} /></button>
                        <button onClick={() => deleteWindfall(w.id)} className="p-1 text-slate-400 hover:text-red-400"><Trash2 size={11} /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {editingWf === null && (
            <div className="flex items-center gap-2 flex-wrap">
              <input className="input flex-1 min-w-[120px] py-1 text-xs" placeholder="Label (e.g. Tax rebate)" value={wfForm.label} onChange={e => setWfForm(f => ({ ...f, label: e.target.value }))} />
              <input className="input w-28 py-1 text-xs" type="number" min="1" placeholder="£ amount" value={wfForm.amount} onChange={e => setWfForm(f => ({ ...f, amount: e.target.value }))} />
              <div className="flex items-center gap-1">
                <input className="input w-24 py-1 text-xs" type="number" min="1" max={plan?.payoffMonths || undefined} placeholder="Month #" value={wfForm.apply_month} onChange={e => setWfForm(f => ({ ...f, apply_month: e.target.value }))} />
                {plan && <span className="text-[10px] text-slate-600 whitespace-nowrap">of {plan.payoffMonths}</span>}
              </div>
              <button onClick={saveWindfall} disabled={!wfForm.label || !wfForm.amount || !wfForm.apply_month} className="btn-sm-teal text-xs disabled:opacity-40"><Plus size={12} /> Add windfall</button>
            </div>
          )}
        </div>
      </div>

      {plan && <LumpSumAdvisor onWindfallSaved={loadWindfalls} planMonths={plan.payoffMonths} />}

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
          <div className={`grid gap-4 mb-6 ${plan.emergencyFund ? 'grid-cols-4' : 'grid-cols-3'}`}>
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
            {plan.emergencyFund && (
              <div className="card p-4 text-center">
                <p className="text-xs text-slate-400 mb-1">Fund Complete</p>
                <p className="text-lg font-semibold text-teal-300">
                  {plan.emergencyFund.fundCompleteDate || 'Already met'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {gbp(plan.emergencyFund.current)}/{gbp(plan.emergencyFund.target)}
                </p>
              </div>
            )}
          </div>

          {/* What-If panel */}
          <div className="card p-5 mb-6 no-print">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">What If I Paid More?</h3>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="range"
                  min={10} max={500} step={10}
                  value={whatIfExtra}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setWhatIfExtra(v);
                    setWhatIfResult(null);
                  }}
                  className="w-full accent-teal-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                  <span>£10</span><span>£500</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Extra</span>
                <input
                  type="number"
                  min={0} max={9999} step={10}
                  value={whatIfExtra}
                  onChange={e => {
                    const v = Math.max(0, Number(e.target.value));
                    setWhatIfExtra(v);
                    setWhatIfResult(null);
                  }}
                  className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 text-right"
                />
                <span className="text-sm text-slate-400">/month</span>
                <button
                  onClick={() => runWhatIf(whatIfExtra)}
                  disabled={whatIfLoading || whatIfExtra === 0}
                  className="btn-teal text-xs disabled:opacity-50"
                >
                  {whatIfLoading ? <Spinner size={13} /> : 'Calculate'}
                </button>
              </div>
            </div>
            {whatIfResult && (
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {whatIfResult.monthsSaved > 0 ? (
                  <>
                    <span className="text-green-400 font-medium">
                      {monthsLabel(whatIfResult.monthsSaved)} sooner
                    </span>
                    <span className="text-green-400 font-medium">
                      {gbp(whatIfResult.interestSaved)} less interest
                    </span>
                    <span className="text-slate-400">
                      → Debt-free {whatIfResult.scenario.debtFreeDate}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">No change — already at the maximum payoff speed.</span>
                )}
              </div>
            )}
          </div>

          {/* Timeline chart */}
          {plan.chartData?.length > 0 && (
            <div className="card p-6 mb-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Balance Over Time</h3>
              <div ref={chartContainerRef} className="print-chart-container" style={{ width: '100%' }}>
                <LineChart width={chartWidth} height={300} data={plan.chartData} margin={{ top: 4, right: 16, bottom: 0, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tickFormatter={v => `£${(v/1000).toFixed(0)}k`} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
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
              </div>
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
                        {renderNarrative(aiData.narrative)}
                      </div>
                    </div>
                  )}
                  {aiData.budgetTips && (
                    <div className="card p-6">
                      <p className="text-xs uppercase tracking-wider text-amber-400 font-semibold mb-4">Budget Recommendations</p>
                      <div className="space-y-2">
                        {renderBudgetTips(aiData.budgetTips)}
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
            <div className="space-y-1 max-h-[600px] overflow-y-auto scrollbar-thin pr-2 print:max-h-none print:overflow-visible">
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
