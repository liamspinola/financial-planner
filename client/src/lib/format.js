/**
 * Format a number as GBP currency: £1,234.56
 */
export function gbp(amount, decimals = 0) {
  if (amount == null || isNaN(amount)) return '£0';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Format a date string (YYYY-MM-DD) as DD/MM/YYYY
 */
export function ukDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Format APR decimal (0.229) as "22.9%"
 */
export function aprPct(apr) {
  if (apr == null) return '—';
  return `${(apr * 100).toFixed(1)}%`;
}

/**
 * Days until a date string (YYYY-MM-DD)
 */
export function daysUntil(isoDate) {
  if (!isoDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(isoDate + 'T00:00:00');
  return Math.ceil((target - now) / 86400000);
}

/**
 * Months label: "14 months" or "14 months (1 yr 2 mo)"
 */
export function monthsLabel(months) {
  if (months <= 12) return `${months} months`;
  const yrs = Math.floor(months / 12);
  const mo  = months % 12;
  return mo > 0 ? `${months} months (${yrs} yr${yrs > 1 ? 's' : ''} ${mo} mo)` : `${months} months (${yrs} yr${yrs > 1 ? 's' : ''})`;
}

/**
 * Format a YYYY-MM-DD (or YYYY-MM) string as "Apr 2026"
 */
export function formatMonthLabel(isoDate) {
  if (!isoDate) return '';
  const [year, month] = isoDate.split('-');
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[parseInt(month, 10) - 1]} ${year}`;
}
