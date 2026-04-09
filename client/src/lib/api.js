const BASE = '/api';

async function request(method, path, body, timeoutMs = 200000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(BASE + path, opts);
    clearTimeout(timer);
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out — AI analysis is taking longer than expected. Try again.');
    throw err;
  }
}

export const api = {
  // Debts
  getDebts:   ()           => request('GET',    '/debts'),
  createDebt: (debt)       => request('POST',   '/debts', debt),
  updateDebt: (id, debt)   => request('PUT',    `/debts/${id}`, debt),
  deleteDebt: (id)         => request('DELETE', `/debts/${id}`),

  // Budget
  getBudget:       ()          => request('GET',    '/budget'),
  createIncome:    (item)      => request('POST',   '/budget/income', item),
  updateIncome:    (id, item)  => request('PUT',    `/budget/income/${id}`, item),
  deleteIncome:    (id)        => request('DELETE', `/budget/income/${id}`),
  createExpense:   (item)      => request('POST',   '/budget/expenses', item),
  updateExpense:   (id, item)  => request('PUT',    `/budget/expenses/${id}`, item),
  deleteExpense:   (id)        => request('DELETE', `/budget/expenses/${id}`),

  // Plan
  generatePlan: () => request('POST', '/plan'),
  getCachedPlan: () => request('GET', '/plan/cached'),

  // AI
  generateAI: (mode) => request('POST', '/ai', { mode }),
};
