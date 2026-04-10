import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { gbp } from '../lib/format';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';

const FREQUENCIES = ['monthly', 'weekly', 'fortnightly', 'four_weekly', 'annual'];
const FREQ_LABELS = { monthly: 'Monthly', weekly: 'Weekly', fortnightly: 'Fortnightly', four_weekly: '4-Weekly', annual: 'Annual' };

const CATEGORIES = [
  { label: 'Housing (rent / mortgage)', essential: true },
  { label: 'Council Tax', essential: true },
  { label: 'Utilities (gas, electric, water)', essential: true },
  { label: 'Food & Groceries', essential: true },
  { label: 'Transport (petrol, public transport)', essential: true },
  { label: 'Car Insurance / MOT / Road Tax', essential: true },
  { label: 'TV Licence', essential: true },
  { label: 'Mobile / Broadband', essential: true },
  { label: 'Insurance (home, life, pet)', essential: true },
  { label: 'Healthcare (prescriptions, dental, optician)', essential: true },
  { label: 'Subscriptions (Netflix, Spotify, etc.)', essential: false },
  { label: 'Dining & Takeaways', essential: false },
  { label: 'Clothing', essential: false },
  { label: 'Entertainment', essential: false },
  { label: 'Personal Care', essential: false },
  { label: 'Other', essential: false },
];

function blankIncome() { return { label: '', amount: '', frequency: 'monthly' }; }
function blankExpense() { return { label: '', amount: '', category: CATEGORIES[0].label, is_essential: 1 }; }

function InlineForm({ initial, onSave, onCancel, type }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState(null);
  const set = (k, v) => {
    const next = { ...form, [k]: v };
    if (type === 'expense' && k === 'category') {
      const cat = CATEGORIES.find(c => c.label === v);
      if (cat) next.is_essential = cat.essential ? 1 : 0;
    }
    setForm(next);
  };

  function handleSave() {
    if (!form.label.trim()) { setError('Label is required.'); return; }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount < 0) { setError('Amount must be a non-negative number.'); return; }
    setError(null);
    onSave(form);
  }

  return (
    <>
      {error && (
        <tr className="bg-red-500/5">
          <td colSpan={type === 'income' ? 4 : 5} className="px-4 py-1 text-xs text-red-300">{error}</td>
        </tr>
      )}
      <tr className="bg-slate-700/30">
        {type === 'income' ? (
          <>
            <td className="px-4 py-2">
              <input aria-label="Income source name" className="input-sm w-full" placeholder="e.g. Salary (net)" value={form.label} onChange={e => set('label', e.target.value)} />
            </td>
            <td className="px-4 py-2">
              <input aria-label="Amount" className="input-sm w-24" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
            </td>
            <td className="px-4 py-2">
              <select aria-label="Frequency" className="input-sm" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                {FREQUENCIES.map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
              </select>
            </td>
          </>
        ) : (
          <>
            <td className="px-4 py-2">
              <select aria-label="Category" className="input-sm w-full" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
              </select>
            </td>
            <td className="px-4 py-2">
              <input aria-label="Expense label" className="input-sm w-full" placeholder="e.g. Sky TV" value={form.label} onChange={e => set('label', e.target.value)} />
            </td>
            <td className="px-4 py-2">
              <input aria-label="Amount" className="input-sm w-24" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
            </td>
            <td className="px-4 py-2">
              <button
                onClick={() => set('is_essential', form.is_essential ? 0 : 1)}
                aria-label={`Toggle essential/discretionary — currently ${form.is_essential ? 'Essential' : 'Discretionary'}`}
                className={`text-xs px-2 py-1 rounded font-medium ${form.is_essential ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'}`}
              >
                {form.is_essential ? 'Essential' : 'Discretionary'}
              </button>
            </td>
          </>
        )}
        <td className="px-4 py-2">
          <div className="flex gap-1">
            <button onClick={handleSave} aria-label="Save" className="p-1 rounded text-green-400 hover:bg-green-500/10"><Check size={14} /></button>
            <button onClick={onCancel} aria-label="Cancel" className="p-1 rounded text-slate-400 hover:bg-slate-600"><X size={14} /></button>
          </div>
        </td>
      </tr>
    </>
  );
}

