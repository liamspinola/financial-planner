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
  const set = (k, v) => {
    const next = { ...form, [k]: v };
    if (type === 'expense' && k === 'category') {
      const cat = CATEGORIES.find(c => c.label === v);
      if (cat) next.is_essential = cat.essential ? 1 : 0;
    }
    setForm(next);
  };

  return (
    <tr className="bg-slate-700/30">
      {type === 'income' ? (
        <>
          <td className="px-4 py-2">
            <input className="input-sm w-full" placeholder="e.g. Salary (net)" value={form.label} onChange={e => set('label', e.target.value)} />
          </td>
          <td className="px-4 py-2">
            <input className="input-sm w-24" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </td>
          <td className="px-4 py-2">
            <select className="input-sm" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
              {FREQUENCIES.map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
            </select>
          </td>
        </>
      ) : (
        <>
          <td className="px-4 py-2">
            <select className="input-sm w-full" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
            </select>
          </td>
          <td className="px-4 py-2">
            <input className="input-sm w-full" placeholder="e.g. Sky TV" value={form.label} onChange={e => set('label', e.target.value)} />
          </td>
          <td className="px-4 py-2">
            <input className="input-sm w-24" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </td>
          <td className="px-4 py-2">
            <button
              onClick={() => set('is_essential', form.is_essential ? 0 : 1)}
              className={`text-xs px-2 py-1 rounded font-medium ${form.is_essential ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'}`}
            >
              {form.is_essential ? 'Essential' : 'Discretionary'}
            </button>
          </td>
        </>
      )}
      <td className="px-4 py-2">
        <div className="flex gap-1">
          <button onClick={() => onSave(form)} className="p-1 rounded text-green-400 hover:bg-green-500/10"><Check size={14} /></button>
          <button onClick={onCancel} className="p-1 rounded text-slate-400 hover:bg-slate-600"><X size={14} /></button>
        </div>
      </td>
    </tr>
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

  useEffect(() => { load(); }, []);

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

  const totalIncome = income.reduce((s, i) => s + i.monthly_equivalent, 0);
  const totalEssential = expenses.filter(e => e.is_essential).reduce((s, e) => s + e.amount, 0);
  const totalDisc = expenses.filter(e => !e.is_essential).reduce((s, e) => s + e.amount, 0);
  const totalExpenses = totalEssential + totalDisc;
  const surplus = totalIncome - totalExpenses;

  if (loading) return <div className="p-8 flex justify-center"><Spinner /></div>;

  return (
    <div className="p-8">
      <PageHeader title="Budget" subtitle="Track your monthly income and expenses" />

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
                            <button onClick={() => setEditingIncome(item.id)} className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-600"><Edit2 size={13} /></button>
                            <button onClick={() => deleteIncome(item.id)} className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={13} /></button>
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
                            <button onClick={() => setEditingExpense(item.id)} className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-600"><Edit2 size={13} /></button>
                            <button onClick={() => deleteExpense(item.id)} className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={13} /></button>
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
    </div>
  );
}
