import { useState, useEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { Printer, RefreshCw, TrendingDown, Info, Plus, Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine,
} from 'recharts';
import { api } from '../lib/api';
import { gbp, monthsLabel, formatMonthLabel } from '../lib/format';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ChartTooltip from '../components/ChartTooltip';
import LumpSumAdvisor from '../components/LumpSumAdvisor';
import { DEBT_COLORS } from '../lib/constants';

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  function set(updater) {
    setValue(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }
  return [value, set];
}

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
          m.type === 'windfall'      ? 'text-violet-400' :
          m.type === 'expense_hit'   ? 'text-red-400' : 'text-slate-400'
        }`}>
          {m.type === 'paid_off' ? '🎉 ' : m.type === 'promo_warning' ? '⚠ ' : m.type === 'halfway' ? '📍 ' : m.type === 'final' ? '✅ ' : m.type === 'windfall' ? '💰 ' : m.type === 'expense_hit' ? '💸 ' : ''}
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
  const [wfOpen, setWfOpen] = useLocalStorage('plan_wf_open', true);

  // Expense events state
  const [expenseEvents, setExpenseEvents] = useState([]);
  const [evForm, setEvForm] = useState({ label: '', amount: '', apply_month: '', category: 'expected' });
  const [editingEv, setEditingEv] = useState(null); // id being edited
  const [evOpen, setEvOpen] = useLocalStorage('plan_ev_open', true);

  // Collapsible section state
  const [whatIfOpen, setWhatIfOpen] = useLocalStorage('plan_whatif_open', true);
  const [chartOpen, setChartOpen] = useLocalStorage('plan_chart_open', true);
  const [aiOpen, setAiOpen] = useLocalStorage('plan_ai_open', true);
  const [budgetTipsOpen, setBudgetTipsOpen] = useLocalStorage('plan_budget_open', true);
  const [guideOpen, setGuideOpen] = useLocalStorage('plan_guide_open', true);

  useEffect(() => { loadCached(); loadWindfalls(); loadExpenseEvents(); }, []);

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

  async function loadExpenseEvents() {
    try { setExpenseEvents(await api.getExpenseEvents()); } catch { /* non-critical */ }
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

  async function saveExpenseEvent() {
    const payload = {
      label: evForm.label.trim(),
      amount: parseFloat(evForm.amount),
      apply_month: parseInt(evForm.apply_month, 10),
      category: evForm.category,
    };
    if (!payload.label || isNaN(payload.amount) || isNaN(payload.apply_month)) return;
    try {
      if (editingEv !== null) {
        await api.updateExpenseEvent(editingEv, payload);
        setEditingEv(null);
      } else {
        await api.createExpenseEvent(payload);
      }
      setEvForm({ label: '', amount: '', apply_month: '', category: 'expected' });
      await loadExpenseEvents();
      if (plan) await generate();
    } catch (err) {
      console.error('Failed to save expense event', err);
    }
  }

  async function deleteExpenseEvent(id) {
    try {
      await api.deleteExpenseEvent(id);
      await loadExpenseEvents();
      if (plan) await generate();
    } catch (err) {
      console.error('Failed to delete expense event', err);
    }
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
  const paidOffDates = plan?.guide?.flatMap(e =>
    e.milestones.filter(m => m.type === 'paid_off').map(() => e.isoDate)
  ) || [];

  const monthDateMap = useMemo(
    () => Object.fromEntries((plan?.chartData || []).map(p => [p.month, p.date])),
    [plan?.chartData]
  );

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
          <button
            onClick={() => setWfOpen(o => !o)}
            className="flex items-center gap-2 w-full text-left mb-3 group"
          >
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-slate-300 transition-colors">
              Windfall / Lump Sum Payments
            </h4>
            {windfalls.length > 0 && (
              <span className="text-xs text-slate-500">({windfalls.length})</span>
            )}
            <span className="ml-auto text-slate-500 group-hover:text-slate-400 transition-colors">
              {wfOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>
          {wfOpen && windfalls.length > 0 && (
            <div className="space-y-1 mb-3">
              {windfalls.map(w => (
                <div key={w.id} className="flex items-center gap-3 text-sm">
                  {editingWf === w.id ? (
                    <>
                      <input className="input flex-1 py-1 text-xs" placeholder="Label" value={wfForm.label} onChange={e => setWfForm(f => ({ ...f, label: e.target.value }))} />
                      <input className="input w-24 py-1 text-xs" type="number" min="1" placeholder="£ amount" value={wfForm.amount} onChange={e => setWfForm(f => ({ ...f, amount: e.target.value }))} />
                      <select
                        className="input py-1 text-xs"
                        value={wfForm.apply_month}
                        onChange={e => setWfForm(f => ({ ...f, apply_month: e.target.value }))}
                      >
                        <option value="">Select month</option>
                        {(plan?.chartData || []).map(p => (
                          <option key={p.month} value={p.month}>{formatMonthLabel(p.date)}</option>
                        ))}
                      </select>
                      <button onClick={saveWindfall} className="btn-sm-teal text-xs">Save</button>
                      <button onClick={() => { setEditingWf(null); setWfForm({ label: '', amount: '', apply_month: '' }); }} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="text-violet-400 font-medium">£{w.amount.toLocaleString('en-GB')}</span>
                      <span className="text-slate-300">{w.label}</span>
                      <span className="text-slate-500">
                        {monthDateMap[w.apply_month] ? formatMonthLabel(monthDateMap[w.apply_month]) : `month ${w.apply_month}`}
                      </span>
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
          {wfOpen && editingWf === null && (
            <div className="flex items-center gap-2 flex-wrap">
              <input className="input flex-1 min-w-[120px] py-1 text-xs" placeholder="Label (e.g. Tax rebate)" value={wfForm.label} onChange={e => setWfForm(f => ({ ...f, label: e.target.value }))} />
              <input className="input w-28 py-1 text-xs" type="number" min="1" placeholder="£ amount" value={wfForm.amount} onChange={e => setWfForm(f => ({ ...f, amount: e.target.value }))} />
              <select
                className="input py-1 text-xs"
                value={wfForm.apply_month}
                onChange={e => setWfForm(f => ({ ...f, apply_month: e.target.value }))}
              >
                <option value="">Select month</option>
                {(plan?.chartData || []).map(p => (
                  <option key={p.month} value={p.month}>{formatMonthLabel(p.date)}</option>
                ))}
              </select>
              <button onClick={saveWindfall} disabled={!wfForm.label || !wfForm.amount || !wfForm.apply_month} className="btn-sm-teal text-xs disabled:opacity-40"><Plus size={12} /> Add windfall</button>
            </div>
          )}
        </div>

        {/* Expense Events */}
        <div className="mt-5 border-t border-slate-700 pt-4">
          <button
            onClick={() => setEvOpen(o => !o)}
            className="flex items-center gap-2 w-full text-left mb-3 group"
          >
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-slate-300 transition-colors">
              Expense Events
            </h4>
            {expenseEvents.length > 0 && (
              <span className="text-xs text-slate-500">({expenseEvents.length})</span>
            )}
            <span className="ml-auto text-slate-500 group-hover:text-slate-400 transition-colors">
              {evOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>
          {evOpen && (
            <p className="text-xs text-slate-500 mb-3">
              Schedule one-off costs (holidays, birthdays, car repairs) to see their impact on your payoff timeline.
            </p>
          )}
          {evOpen && expenseEvents.length > 0 && (
            <div className="space-y-1 mb-3">
              {expenseEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 text-sm">
                  {editingEv === ev.id ? (
                    <>
                      <input className="input flex-1 py-1 text-xs" placeholder="Label" value={evForm.label} onChange={e => setEvForm(f => ({ ...f, label: e.target.value }))} />
                      <input className="input w-24 py-1 text-xs" type="number" min="1" placeholder="£ amount" value={evForm.amount} onChange={e => setEvForm(f => ({ ...f, amount: e.target.value }))} />
                      <select className="input py-1 text-xs" value={evForm.category} onChange={e => setEvForm(f => ({ ...f, category: e.target.value }))}>
                        <option value="expected">Expected</option>
                        <option value="unexpected">Unexpected</option>
                      </select>
                      <select className="input py-1 text-xs" value={evForm.apply_month} onChange={e => setEvForm(f => ({ ...f, apply_month: e.target.value }))}>
                        <option value="">Select month</option>
                        {(plan?.chartData || []).map(p => (
                          <option key={p.month} value={p.month}>{formatMonthLabel(p.date)}</option>
                        ))}
                      </select>
                      <button onClick={saveExpenseEvent} className="btn-sm-teal text-xs">Save</button>
                      <button onClick={() => { setEditingEv(null); setEvForm({ label: '', amount: '', apply_month: '', category: 'expected' }); }} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className={`font-medium ${ev.category === 'unexpected' ? 'text-red-400' : 'text-amber-400'}`}>
                        -£{ev.amount.toLocaleString('en-GB')}
                      </span>
                      <span className="text-slate-300">{ev.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${ev.category === 'unexpected' ? 'bg-red-900/40 text-red-300' : 'bg-amber-900/40 text-amber-300'}`}>
                        {ev.category}
                      </span>
                      <span className="text-slate-500">
                        {monthDateMap[ev.apply_month] ? formatMonthLabel(monthDateMap[ev.apply_month]) : `month ${ev.apply_month}`}
                      </span>
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => { setEditingEv(ev.id); setEvForm({ label: ev.label, amount: ev.amount, apply_month: ev.apply_month, category: ev.category }); }} className="p-1 text-slate-400 hover:text-slate-200"><Edit2 size={11} /></button>
                        <button onClick={() => deleteExpenseEvent(ev.id)} className="p-1 text-slate-400 hover:text-red-400"><Trash2 size={11} /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {evOpen && editingEv === null && (
            <div className="flex items-center gap-2 flex-wrap">
              <input className="input flex-1 min-w-[120px] py-1 text-xs" placeholder="Label (e.g. Holiday to Spain)" value={evForm.label} onChange={e => setEvForm(f => ({ ...f, label: e.target.value }))} />
              <input className="input w-28 py-1 text-xs" type="number" min="1" placeholder="£ amount" value={evForm.amount} onChange={e => setEvForm(f => ({ ...f, amount: e.target.value }))} />
              <select className="input py-1 text-xs" value={evForm.category} onChange={e => setEvForm(f => ({ ...f, category: e.target.value }))}>
                <option value="expected">Expected</option>
                <option value="unexpected">Unexpected</option>
              </select>
              <select className="input py-1 text-xs" value={evForm.apply_month} onChange={e => setEvForm(f => ({ ...f, apply_month: e.target.value }))}>
                <option value="">Select month</option>
                {(plan?.chartData || []).map(p => (
                  <option key={p.month} value={p.month}>{formatMonthLabel(p.date)}</option>
                ))}
              </select>
              <button
                onClick={saveExpenseEvent}
                disabled={!evForm.label || !evForm.amount || !evForm.apply_month}
                className="btn-sm-teal text-xs disabled:opacity-40"
              >
                <Plus size={12} /> Add expense
              </button>
            </div>
          )}
        </div>
      </div>

      {plan && <LumpSumAdvisor onWindfallSaved={loadWindfalls} planMonths={plan.payoffMonths} planChartData={plan.chartData} />}

      {!plan && !generating && (
        <div className="card p-12 text-center text-slate-500">
          <TrendingDown size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Add your debts and budget, then click "Generate Plan" to see your personalised payoff strategy.</p>
        </div>
      )}

      {plan && (
        <>
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
            <button
              onClick={() => setWhatIfOpen(o => !o)}
              className="flex items-center gap-2 w-full text-left group"
            >
              <h3 className="text-sm font-semibold text-slate-300 group-hover:text-slate-100 transition-colors">What If I Paid More?</h3>
              <span className="ml-auto text-slate-500 group-hover:text-slate-400 transition-colors">
                {whatIfOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </span>
            </button>
            {whatIfOpen && (
              <>
                <div className="flex flex-wrap items-center gap-4 mt-3">
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
              </>
            )}
          </div>

          {/* Timeline chart */}
          {plan.chartData?.length > 0 && (
            <div className="card p-6 mb-6">
              <button
                onClick={() => setChartOpen(o => !o)}
                className="flex items-center gap-2 w-full text-left group"
              >
                <h3 className="text-sm font-semibold text-slate-300 group-hover:text-slate-100 transition-colors">Balance Over Time</h3>
                <span className="ml-auto text-slate-500 group-hover:text-slate-400 transition-colors">
                  {chartOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </button>
              {chartOpen && (
                <div ref={chartContainerRef} className="print-chart-container mt-4" style={{ width: '100%' }}>
                  <LineChart width={chartWidth} height={300} data={plan.chartData} margin={{ top: 4, right: 16, bottom: 0, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatMonthLabel}
                      interval="preserveStartEnd"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                    />
                    <YAxis tickFormatter={v => `£${(v/1000).toFixed(0)}k`} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                    {paidOffDates.map((d, i) => (
                      <ReferenceLine key={i} x={d} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} />
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
              )}
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
                      <button
                        onClick={() => setAiOpen(o => !o)}
                        className="flex items-center gap-2 w-full text-left group"
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-xs uppercase tracking-wider text-teal-400 font-semibold group-hover:text-teal-300 transition-colors">Financial Analysis</p>
                          {aiData.cached && <span className="text-xs text-slate-500">(cached)</span>}
                        </div>
                        <span className="ml-auto text-slate-500 group-hover:text-slate-400 transition-colors">
                          {aiOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </span>
                      </button>
                      {aiOpen && (
                        <div className="prose prose-sm prose-invert max-w-[65ch] leading-relaxed text-slate-300 space-y-3 mt-4">
                          {renderNarrative(aiData.narrative)}
                        </div>
                      )}
                    </div>
                  )}
                  {aiData.budgetTips && (
                    <div className="card p-6">
                      <button
                        onClick={() => setBudgetTipsOpen(o => !o)}
                        className="flex items-center gap-2 w-full text-left group"
                      >
                        <p className="text-xs uppercase tracking-wider text-amber-400 font-semibold group-hover:text-amber-300 transition-colors">Budget Recommendations</p>
                        <span className="ml-auto text-slate-500 group-hover:text-slate-400 transition-colors">
                          {budgetTipsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </span>
                      </button>
                      {budgetTipsOpen && (
                        <div className="space-y-2 mt-4">
                          {renderBudgetTips(aiData.budgetTips)}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step-by-step guide */}
          <div className="card p-6 mb-6">
            <button
              onClick={() => setGuideOpen(o => !o)}
              className="flex items-center gap-2 w-full text-left group"
            >
              <h3 className="text-sm font-semibold text-slate-300 group-hover:text-slate-100 transition-colors">Monthly Action Guide</h3>
              <span className="ml-auto text-slate-500 group-hover:text-slate-400 transition-colors">
                {guideOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </span>
            </button>
            {guideOpen && (
              <div className="space-y-1 max-h-[600px] overflow-y-auto scrollbar-thin pr-2 print:max-h-none print:overflow-visible mt-4">
                {plan.guide?.map((entry, i) => (
                  <GuideEntry key={i} entry={entry} />
                ))}
              </div>
            )}
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
