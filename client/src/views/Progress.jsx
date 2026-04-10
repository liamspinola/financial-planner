import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Plus, Trash2, Save } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { api } from '../lib/api';
import { gbp } from '../lib/format';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ChartTooltip from '../components/ChartTooltip';
import { DEBT_COLORS } from '../lib/constants';

export default function Progress() {
  const [plan, setPlan] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balanceInputs, setBalanceInputs] = useState({});
  const [snapshotNote, setSnapshotNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [chartWidth, setChartWidth] = useState(680);
  const chartRef = useRef(null);

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [p, s] = await Promise.all([api.getCachedPlan(), api.getProgress()]);
        setPlan(p);
        setSnapshots(s);
        // Pre-populate inputs from last snapshot if it's not for this month
        if (p && s.length > 0) {
          const last = s[s.length - 1];
          if (last.snapshot_month !== currentMonth) {
            setBalanceInputs(Object.fromEntries(
              p.debtIds.map(id => [id, last.balances[id] ?? ''])
            ));
          } else {
            setBalanceInputs(Object.fromEntries(
              p.debtIds.map(id => [id, last.balances[id] ?? ''])
            ));
            setSnapshotNote(last.notes || '');
          }
        } else if (p) {
          setBalanceInputs(Object.fromEntries(p.debtIds.map(id => [id, ''])));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Resize observer for chart
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setChartWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [plan, snapshots]);

  useEffect(() => {
    const fn = () => { flushSync(() => setChartWidth(680)); };
    window.addEventListener('beforeprint', fn);
    return () => window.removeEventListener('beforeprint', fn);
  }, []);

  async function saveSnapshot() {
    if (!plan) return;
    setSaving(true);
    try {
      const balances = Object.fromEntries(
        plan.debtIds.map(id => [id, parseFloat(balanceInputs[id]) || 0])
      );
      const saved = await api.saveSnapshot({ snapshot_month: currentMonth, balances, notes: snapshotNote || null });
      setSnapshots(prev => {
        const existing = prev.findIndex(s => s.snapshot_month === currentMonth);
        if (existing >= 0) { const n = [...prev]; n[existing] = saved; return n; }
        return [...prev, saved];
      });
    } finally { setSaving(false); }
  }

  async function deleteSnapshot(id) {
    await api.deleteSnapshot(id);
    setSnapshots(prev => prev.filter(s => s.id !== id));
  }

  if (loading) return <div className="p-8 flex justify-center"><Spinner /></div>;

  if (!plan) {
    return (
      <div className="p-8">
        <PageHeader title="Progress" subtitle="Track actual balances vs plan" />
        <div className="card p-12 text-center text-slate-500">
          <p className="text-sm">Generate a payoff plan first, then come back to record your monthly progress.</p>
        </div>
      </div>
    );
  }

  // Build compound chart data: plan projection (dashed) + actual snapshots (solid)
  // Map snapshot_month to plan month index using plan start date
  const planStartDate = plan.chartData?.[0]?.date; // YYYY-MM-DD
  const planStartYM = planStartDate ? planStartDate.slice(0, 7) : null;

  function monthOffset(ym) {
    if (!planStartYM) return null;
    const [py, pm] = planStartYM.split('-').map(Number);
    const [y, m]   = ym.split('-').map(Number);
    return (y - py) * 12 + (m - pm) + 1; // 1-indexed to match plan month
  }

  // Plan projected data points
  const chartData = (plan.chartData || []).map(pt => {
    const row = { month: pt.month };
    for (const id of plan.debtIds) row[`plan_${id}`] = pt[`debt_${id}`] ?? 0;
    return row;
  });

  // Overlay actual snapshot data
  for (const snap of snapshots) {
    const offset = monthOffset(snap.snapshot_month);
    if (offset == null || offset < 1 || offset > chartData.length) continue;
    const row = chartData[offset - 1];
    if (!row) continue;
    for (const id of plan.debtIds) row[`actual_${id}`] = snap.balances[id] ?? 0;
  }

  // "vs plan" comparison: latest snapshot vs plan projection for that month
  let vsMessage = null;
  if (snapshots.length > 0) {
    const latest = snapshots[snapshots.length - 1];
    const offset = monthOffset(latest.snapshot_month);
    if (offset != null && offset >= 1 && offset <= chartData.length) {
      const planTotal  = plan.debtIds.reduce((s, id) => s + (chartData[offset - 1][`plan_${id}`] || 0), 0);
      const actualTotal = latest.total_balance;
      const diff = planTotal - actualTotal;
      if (Math.abs(diff) > 1) {
        vsMessage = diff > 0
          ? `${gbp(diff)} ahead of plan — great work!`
          : `${gbp(Math.abs(diff))} behind plan`;
      } else {
        vsMessage = 'Right on track with the plan.';
      }
    }
  }

  const thisMonthSnap = snapshots.find(s => s.snapshot_month === currentMonth);

  return (
    <div className="p-8">
      <PageHeader title="Progress" subtitle="Record monthly balances and compare against your plan" />

      {/* Record this month */}
      <div className="card p-6 mb-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">
          Record This Month
          <span className="ml-2 text-xs font-normal text-slate-500">
            {currentMonth}{thisMonthSnap ? ' — already recorded (editing)' : ''}
          </span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
          {plan.debtIds.map(id => (
            <div key={id}>
              <label className="label text-xs">{plan.debtNames[id]}</label>
              <input
                className="input py-1 text-sm"
                type="number" min="0" step="0.01"
                placeholder="Current balance (£)"
                value={balanceInputs[id] ?? ''}
                onChange={e => setBalanceInputs(b => ({ ...b, [id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            className="input flex-1 min-w-[160px] py-1 text-sm"
            placeholder="Optional note (e.g. made extra payment)"
            value={snapshotNote}
            onChange={e => setSnapshotNote(e.target.value)}
          />
          <button onClick={saveSnapshot} disabled={saving} className="btn-teal disabled:opacity-50">
            {saving ? <Spinner size={14} /> : <Save size={14} />}
            {thisMonthSnap ? 'Update snapshot' : 'Save snapshot'}
          </button>
        </div>
        {vsMessage && (
          <p className={`mt-3 text-sm font-medium ${vsMessage.includes('ahead') ? 'text-green-400' : vsMessage.includes('behind') ? 'text-amber-400' : 'text-teal-400'}`}>
            vs plan: {vsMessage}
          </p>
        )}
      </div>

      {/* Compound chart */}
      {chartData.length > 0 && (
        <div className="card p-6 mb-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-1">Actual vs Plan</h3>
          <p className="text-xs text-slate-500 mb-4">Dashed = plan projection · Solid = recorded actuals</p>
          <div ref={chartRef} style={{ width: '100%' }}>
            <LineChart width={chartWidth} height={300} data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              {plan.debtIds.map((id, i) => (
                <>
                  <Line key={`plan_${id}`} type="monotone" dataKey={`plan_${id}`}
                    name={`${plan.debtNames[id]} (plan)`}
                    stroke={DEBT_COLORS[i % DEBT_COLORS.length]}
                    strokeDasharray="5 3" dot={false} strokeWidth={1.5} strokeOpacity={0.6}
                  />
                  <Line key={`actual_${id}`} type="monotone" dataKey={`actual_${id}`}
                    name={`${plan.debtNames[id]} (actual)`}
                    stroke={DEBT_COLORS[i % DEBT_COLORS.length]}
                    dot={{ r: 3 }} strokeWidth={2}
                    connectNulls={false}
                  />
                </>
              ))}
            </LineChart>
          </div>
        </div>
      )}

      {/* Snapshot history */}
      {snapshots.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Snapshot History</h3>
          <div className="space-y-2">
            {[...snapshots].reverse().map(snap => (
              <div key={snap.id} className="flex items-center gap-4 text-sm border-b border-slate-700/50 pb-2 last:border-0 last:pb-0">
                <span className="text-slate-400 w-20 shrink-0">{snap.snapshot_month}</span>
                <span className="text-red-300 font-medium tabular-nums">{gbp(snap.total_balance)}</span>
                {snap.notes && <span className="text-slate-500 text-xs flex-1 truncate">{snap.notes}</span>}
                <button onClick={() => deleteSnapshot(snap.id)} className="ml-auto p-1 text-slate-500 hover:text-red-400">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
