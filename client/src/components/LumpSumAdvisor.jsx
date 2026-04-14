import { useState, useEffect } from 'react';
import { CheckCircle, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { gbp, monthsLabel, aprPct, formatMonthLabel } from '../lib/format';
import Spinner from './Spinner';

function OptionCard({ option, amount, applyMonth, onWindfallSaved }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const label = option.targetDebtName
        ? `Lump sum – ${option.targetDebtName}`
        : `Lump sum – ${option.name}`;
      await api.createWindfall({ label, amount, apply_month: applyMonth });
      setSaved(true);
      onWindfallSaved();
    } catch {
      // ignore — user will see the windfall list unchanged
    } finally {
      setSaving(false);
    }
  }

  const border = option.recommended
    ? 'border-green-500/50 bg-green-500/5'
    : 'border-slate-700 bg-slate-800/50';

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${border}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-100">{option.name}</p>
        {option.recommended && (
          <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/30 rounded-full px-2 py-0.5">
            <CheckCircle size={11} /> Recommended
          </span>
        )}
      </div>

      {/* Target */}
      {option.targetDebtName && (
        <p className="text-xs text-slate-400">
          Apply {gbp(amount)} to <span className="text-slate-200 font-medium">{option.targetDebtName}</span>
          {option.targetApr != null && (
            <span className="text-slate-500"> ({aprPct(option.targetApr)} APR)</span>
          )}
        </p>
      )}

      {/* Clear & Continue breakdown */}
      {option.clearDetail && (
        <div className="text-xs text-slate-400 space-y-0.5">
          {option.clearDetail.cleared.map(c => (
            <p key={c.debtId}>
              Clear <span className="text-slate-200 font-medium">{c.debtName}</span>{' '}
              <span className="text-slate-500">({gbp(c.amount)})</span>
            </p>
          ))}
          {option.clearDetail.remainderTarget && (
            <p>
              Remainder to{' '}
              <span className="text-slate-200 font-medium">
                {option.clearDetail.remainderTarget.debtName}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-700/40 px-3 py-2 text-center">
          <p className={`text-xl font-bold tabular-nums ${option.monthsSaved > 0 ? 'text-green-400' : 'text-slate-400'}`}>
            {option.monthsSaved > 0 ? `-${option.monthsSaved}mo` : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">months saved</p>
        </div>
        <div className="rounded-lg bg-slate-700/40 px-3 py-2 text-center">
          <p className={`text-xl font-bold tabular-nums ${option.interestSaved > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
            {option.interestSaved > 0 ? gbp(option.interestSaved, 0) : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">interest saved</p>
        </div>
      </div>

      <div className="text-xs text-slate-400">
        Debt-free <span className="text-slate-200 font-medium">{option.debtFreeDate}</span>
      </div>

      {/* Reasoning */}
      <p className="text-xs text-slate-500 leading-relaxed">{option.reasoning}</p>

      {/* Save button */}
      <div className="mt-auto pt-1">
        {saved ? (
          <p className="text-xs text-green-400 flex items-center gap-1">
            <CheckCircle size={12} /> Saved — re-generate plan to see the impact
          </p>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full btn-teal text-xs disabled:opacity-50"
          >
            {saving ? <Spinner size={13} /> : 'Save as Windfall'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function LumpSumAdvisor({ onWindfallSaved, planMonths, planChartData }) {
  const [amount, setAmount] = useState('');
  const [applyMonth, setApplyMonth] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const maxMonth = planMonths || 60;

  // Clamp applyMonth if the plan shortens (e.g. after re-generating with fewer debts)
  useEffect(() => {
    if (planMonths && applyMonth > planMonths) {
      setApplyMonth(1);
      setResult(null);
    }
  }, [planMonths]);

  async function handleAnalyse() {
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.lumpsumAdvise(num, applyMonth);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Analysis failed — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5 mb-6 no-print">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Zap size={15} className="text-amber-400" />
        <h3 className="text-sm font-semibold text-slate-300">Lump Sum Advisor</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Enter a one-off amount to see where depositing it makes the biggest dent in your debt.
      </p>

      {/* Input row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">£</span>
          <input
            type="number"
            min={1}
            step={1}
            placeholder="e.g. 1300"
            value={amount}
            onChange={e => { setAmount(e.target.value); setResult(null); }}
            className="pl-7 w-36 bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Apply in month</span>
          <select
            value={applyMonth}
            onChange={e => { setApplyMonth(Number(e.target.value)); setResult(null); }}
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
          >
            {(planChartData || Array.from({ length: maxMonth }, (_, i) => ({ month: i + 1, date: null }))).map(p => (
              <option key={p.month} value={p.month}>
                {p.date ? formatMonthLabel(p.date) : `Month ${p.month}`}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleAnalyse}
          disabled={loading || !amount || parseFloat(amount) <= 0}
          className="btn-teal text-xs disabled:opacity-50"
        >
          {loading ? <Spinner size={13} /> : 'Analyse'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Results */}
      {result && (
        <div className="mt-5">
          {/* Baseline strip */}
          <p className="text-xs text-slate-500 mb-3">
            Without this payment — debt-free{' '}
            <span className="text-slate-300">{result.baseline.debtFreeDate}</span>,{' '}
            <span className="text-slate-300">{gbp(result.baseline.totalInterest, 0)}</span> total interest
            {' '}({monthsLabel(result.baseline.payoffMonths)})
          </p>

          {/* Option cards */}
          <div className={`grid gap-4 ${result.options.length === 1 ? 'grid-cols-1 max-w-xs' : result.options.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
            {result.options.map(option => (
              <OptionCard
                key={option.id}
                option={option}
                amount={result.amount}
                applyMonth={result.applyMonth}
                onWindfallSaved={onWindfallSaved}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
