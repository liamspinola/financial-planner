import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, ChevronDown, ChevronUp, AlertTriangle, CreditCard } from 'lucide-react';
import { api } from '../lib/api';
import { gbp, aprPct, ukDate, daysUntil } from '../lib/format';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';

const DEBT_TYPES = [
  { value: 'credit_card',   label: 'Credit Card' },
  { value: 'overdraft',     label: 'Overdraft' },
  { value: 'personal_loan', label: 'Personal Loan' },
  { value: 'store_card',    label: 'Store Card' },
  { value: 'bnpl',          label: 'Buy Now Pay Later' },
];

function blankTranche() {
  return { label: '', balance: '', apr: '', hasPromo: false, promo_end_date: '', post_promo_apr: '' };
}

function blankDebt() {
  return { name: '', lender: '', debt_type: 'credit_card', minimum_payment: '', tranches: [blankTranche()] };
}

function aprBadgeColor(apr) {
  if (apr >= 0.20) return 'bg-red-500/20 text-red-300';
  if (apr >= 0.10) return 'bg-amber-500/20 text-amber-300';
  return 'bg-green-500/20 text-green-300';
}

function PromoCountdown({ days }) {
  if (days === null) return null;
  const color = days <= 30 ? 'text-red-400' : days <= 60 ? 'text-amber-400' : 'text-slate-400';
  return <span className={`text-xs ml-2 ${color}`}>({days}d remaining)</span>;
}

function DebtForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setTranche = (i, k, v) => setForm(f => {
    const t = [...f.tranches];
    t[i] = { ...t[i], [k]: v };
    return { ...f, tranches: t };
  });
  const addTranche = () => setForm(f => ({ ...f, tranches: [...f.tranches, blankTranche()] }));
  const removeTranche = (i) => setForm(f => ({ ...f, tranches: f.tranches.filter((_, j) => j !== i) }));

  function buildPayload() {
    return {
      name: form.name,
      lender: form.lender,
      debt_type: form.debt_type,
      minimum_payment: parseFloat(form.minimum_payment) || 0,
      tranches: form.tranches.map(t => ({
        label: t.label,
        balance: parseFloat(t.balance) || 0,
        apr: (parseFloat(t.apr) || 0) / 100,
        promo_end_date: t.hasPromo && t.promo_end_date ? t.promo_end_date : null,
        post_promo_apr: t.hasPromo && t.post_promo_apr ? (parseFloat(t.post_promo_apr) || 0) / 100 : null,
      })),
    };
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Account Name *</label>
          <input className="input" placeholder="e.g. Barclaycard Visa" value={form.name} onChange={e => setField('name', e.target.value)} />
        </div>
        <div>
          <label className="label">Lender</label>
          <input className="input" placeholder="e.g. Barclays" value={form.lender} onChange={e => setField('lender', e.target.value)} />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={form.debt_type} onChange={e => setField('debt_type', e.target.value)}>
            {DEBT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Monthly Minimum Payment (£)</label>
          <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={form.minimum_payment} onChange={e => setField('minimum_payment', e.target.value)} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Balance Segments</h4>
          <button onClick={addTranche} className="btn-sm-teal"><Plus size={12} /> Add segment</button>
        </div>
        <div className="space-y-3">
          {form.tranches.map((t, i) => (
            <div key={i} className="bg-slate-700/30 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Label</label>
                  <input className="input" placeholder="e.g. Balance Transfer" value={t.label} onChange={e => setTranche(i, 'label', e.target.value)} />
                </div>
                <div>
                  <label className="label">Balance (£)</label>
                  <input className="input" type="number" min="0" step="0.01" value={t.balance} onChange={e => setTranche(i, 'balance', e.target.value)} />
                </div>
                <div>
                  <label className="label">APR (%)</label>
                  <input className="input" type="number" min="0" step="0.1" value={t.apr} onChange={e => setTranche(i, 'apr', e.target.value)} />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" className="accent-teal-500" checked={t.hasPromo} onChange={e => setTranche(i, 'hasPromo', e.target.checked)} />
                  Promotional rate (expires)
                </label>
                {form.tranches.length > 1 && (
                  <button onClick={() => removeTranche(i)} className="ml-auto text-xs text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
                )}
              </div>

              {t.hasPromo && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Promo End Date</label>
                    <input className="input" type="date" value={t.promo_end_date} onChange={e => setTranche(i, 'promo_end_date', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Post-Promo APR (%)</label>
                    <input className="input" type="number" min="0" step="0.1" placeholder="e.g. 22.9" value={t.post_promo_apr} onChange={e => setTranche(i, 'post_promo_apr', e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={() => onSave(buildPayload())} className="btn-teal">Save Debt</button>
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

function DebtCard({ debt, tranches, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const totalBalance = tranches.reduce((s, t) => s + t.balance, 0);
  const typeLabel = DEBT_TYPES.find(x => x.value === debt.debt_type)?.label || debt.debt_type;

  const promoAlerts = tranches.filter(t => {
    if (!t.promo_end_date) return false;
    const days = daysUntil(t.promo_end_date);
    return days !== null && days <= 60 && days >= 0;
  });

  return (
    <div className="card">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-slate-100">{debt.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">{typeLabel}</span>
              {promoAlerts.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <AlertTriangle size={11} /> Promo expiring
                </span>
              )}
            </div>
            {debt.lender && <p className="text-sm text-slate-400">{debt.lender}</p>}
          </div>
          <div className="text-right ml-4">
            <p className="text-lg font-semibold tabular-nums text-red-400">{gbp(totalBalance)}</p>
            <p className="text-xs text-slate-400">Min: {gbp(debt.minimum_payment)}/mo</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {tranches.length} segment{tranches.length !== 1 ? 's' : ''}
          </button>
          <div className="ml-auto flex gap-1">
            <button onClick={onEdit} className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700"><Edit2 size={13} /></button>
            <button onClick={onDelete} className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={13} /></button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-700 px-5 py-4 space-y-3">
          {[...tranches].sort((a, b) => b.apr - a.apr).map(t => {
            const days = t.promo_end_date ? daysUntil(t.promo_end_date) : null;
            return (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-slate-200 font-medium">{t.label}</span>
                  {t.promo_end_date && (
                    <span className="ml-2 text-xs text-slate-400">
                      Promo until {ukDate(t.promo_end_date)}
                      <PromoCountdown days={days} />
                      {t.post_promo_apr && ` → then ${aprPct(t.post_promo_apr)}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${aprBadgeColor(t.apr)}`}>{aprPct(t.apr)}</span>
                  <span className="tabular-nums text-slate-200">{gbp(t.balance)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Debts() {
  const [debts, setDebts] = useState([]);
  const [tranches, setTranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getDebts();
      setDebts(data.debts);
      setTranches(data.tranches);
    } finally {
      setLoading(false);
    }
  }

  async function saveDebt(payload) {
    if (editing) {
      const data = await api.updateDebt(editing, payload);
      setDebts(debts.map(d => d.id === editing ? data.debt : d));
      setTranches([...tranches.filter(t => t.debt_id !== editing), ...data.tranches]);
      setEditing(null);
    } else {
      const data = await api.createDebt(payload);
      setDebts([...debts, data.debt]);
      setTranches([...tranches, ...data.tranches]);
      setAdding(false);
    }
  }

  async function deleteDebt(id) {
    if (!confirm('Delete this debt and all its balance segments?')) return;
    await api.deleteDebt(id);
    setDebts(debts.filter(d => d.id !== id));
    setTranches(tranches.filter(t => t.debt_id !== id));
  }

  const totalDebt = tranches.reduce((s, t) => s + t.balance, 0);

  if (loading) return <div className="p-8 flex justify-center"><Spinner /></div>;

  return (
    <div className="p-8">
      <PageHeader
        title="Debts"
        subtitle={debts.length > 0 ? `${debts.length} account${debts.length !== 1 ? 's' : ''} · ${gbp(totalDebt)} total` : 'Add your debt accounts'}
        actions={<button onClick={() => { setAdding(true); setEditing(null); }} className="btn-teal"><Plus size={15} /> Add Debt</button>}
      />

      {adding && (
        <div className="mb-6">
          <DebtForm initial={blankDebt()} onSave={saveDebt} onCancel={() => setAdding(false)} />
        </div>
      )}

      <div className="space-y-4">
        {debts.map(debt => {
          const debtTranches = tranches.filter(t => t.debt_id === debt.id);
          return editing === debt.id ? (
            <DebtForm
              key={debt.id}
              initial={{
                name: debt.name, lender: debt.lender || '', debt_type: debt.debt_type,
                minimum_payment: debt.minimum_payment,
                tranches: debtTranches.map(t => ({
                  label: t.label, balance: t.balance,
                  apr: (t.apr * 100).toFixed(2),
                  hasPromo: !!t.promo_end_date,
                  promo_end_date: t.promo_end_date || '',
                  post_promo_apr: t.post_promo_apr ? (t.post_promo_apr * 100).toFixed(2) : '',
                })),
              }}
              onSave={saveDebt}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <DebtCard
              key={debt.id}
              debt={debt}
              tranches={debtTranches}
              onEdit={() => { setEditing(debt.id); setAdding(false); }}
              onDelete={() => deleteDebt(debt.id)}
            />
          );
        })}

        {debts.length === 0 && !adding && (
          <div className="text-center py-16 text-slate-500">
            <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No debts added yet. Click "Add Debt" to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
