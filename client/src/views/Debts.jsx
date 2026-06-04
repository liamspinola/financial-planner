import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, ChevronDown, ChevronUp, AlertTriangle, CreditCard } from 'lucide-react';
import { api } from '../lib/api';
import { gbp, aprPct, ukDate, daysUntil } from '../lib/format';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import { PROMO_ALERT_DAYS, APR_HIGH_THRESHOLD, APR_MID_THRESHOLD } from '../lib/constants';

const DEBT_TYPES = [
  { value: 'credit_card',   label: 'Credit Card' },
  { value: 'overdraft',     label: 'Overdraft' },
  { value: 'personal_loan', label: 'Personal Loan' },
  { value: 'store_card',    label: 'Store Card' },
  { value: 'bnpl',          label: 'Buy Now Pay Later' },
];

function blankTranche() {
  return { label: '', balance: '', apr: '', hasPromo: false, promoEndDate: '', postPromoApr: '' };
}

function blankDebt() {
  return {
    name: '', lender: '', debtType: 'credit_card',
    min_type: 'fixed', minimumPayment: '',
    minPaymentPct: '2', minPaymentFloor: '25',
    notes: '',
    tranches: [blankTranche()],
  };
}

function aprBadgeColor(apr) {
  if (apr >= APR_HIGH_THRESHOLD) return 'bg-red-500/20 text-red-300';
  if (apr >= APR_MID_THRESHOLD)  return 'bg-amber-500/20 text-amber-300';
  return 'bg-green-500/20 text-green-300';
}

function PromoCountdown({ days }) {
  if (days === null) return null;
  const color = days <= 30 ? 'text-red-400' : days <= 60 ? 'text-amber-400' : 'text-slate-400';
  return <span className={`text-xs ml-2 ${color}`}>({days}d remaining)</span>;
}

function DebtForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [formError, setFormError] = useState(null);
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setTranche = (i, k, v) => setForm(f => {
    const t = [...f.tranches];
    t[i] = { ...t[i], [k]: v };
    return { ...f, tranches: t };
  });
  const addTranche = () => setForm(f => ({ ...f, tranches: [...f.tranches, blankTranche()] }));
  const removeTranche = (i) => setForm(f => ({ ...f, tranches: f.tranches.filter((_, j) => j !== i) }));

  function buildPayload() {
    const usePct = form.min_type === 'pct';
    return {
      name: form.name,
      lender: form.lender,
      debtType: form.debtType,
      minimumPayment: usePct ? 0 : Math.round((parseFloat(form.minimumPayment) || 0) * 100),
      minPaymentPct:   usePct ? (parseFloat(form.minPaymentPct) || 0) / 100 : null,
      minPaymentFloor: usePct ? Math.round((parseFloat(form.minPaymentFloor) || 0) * 100) : null,
      notes: form.notes?.trim() || null,
      tranches: form.tranches.map(t => ({
        label: t.label,
        balance: Math.round((parseFloat(t.balance) || 0) * 100),
        apr: (parseFloat(t.apr) || 0) / 100,
        promoEndDate: t.hasPromo && t.promoEndDate ? t.promoEndDate : null,
        postPromoApr: t.hasPromo && t.postPromoApr ? (parseFloat(t.postPromoApr) || 0) / 100 : null,
      })),
    };
  }

  function validate() {
    if (!form.name.trim()) return 'Account name is required.';
    for (let i = 0; i < form.tranches.length; i++) {
      const t = form.tranches[i];
      if (!t.label.trim()) return `Segment ${i + 1}: label is required.`;
      const balance = parseFloat(t.balance);
      if (isNaN(balance) || balance < 0) return `Segment ${i + 1}: balance must be a non-negative number.`;
      const apr = parseFloat(t.apr);
      if (isNaN(apr) || apr < 0 || apr > 200) return `Segment ${i + 1}: APR must be between 0 and 200.`;
      if (t.hasPromo) {
        if (!t.promoEndDate) return `Segment ${i + 1}: promo end date is required when promotional rate is enabled.`;
        const postApr = parseFloat(t.postPromoApr);
        if (isNaN(postApr) || postApr < 0 || postApr > 200) return `Segment ${i + 1}: post-promo APR must be between 0 and 200.`;
      }
    }
    return null;
  }

  function handleSave() {
    const error = validate();
    if (error) { setFormError(error); return; }
    setFormError(null);
    onSave(buildPayload());
  }

  return (
    <div className="card p-5 space-y-4">
      {formError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{formError}</div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="debt-name" className="label">Account Name *</label>
          <input id="debt-name" className="input" placeholder="e.g. Barclaycard Visa" value={form.name} onChange={e => setField('name', e.target.value)} />
        </div>
        <div>
          <label htmlFor="debt-lender" className="label">Lender</label>
          <input id="debt-lender" className="input" placeholder="e.g. Barclays" value={form.lender} onChange={e => setField('lender', e.target.value)} />
        </div>
        <div>
          <label htmlFor="debt-type" className="label">Type</label>
          <select id="debt-type" className="input" value={form.debtType} onChange={e => setField('debtType', e.target.value)}>
            {DEBT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Minimum Payment</label>
          <div className="flex gap-1 mb-2">
            {['fixed', 'pct'].map(type => (
              <button key={type} type="button" onClick={() => setField('min_type', type)}
                className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                  form.min_type === type
                    ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                    : 'bg-transparent border-slate-600 text-slate-400 hover:border-slate-500'
                }`}
              >
                {type === 'fixed' ? 'Fixed £' : '% of balance'}
              </button>
            ))}
          </div>
          {form.min_type === 'fixed' ? (
            <input className="input" type="number" min="0" step="0.01" placeholder="0.00"
              value={form.minimumPayment} onChange={e => setField('minimumPayment', e.target.value)} />
          ) : (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="label text-xs">% of balance</label>
                <input className="input" type="number" min="0" max="100" step="0.1" placeholder="2"
                  value={form.minPaymentPct} onChange={e => setField('minPaymentPct', e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="label text-xs">Floor (£)</label>
                <input className="input" type="number" min="0" step="0.01" placeholder="25"
                  value={form.minPaymentFloor} onChange={e => setField('minPaymentFloor', e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="label">Notes (optional)</label>
        <textarea className="input resize-none" rows={2} placeholder="Lender phone number, balance transfer ref, reminders…"
          value={form.notes} onChange={e => setField('notes', e.target.value)} />
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
                  <label htmlFor={`tranche-label-${i}`} className="label">Label</label>
                  <input id={`tranche-label-${i}`} className="input" placeholder="e.g. Balance Transfer" value={t.label} onChange={e => setTranche(i, 'label', e.target.value)} />
                </div>
                <div>
                  <label htmlFor={`tranche-balance-${i}`} className="label">Balance (£)</label>
                  <input id={`tranche-balance-${i}`} className="input" type="number" min="0" step="0.01" value={t.balance} onChange={e => setTranche(i, 'balance', e.target.value)} />
                </div>
                <div>
                  <label htmlFor={`tranche-apr-${i}`} className="label">APR (%)</label>
                  <input id={`tranche-apr-${i}`} className="input" type="number" min="0" step="0.1" value={t.apr} onChange={e => setTranche(i, 'apr', e.target.value)} />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label htmlFor={`tranche-promo-${i}`} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input id={`tranche-promo-${i}`} type="checkbox" className="accent-teal-500" checked={t.hasPromo} onChange={e => setTranche(i, 'hasPromo', e.target.checked)} />
                  Promotional rate (expires)
                </label>
                {form.tranches.length > 1 && (
                  <button onClick={() => removeTranche(i)} aria-label={`Remove segment ${i + 1}`} className="ml-auto text-xs text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
                )}
              </div>

              {t.hasPromo && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`tranche-promo-date-${i}`} className="label">Promo End Date</label>
                    <input id={`tranche-promo-date-${i}`} className="input" type="date" value={t.promoEndDate} onChange={e => setTranche(i, 'promoEndDate', e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor={`tranche-post-apr-${i}`} className="label">Post-Promo APR (%)</label>
                    <input id={`tranche-post-apr-${i}`} className="input" type="number" min="0" step="0.1" placeholder="e.g. 22.9" value={t.postPromoApr} onChange={e => setTranche(i, 'postPromoApr', e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={handleSave} className="btn-teal">Save Debt</button>
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

function DebtCard({ debt, tranches, onEdit, onDelete, confirmingDelete, onConfirmDelete, onCancelDelete }) {
  const [expanded, setExpanded] = useState(false);
  const totalBalance = tranches.reduce((s, t) => s + t.balance, 0);
  const typeLabel = DEBT_TYPES.find(x => x.value === debt.debtType)?.label || debt.debtType;

  const promoAlerts = tranches.filter(t => {
    if (!t.promoEndDate) return false;
    const days = daysUntil(t.promoEndDate);
    return days !== null && days <= PROMO_ALERT_DAYS && days >= 0;
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
            <p className="text-xs text-slate-400">
              Min: {debt.minPaymentPct != null
                ? `${(debt.minPaymentPct * 100).toFixed(1)}%${debt.minPaymentFloor ? ` (min ${gbp(debt.minPaymentFloor)})` : ''}`
                : `${gbp(debt.minimumPayment)}/mo`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {tranches.length} segment{tranches.length !== 1 ? 's' : ''}
          </button>
          <div className="ml-auto flex items-center gap-1">
            {confirmingDelete ? (
              <>
                <span className="text-xs text-slate-400 mr-1">Delete?</span>
                <button onClick={onConfirmDelete} className="px-2 py-1 rounded text-xs text-red-300 bg-red-500/20 hover:bg-red-500/30">Yes</button>
                <button onClick={onCancelDelete} className="px-2 py-1 rounded text-xs text-slate-400 hover:bg-slate-700">No</button>
              </>
            ) : (
              <>
                <button onClick={onEdit} aria-label="Edit debt" className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700"><Edit2 size={13} /></button>
                <button onClick={onDelete} aria-label="Delete debt" className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={13} /></button>
              </>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-700 px-5 py-4 space-y-3">
          {[...tranches].sort((a, b) => b.apr - a.apr).map(t => {
            const days = t.promoEndDate ? daysUntil(t.promoEndDate) : null;
            return (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-slate-200 font-medium">{t.label}</span>
                  {t.promoEndDate && (
                    <span className="ml-2 text-xs text-slate-400">
                      Promo until {ukDate(t.promoEndDate)}
                      <PromoCountdown days={days} />
                      {t.postPromoApr && ` → then ${aprPct(t.postPromoApr)}`}
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
          {debt.notes && (
            <div className="pt-2 border-t border-slate-700/50">
              <p className="text-xs text-slate-500 mb-1">Notes</p>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{debt.notes}</p>
            </div>
          )}
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
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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
      setTranches([...tranches.filter(t => t.debtId !== editing), ...data.tranches]);
      setEditing(null);
    } else {
      const data = await api.createDebt(payload);
      setDebts([...debts, data.debt]);
      setTranches([...tranches, ...data.tranches]);
      setAdding(false);
    }
  }

  async function deleteDebt(id) {
    await api.deleteDebt(id);
    setDebts(debts.filter(d => d.id !== id));
    setTranches(tranches.filter(t => t.debtId !== id));
    setConfirmDeleteId(null);
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
          const debtTranches = tranches.filter(t => t.debtId === debt.id);
          return editing === debt.id ? (
            <DebtForm
              key={debt.id}
              initial={{
                name: debt.name, lender: debt.lender || '', debtType: debt.debtType,
                min_type: debt.minPaymentPct != null ? 'pct' : 'fixed',
                minimumPayment: debt.minimumPayment != null ? (debt.minimumPayment / 100).toFixed(2) : '',
                minPaymentPct:   debt.minPaymentPct   != null ? (debt.minPaymentPct * 100).toFixed(1)   : '2',
                minPaymentFloor: debt.minPaymentFloor != null ? (debt.minPaymentFloor / 100).toFixed(2) : '25',
                notes: debt.notes || '',
                tranches: debtTranches.map(t => ({
                  label: t.label, balance: t.balance != null ? (t.balance / 100).toFixed(2) : '',
                  apr: (t.apr * 100).toFixed(2),
                  hasPromo: !!t.promoEndDate,
                  promoEndDate: t.promoEndDate || '',
                  postPromoApr: t.postPromoApr ? (t.postPromoApr * 100).toFixed(2) : '',
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
              onDelete={() => setConfirmDeleteId(debt.id)}
              confirmingDelete={confirmDeleteId === debt.id}
              onConfirmDelete={() => deleteDebt(debt.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
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
