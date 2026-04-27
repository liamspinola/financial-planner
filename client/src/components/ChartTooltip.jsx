import { gbp, formatMonthLabel } from '../lib/format';

export default function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  // Use the `date` field from the data point (YYYY-MM-DD string) rather than
  // the raw x-axis `label`, which is the numeric month index and not a string.
  const dateStr = payload[0]?.payload?.date;
  return (
    <div className="bg-navy-800 border border-slate-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-400 mb-2">{formatMonthLabel(dateStr)}</p>
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
