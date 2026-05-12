import { API_TIMEOUT_MS } from './constants';
import { getAccessToken } from './auth';

const BASE = '/api/v1';

async function request(method, path, body, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const token = await getAccessToken();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    signal: controller.signal,
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(BASE + path, opts);
    clearTimeout(timer);
    if (res.status === 401) {
      sessionStorage.setItem('returnTo', window.location.pathname);
      window.location.href = '/login';
      throw new Error('Session expired. Please sign in again.');
    }
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
  generatePlan:  ()             => request('GET', '/plan'),
  getCachedPlan: ()             => request('GET', '/plan/cached'),
  whatIfPlan:    (extraMonthly) => request('GET', `/plan/whatif?extraMonthly=${extraMonthly}`, undefined, 30000),
  lumpsumAdvise: (amount, applyMonth) => request('GET', `/plan/lumpsum?amount=${amount}&applyMonth=${applyMonth}`, undefined, 30000),

  // AI
  generateAI: (mode) => request('POST', '/ai', { mode }),

  // Windfalls
  getWindfalls:    ()            => request('GET',    '/windfalls'),
  createWindfall:  (w)           => request('POST',   '/windfalls', w),
  updateWindfall:  (id, w)       => request('PUT',    `/windfalls/${id}`, w),
  deleteWindfall:  (id)          => request('DELETE', `/windfalls/${id}`),

  // Expense events
  getExpenseEvents:   ()         => request('GET',    '/expense-events'),
  createExpenseEvent: (e)        => request('POST',   '/expense-events', e),
  updateExpenseEvent: (id, e)    => request('PUT',    `/expense-events/${id}`, e),
  deleteExpenseEvent: (id)       => request('DELETE', `/expense-events/${id}`),

  // Settings
  getSettings:  ()        => request('GET', '/settings'),
  putSettings:  (obj)     => request('PUT', '/settings', obj),

  // Progress snapshots
  getProgress:     ()         => request('GET',    '/progress'),
  saveSnapshot:    (s)        => request('POST',   '/progress', s),
  updateSnapshot:  (id, s)    => request('PUT',    `/progress/${id}`, s),
  deleteSnapshot:  (id)       => request('DELETE', `/progress/${id}`),

  // Budget actuals
  getActuals:      (month)      => request('GET',    `/actuals${month ? `?month=${month}` : ''}`),
  getActualsSummary: (month)    => request('GET',    `/actuals/summary?month=${month}`),
  createActual:    (a)          => request('POST',   '/actuals', a),
  updateActual:    (id, a)      => request('PUT',    `/actuals/${id}`, a),
  deleteActual:    (id)         => request('DELETE', `/actuals/${id}`),

  // Advisor
  getConversations:   ()              => request('GET',    '/advisor/conversations'),
  createConversation: ()              => request('POST',   '/advisor/conversations'),
  patchConversation:  (id, data)      => request('PATCH',  `/advisor/conversations/${id}`, data),
  deleteConversation: (id)            => request('DELETE', `/advisor/conversations/${id}`),
  getMessages:        (id)            => request('GET',    `/advisor/conversations/${id}/messages`),
  sendMessage:        (id, content)   => request('POST',   `/advisor/conversations/${id}/messages`, { content }, 90000),
};
