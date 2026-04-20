import { toPence, fromPence, formatGBP } from '../money';

describe('toPence', () => {
  it('converts whole pounds', () => {
    expect(toPence(10)).toBe(1000);
  });
  it('converts pounds and pence', () => {
    expect(toPence(10.99)).toBe(1099);
  });
  it('rounds floating point imprecision', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS floats
    expect(toPence(0.1 + 0.2)).toBe(30);
  });
  it('handles zero', () => {
    expect(toPence(0)).toBe(0);
  });
  it('handles large values', () => {
    expect(toPence(99999.99)).toBe(9999999);
  });
});

describe('fromPence', () => {
  it('converts pence to pounds', () => {
    expect(fromPence(1099)).toBe(10.99);
  });
  it('converts zero', () => {
    expect(fromPence(0)).toBe(0);
  });
  it('handles whole pounds', () => {
    expect(fromPence(1000)).toBe(10);
  });
});

describe('formatGBP', () => {
  it('formats zero', () => {
    expect(formatGBP(0)).toBe('£0.00');
  });
  it('formats whole pounds', () => {
    expect(formatGBP(1000)).toBe('£10.00');
  });
  it('formats pence only', () => {
    expect(formatGBP(1)).toBe('£0.01');
  });
  it('formats thousands with comma', () => {
    expect(formatGBP(100000)).toBe('£1,000.00');
  });
  it('formats large values', () => {
    expect(formatGBP(9999999)).toBe('£99,999.99');
  });
});
