export default function StatCard({ label, value, sub, color = 'teal', icon: Icon }) {
  const colorMap = {
    teal:   'border-teal-500/30 bg-teal-500/5   text-teal-400',
    red:    'border-red-500/30   bg-red-500/5   text-red-400',
    amber:  'border-amber-500/30 bg-amber-500/5 text-amber-400',
    green:  'border-green-500/30 bg-green-500/5 text-green-400',
  };

  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        {Icon && <Icon size={16} className="opacity-60 mt-0.5" />}
      </div>
      <p className="text-2xl font-semibold tabular-nums text-slate-100">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
