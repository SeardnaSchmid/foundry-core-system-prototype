import { describe, expect, it } from 'vitest';
import {
  MONEY_CURRENCIES,
  normalizeMoneyAmount,
  prepareWallet,
} from '../../module/helpers/money.mjs';

describe('money currencies', () => {
  it('keeps every wallet currency and its rate in integer euro cents', () => {
    expect(MONEY_CURRENCIES.map(({ key, cents, approximate, primary }) => [key, cents, approximate, primary])).toEqual([
      ['templeOr', 100, false, true],
      ['imperialQian', 1, false, true],
      ['orNior', 50, false, false],
      ['orOdur', 20, true, false],
      ['orForseti', 10, true, false],
    ]);
  });
});

describe('normalizeMoneyAmount', () => {
  it('stores balances as non-negative whole currency units', () => {
    expect(normalizeMoneyAmount('12.9')).toBe(12);
    expect(normalizeMoneyAmount(-4)).toBe(0);
  });

  it('degrades missing and non-numeric values to zero', () => {
    expect(normalizeMoneyAmount(undefined)).toBe(0);
    expect(normalizeMoneyAmount('many')).toBe(0);
  });
});

describe('prepareWallet', () => {
  it('converts every native balance and adds the euro total in cents', () => {
    const wallet = prepareWallet({
      templeOr: 83,
      imperialQian: 4540,
      orNior: 2,
      orOdur: 3,
      orForseti: 4,
    });

    expect(wallet.rows.map(({ key, euroCents }) => [key, euroCents])).toEqual([
      ['templeOr', 8300],
      ['imperialQian', 4540],
      ['orNior', 100],
      ['orOdur', 60],
      ['orForseti', 40],
    ]);
    expect(wallet.totalCents).toBe(13040);
    expect(wallet.summaryRows.map(({ key, summaryAmount }) => [key, summaryAmount])).toEqual([
      ['templeOr', 130.4],
      ['imperialQian', 13040],
    ]);
  });

  it('reports every non-zero balance for callers to place on their surface', () => {
    const wallet = prepareWallet({ templeOr: 3, imperialQian: 0, orNior: 2 });
    expect(wallet.presentRows.map((row) => row.key)).toEqual(['templeOr', 'orNior']);
  });

  it('marks totals approximate only when Odur or Forseti is present', () => {
    expect(prepareWallet({ templeOr: 3, imperialQian: 1, orNior: 2 }).approximate).toBe(false);
    expect(prepareWallet({ orOdur: 1 }).approximate).toBe(true);
    expect(prepareWallet({ orForseti: 1 }).approximate).toBe(true);
  });
});
