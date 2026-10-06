import { describe, expect, it } from 'vitest';
import { nextRankXpCost, rankXpTotal, xpProgress, xpSummary } from '../../module/helpers/advancement.mjs';

describe('rank costs', () => {
  it('prices the next step and sums every step up to a rank', () => {
    expect(nextRankXpCost('attribute', 2)).toBe(9);
    expect(nextRankXpCost('skill', 2)).toBe(9);
    expect(rankXpTotal('attribute', 3)).toBe(1 + 4 + 9);
    expect(rankXpTotal('skill', 3)).toBe(3 + 6 + 9);
    expect(rankXpTotal('skill', 0)).toBe(0);
  });

  it('agrees with itself: the total is the sum of the next-step costs', () => {
    for (const kind of ['attribute', 'skill']) {
      let total = 0;
      for (let rank = 0; rank < 10; rank++) {
        expect(rankXpTotal(kind, rank)).toBe(total);
        total += nextRankXpCost(kind, rank);
      }
    }
  });
});

describe('xpProgress', () => {
  it('fills toward the next rank and turns ready once it is affordable', () => {
    expect(xpProgress('skill', 1, 3)).toEqual({ xpCost: 6, xpAtMax: false, xpReady: false, xpPercent: 50 });
    expect(xpProgress('skill', 1, 8)).toEqual({ xpCost: 6, xpAtMax: false, xpReady: true, xpPercent: 100 });
  });

  it('is full but never ready at the cap', () => {
    expect(xpProgress('attribute', 10, 500)).toMatchObject({ xpAtMax: true, xpReady: false, xpPercent: 100 });
  });
});

describe('xpSummary', () => {
  it('counts banked XP as acquired but not spent', () => {
    const summary = xpSummary([{ rank: 2, xp: 1 }], [{ rank: 0, xp: 2 }, { rank: 1, xp: 0 }]);
    expect(summary).toEqual({
      attributeXpSpent: 5,
      skillXpSpent: 3,
      attributeXpBanked: 1,
      skillXpBanked: 2,
      spent: 8,
      unspent: 3,
      acquired: 11,
    });
  });
});
