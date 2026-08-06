import { describe, it, expect } from 'vitest';
import {
  TNO_ADVANTAGE,
  dieCountFor,
  pickCountingDie,
  criticalResultFor,
} from '../../module/helpers/dice.mjs';
import { TNO_ODDS } from '../../module/helpers/dice-odds-table.mjs';
import { successChanceFor, formatChance, oddsTooltipHtml } from '../../module/helpers/dice-odds.mjs';

/**
 * Re-derive the odds the way `scripts/dice-odds.mjs` does — by walking the
 * entire outcome space through the live resolution helpers. The shipped table
 * is generated, so this is the guard that a change to the mechanic cannot ship
 * without regenerating it: edit `criticalResultFor` or `pickCountingDie`
 * without running `npm run docs:odds` and this fails.
 */
function deriveOdds(advantage) {
  const dice = dieCountFor(advantage);
  const success = new Array(21).fill(0);
  let crit = 0;
  let fumble = 0;
  let total = 0;

  const walk = (values) => {
    total++;
    const critical = criticalResultFor(values, advantage);
    if (critical === 'criticalSuccess') {
      crit++;
      for (let th = 0; th <= 20; th++) success[th]++;
      return;
    }
    if (critical === 'criticalFailure') {
      fumble++;
      return;
    }
    for (let th = pickCountingDie(values, advantage).value; th <= 20; th++) success[th]++;
  };

  for (let a = 1; a <= 20; a++) {
    for (let b = 1; b <= 20; b++) {
      if (dice === 2) walk([a, b]);
      else for (let c = 1; c <= 20; c++) walk([a, b, c]);
    }
  }

  return { crit: crit / total, fumble: fumble / total, success: success.map((n) => n / total) };
}

describe('Dice odds', () => {
  describe('the generated table matches the live mechanic', () => {
    for (const [name, advantage] of Object.entries(TNO_ADVANTAGE)) {
      it(`is current for ${name}`, () => {
        const derived = deriveOdds(advantage);
        const shipped = TNO_ODDS[advantage];

        expect(shipped, `no table entry for ${name} — run npm run docs:odds`).toBeDefined();
        expect(shipped.crit).toBeCloseTo(derived.crit, 8);
        expect(shipped.fumble).toBeCloseTo(derived.fumble, 8);
        expect(shipped.success).toHaveLength(21);
        for (let th = 0; th <= 20; th++) {
          expect(shipped.success[th], `threshold ${th}`).toBeCloseTo(derived.success[th], 8);
        }
      });
    }
  });

  describe('successChanceFor', () => {
    it('reads the threshold straight out of the table', () => {
      expect(successChanceFor(10, TNO_ADVANTAGE.none).success).toBeCloseTo(0.5, 8);
      expect(successChanceFor(14, TNO_ADVANTAGE.none).success).toBeCloseTo(0.784, 8);
    });

    it('reports the crit and fumble rates for the state', () => {
      const strong = successChanceFor(10, TNO_ADVANTAGE.strongAdvantage);
      expect(strong.crit).toBeCloseTo(0.142625, 8);
      expect(strong.fumble).toBeCloseTo(0.000125, 8);
    });

    it('clamps a threshold past 20 instead of falling off the table', () => {
      const at20 = successChanceFor(20, TNO_ADVANTAGE.none);
      expect(successChanceFor(27, TNO_ADVANTAGE.none).success).toBe(at20.success);
    });

    it('clamps a negative threshold to the bottom of the table', () => {
      expect(successChanceFor(-4, TNO_ADVANTAGE.none).success).toBe(successChanceFor(0, TNO_ADVANTAGE.none).success);
    });

    it('marks the thresholds where a further point changes nothing', () => {
      expect(successChanceFor(19, TNO_ADVANTAGE.none).capped).toBe(true);
      expect(successChanceFor(1, TNO_ADVANTAGE.none).capped).toBe(true);
      expect(successChanceFor(14, TNO_ADVANTAGE.none).capped).toBe(false);
    });

    it('falls back to the standard roll for an unknown advantage', () => {
      expect(successChanceFor(10, 99).success).toBe(successChanceFor(10, TNO_ADVANTAGE.none).success);
    });

    it('never lets a maxed threshold read as certain, since a fumble still lands', () => {
      for (const advantage of Object.values(TNO_ADVANTAGE)) {
        expect(successChanceFor(20, advantage).success).toBeLessThan(1);
      }
    });
  });

  describe('formatChance', () => {
    it('rounds to one decimal', () => {
      expect(formatChance(0.784)).toBe('78.4%');
    });

    it('drops a trailing zero decimal', () => {
      expect(formatChance(0.5)).toBe('50%');
    });

    it('never rounds a possible outcome down to zero', () => {
      expect(formatChance(0.000125)).toBe('<0.1%');
    });

    it('shows a genuinely impossible outcome as zero', () => {
      expect(formatChance(0)).toBe('0%');
    });
  });

  describe('oddsTooltipHtml', () => {
    // The helper localizes, so stand up the minimum of the global it reaches
    // for. Echoing the key back makes it obvious in the assertions below which
    // string landed where.
    const withI18n = (fn) => {
      const previous = globalThis.game;
      globalThis.game = {
        i18n: {
          localize: (key) => key,
          format: (key, data) => `${key}:${JSON.stringify(data)}`,
        },
      };
      try {
        return fn();
      } finally {
        globalThis.game = previous;
      }
    };

    it('escapes the "<0.1%" chance rather than emitting a stray tag', () => {
      const html = withI18n(() => oddsTooltipHtml(10, TNO_ADVANTAGE.strongAdvantage));
      expect(html).toContain('&lt;0.1%');
      expect(html).not.toContain('><0.1%');
    });

    it('carries the chance, both critical rates, and the row scheme', () => {
      const html = withI18n(() => oddsTooltipHtml(14, TNO_ADVANTAGE.none));
      expect(html).toContain('78.4%');
      expect(html).toContain('TNO.RollOutcome.CriticalSuccess');
      expect(html).toContain('TNO.RollOutcome.CriticalFailure');
      expect(html.match(/tno-tooltip-row/g)).toHaveLength(3);
    });

    it('adds the "threshold stops mattering" note only where it applies', () => {
      expect(withI18n(() => oddsTooltipHtml(20, TNO_ADVANTAGE.none))).toContain('TNO.Roll.Odds.Capped');
      expect(withI18n(() => oddsTooltipHtml(14, TNO_ADVANTAGE.none))).not.toContain('TNO.Roll.Odds.Capped');
    });
  });
});