export default function Budget() {
  const [income, setIncome] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingIncome, setAddingIncome] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);

  // Emergency fund
  const [efTarget,  setEfTarget]  = useState('');
  const [efCurrent, setEfCurrent] = useState('');
  const [efSaving, setEfSaving] = useState(false);

  // Tabs
  const [tab, setTab] = useState('budget'); // 'budget' | 'review'

  // Monthly review
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [reviewMonth, setReviewMonth] = useState(currentMonth);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [editingActual, setEditingActual] = useState(null); // { expense_id, category, label, amount_actual }

  useEffect(() => { load(); loadEf(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getBudget();
      setIncome(data.income);
      setExpenses(data.expenses);
    } finally {
      setLoading(false);
    }
  }

  async function loadEf() {
    try {
      const s = await api.getSettings();
      if (s.emergency_fund_target)  setEfTarget(s.emergency_fund_target);
      if (s.emergency_fund_current) setEfCurrent(s.emergency_fund_current);
    } catch { /* ignore */ }
  }

  async function saveEf() {
    setEfSaving(true);
    try {
      await api.putSettings({
        emergency_fund_target:  parseFloat(efTarget)  || 0,
        emergency_fund_current: parseFloat(efCurrent) || 0,
      });
    } finally { setEfSaving(false); }
  }

  async function saveIncome(form) {
    const payload = { label: form.label, amount: parseFloat(form.amount) || 0, frequency: form.frequency };
    if (editingIncome) {
      const updated = await api.updateIncome(editingIncome, payload);
      setIncome(income.map(i => i.id === editingIncome ? updated : i));
      setEditingIncome(null);
    } else {
      const created = await api.createIncome(payload);
      setIncome([...income, created]);
      setAddingIncome(false);
    }
  }

  async function deleteIncome(id) {
    await api.deleteIncome(id);
    setIncome(income.filter(i => i.id !== id));
  }

  async function saveExpense(form) {
    const payload = { label: form.label, amount: parseFloat(form.amount) || 0, category: form.category, is_essential: form.is_essential };
    if (editingExpense) {
      const updated = await api.updateExpense(editingExpense, payload);
      setExpenses(expenses.map(e => e.id === editingExpense ? updated : e));
      setEditingExpense(null);
    } else {
      const created = await api.createExpense(payload);
      setExpenses([...expenses, created]);
      setAddingExpense(false);
    }
  }

  async function deleteExpense(id) {
    await api.deleteExpense(id);
    setExpenses(expenses.filter(e => e.id !== id));
  }

  async function loadSummary(month) {
    setSummaryLoading(true);
    try {
      const data = await api.getActualsSummary(month);
      setSummary(data);
    } catch { setSummary([]); } finally { setSummaryLoading(false); }
  }

  async function saveActual(row, amountStr) {
    const amount_actual = parseFloat(amountStr);
    if (isNaN(amount_actual) || amount_actual < 0) return;
    // Find existing actual for this category+month or create
    const existing = await api.getActuals(reviewMonth);
    const match = existing.find(a => a.category === row.category);
    if (match) {
      await api.updateActual(match.id, { amount_actual });
    } else {
      // Find an expense_id for this category if possible
      const exp = expenses.find(e => e.category === row.category);
      await api.createActual({
        expense_id: exp?.id ?? null,
        category: row.category,
        label: row.category,
        amount_actual,
        record_month: reviewMonth,
      });
    }
    await loadSummary(reviewMonth);
    setEditingActual(null);
  }

  const totalIncome = income.reduce((s, i) => s + i.monthly_equivalent, 0);
  const totalEssential = expenses.filter(e => e.is_essential).reduce((s, e) => s + e.amount, 0);
  const totalDisc = expenses.filter(e => !e.is_essential).reduce((s, e) => s + e.amount, 0);
  const totalExpenses = totalEssential + totalDisc;
  const surplus = totalIncome - totalExpenses;

  if (loading) return <div className="p-8 flex justify-center"><Spinner /></div>;

  return (
    <div className="p-8">
      <PageHeader title="Budget" subtitle="Track your monthly income and expenses" />

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 border-b border-slate-700">
        {[{ key: 'budget', label: 'Budget' }, { key: 'review', label: 'Monthly Review' }].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); if (t.key === 'review') loadSummary(reviewMonth); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'review' && (
        <div>
          <div className="flex items-center gap-4 mb-6">
            <div>
              <label className="label">Month</label>
              <input
                type="month"
                className="input py-1"
                value={reviewMonth}
                onChange={e => { setReviewMonth(e.target.value); loadSummary(e.target.value); }}
              />
            </div>
          </div>

          {summaryLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : summary === null ? (
            <div className="card p-8 text-center text-slate-500">
              <p className="text-sm">Select a month above to load your review.</p>
            </div>
          ) : summary.length > 0 ? (
            <>
              <div className="card overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wider">
                      <th className="text-left px-4 py-2">Category</th>
                      <th className="text-right px-4 py-2">Budgeted</th>
                      <th className="text-right px-4 py-2">Actual</th>
                      <th className="text-right px-4 py-2">Variance</th>
                      <th className="px-4 py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {summary.map(row => {
                      const isEditing = editingActual?.category === row.category;
                      const over = row.delta > 0;
                      return (
                        <tr key={row.category}>
                          <td className="px-4 py-2.5 text-slate-300">{row.category}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{gbp(row.budgeted)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {isEditing ? (
                              <input
                                autoFocus
                                type="number" min="0" step="0.01"
                                defaultValue={row.actual}
                                className="input w-24 py-0.5 text-xs text-right"
                                onBlur={e => saveActual(row, e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveActual(row, e.target.value); if (e.key === 'Escape') setEditingActual(null); }}
                              />
                            ) : (
                              <span className="text-slate-200">{gbp(row.actual)}</span>
                            )}
                          </td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${over ? 'text-red-400' : row.delta < 0 ? 'text-green-400' : 'text-slate-400'}`}>
                            {row.delta === 0 ? '—' : `${over ? '+' : ''}${gbp(row.delta)}`}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {!isEditing && (
                              <button onClick={() => setEditingActual({ category: row.category })} className="text-xs text-slate-500 hover:text-teal-400">Edit</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Impact summary */}
              {(() => {
                const totalOver = summary.reduce((s, r) => s + Math.max(0, r.delta), 0);
                const totalInc = income.reduce((s, i) => s + i.monthly_equivalent, 0);
                const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
                const avail = totalInc - totalExp;
                const extraDays = avail > 0 ? Math.round((totalOver / avail) * 30) : 0;
                if (totalOver < 1) return <p className="text-sm text-green-400">You stayed within budget this month.</p>;
                return (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
                    You overspent by <strong>{gbp(totalOver)}</strong> this month — approximately <strong>{extraDays} extra {extraDays === 1 ? 'day' : 'days'}</strong> on your payoff timeline.
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="card p-8 text-center text-slate-500">
              <p className="text-sm">No data yet. Click <strong>Edit</strong> on any row to enter your actual spending for {reviewMonth}.</p>
            </div>
          )}

        </div>
      )}

      {tab === 'budget' && (
      <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
        {/* Income */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Income</h3>
            <button onClick={() => setAddingIncome(true)} className="btn-sm-teal"><Plus size={14} /> Add</button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Source</th>
                  <th className="text-left px-4 py-2">Amount</th>
                  <th className="text-left px-4 py-2">Frequency</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {income.map(item => (
                  editingIncome === item.id
                    ? <InlineForm key={item.id} type="income" initial={{ label: item.label, amount: item.amount, frequency: item.frequency }} onSave={saveIncome} onCancel={() => setEditingIncome(null)} />
                    : (
                      <tr key={item.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 text-slate-200">{item.label}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-200">
                          {gbp(item.amount)}
                          {item.frequency !== 'monthly' && (
                            <span className="ml-1.5 text-xs text-slate-400">≈ {gbp(item.monthly_equivalent)}/mo</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 capitalize">{FREQ_LABELS[item.frequency]}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => setEditingIncome(item.id)} aria-label={`Edit ${item.label}`} className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-600"><Edit2 size={13} /></button>
                            <button onClick={() => deleteIncome(item.id)} aria-label={`Delete ${item.label}`} className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                ))}
                {addingIncome && (
                  <InlineForm type="income" initial={blankIncome()} onSave={saveIncome} onCancel={() => setAddingIncome(false)} />
                )}
                {income.length === 0 && !addingIncome && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500 text-sm">No income sources yet</td></tr>
                )}
              </tbody>
              <tfoot className="border-t border-slate-600">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right">
                    <span className="text-xs text-slate-400 mr-2">Monthly total</span>
                    <span className="font-semibold tabular-nums text-green-400 text-base">{gbp(totalIncome)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Expenses */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Expenses</h3>
            <button onClick={() => setAddingExpense(true)} className="btn-sm-teal"><Plus size={14} /> Add</button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Category</th>
                  <th className="text-left px-4 py-2">Label</th>
                  <th className="text-left px-4 py-2">Amount/mo</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {expenses.map(item => (
                  editingExpense === item.id
                    ? <InlineForm key={item.id} type="expense" initial={{ label: item.label, amount: item.amount, category: item.category, is_essential: item.is_essential }} onSave={saveExpense} onCancel={() => setEditingExpense(null)} />
                    : (
                      <tr key={item.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 text-slate-400 text-xs max-w-[140px] truncate">{item.category}</td>
                        <td className="px-4 py-3 text-slate-200">{item.label}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-200">{gbp(item.amount)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${item.is_essential ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'}`}>
                            {item.is_essential ? 'Essential' : 'Discretionary'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => setEditingExpense(item.id)} aria-label={`Edit ${item.label}`} className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-600"><Edit2 size={13} /></button>
                            <button onClick={() => deleteExpense(item.id)} aria-label={`Delete ${item.label}`} className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                ))}
                {addingExpense && (
                  <InlineForm type="expense" initial={blankExpense()} onSave={saveExpense} onCancel={() => setAddingExpense(false)} />
                )}
                {expenses.length === 0 && !addingExpense && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500 text-sm">No expenses yet</td></tr>
                )}
              </tbody>
              <tfoot className="border-t border-slate-600">
                <tr>
                  <td colSpan={5} className="px-4 py-3">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Essential: <span className="text-blue-300 font-medium">{gbp(totalEssential)}</span></span>
                      <span>Discretionary: <span className="text-amber-300 font-medium">{gbp(totalDisc)}</span></span>
                      <span>Total: <span className="text-slate-200 font-semibold">{gbp(totalExpenses)}</span></span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>

      {/* Emergency Fund */}
      <div className="card p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-1">Emergency Fund</h3>
        <p className="text-xs text-slate-500 mb-4">Set a savings buffer. The payoff plan will direct extra payments to savings first until the target is met (recommended: £1,000).</p>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">Target (£)</label>
            <input className="input w-32" type="number" min="0" step="50" placeholder="1000"
              value={efTarget} onChange={e => setEfTarget(e.target.value)} />
          </div>
          <div>
            <label className="label">Current savings (£)</label>
            <input className="input w-32" type="number" min="0" step="10" placeholder="0"
              value={efCurrent} onChange={e => setEfCurrent(e.target.value)} />
          </div>
          <button onClick={saveEf} disabled={efSaving} className="btn-teal disabled:opacity-50">
            {efSaving ? <Spinner size={14} /> : <Check size={14} />} Save
          </button>
        </div>
        {efTarget && efCurrent !== '' && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>{gbp(Math.min(parseFloat(efCurrent) || 0, parseFloat(efTarget) || 0))} saved</span>
              <span>{gbp(parseFloat(efTarget) || 0)} target</span>
            </div>
            <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-teal-500 transition-all"
                style={{ width: `${Math.min(100, ((parseFloat(efCurrent) || 0) / (parseFloat(efTarget) || 1)) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Surplus Banner */}
      <div className={`rounded-xl border p-5 ${surplus >= 0 ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
        <div className="flex flex-wrap gap-8">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Monthly surplus after expenses</p>
            <p className={`text-2xl font-semibold tabular-nums ${surplus >= 0 ? 'text-green-400' : 'text-red-400'}`}>{gbp(surplus)}</p>
          </div>
        </div>
        {surplus < 0 && (
          <p className="mt-3 text-sm text-red-300">⚠ Your expenses exceed your income. Reduce expenses or add income before generating a payoff plan.</p>
        )}
      </div>
      </>
      )}
    </div>
  );
}
