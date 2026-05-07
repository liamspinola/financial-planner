import { describe, it, expect } from 'vitest'
import { gbp, ukDate, aprPct, daysUntil, monthsLabel, formatMonthLabel } from '../format.js'

describe('gbp', () => {
  it('formats positive integer as £ currency', () => {
    expect(gbp(1234)).toBe('£1,234')
  })

  it('formats with decimal places when specified', () => {
    expect(gbp(1234.5, 2)).toBe('£1,234.50')
  })

  it('returns £0 for null', () => {
    expect(gbp(null)).toBe('£0')
  })

  it('returns £0 for NaN', () => {
    expect(gbp(NaN)).toBe('£0')
  })

  it('formats zero as £0', () => {
    expect(gbp(0)).toBe('£0')
  })

  it('formats negative numbers', () => {
    expect(gbp(-500)).toBe('-£500')
  })
})

describe('ukDate', () => {
  it('converts YYYY-MM-DD to DD/MM/YYYY', () => {
    expect(ukDate('2026-04-28')).toBe('28/04/2026')
  })

  it('returns empty string for null/undefined', () => {
    expect(ukDate(null)).toBe('')
    expect(ukDate(undefined)).toBe('')
    expect(ukDate('')).toBe('')
  })
})

describe('aprPct', () => {
  it('formats 0.229 as 22.9%', () => {
    expect(aprPct(0.229)).toBe('22.9%')
  })

  it('formats 0 as 0.0%', () => {
    expect(aprPct(0)).toBe('0.0%')
  })

  it('returns em dash for null', () => {
    expect(aprPct(null)).toBe('—')
  })

  it('formats 1 (100%) correctly', () => {
    expect(aprPct(1)).toBe('100.0%')
  })
})

describe('daysUntil', () => {
  it('returns null for empty/null input', () => {
    expect(daysUntil(null)).toBeNull()
    expect(daysUntil('')).toBeNull()
  })

  it('returns a number for a valid future date', () => {
    const future = '2099-01-01'
    const result = daysUntil(future)
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThan(0)
  })

  it('returns a negative number for a past date', () => {
    const past = '2000-01-01'
    const result = daysUntil(past)
    expect(result).toBeLessThan(0)
  })
})

describe('monthsLabel', () => {
  it('shows just months for 12 or fewer', () => {
    expect(monthsLabel(12)).toBe('12 months')
    expect(monthsLabel(1)).toBe('1 months')
  })

  it('shows months and years breakdown for > 12', () => {
    expect(monthsLabel(14)).toBe('14 months (1 yr 2 mo)')
    expect(monthsLabel(24)).toBe('24 months (2 yrs)')
    expect(monthsLabel(25)).toBe('25 months (2 yrs 1 mo)')
  })
})

describe('formatMonthLabel', () => {
  it('formats YYYY-MM as Mon YYYY', () => {
    expect(formatMonthLabel('2026-04')).toBe('Apr 2026')
    expect(formatMonthLabel('2026-01')).toBe('Jan 2026')
    expect(formatMonthLabel('2026-12')).toBe('Dec 2026')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatMonthLabel(null)).toBe('')
    expect(formatMonthLabel('')).toBe('')
  })
})
