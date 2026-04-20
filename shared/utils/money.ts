/**
 * Convert a pound amount (float) to integer pence.
 * Rounds to handle float imprecision (e.g. 0.1 + 0.2 = 0.30000000000000004).
 */
export const toPence = (pounds: number): number => Math.round(pounds * 100);

/**
 * Convert integer pence to a pound float.
 */
export const fromPence = (pence: number): number => pence / 100;

/**
 * Format integer pence as a GBP currency string (e.g. 1234 → "£12.34").
 */
export const formatGBP = (pence: number): string =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    fromPence(pence),
  );
