import { describe, it, expect } from 'vitest';
import {
  TNO_ADVANTAGE,
  dieCountFor,
  pickCountingDie,
  criticalResultFor,
  envelopeLines,
} from '../../module/helpers/dice.mjs';

function determineSuccess(countingDie, threshold, critical) {
  if (critical === 'criticalSuccess') return true;
  if (critical === 'criticalFailure') return false;
  return countingDie <= threshold;
}

function calculateThreshold(attribute, ability, modifier) {
  return attribute + ability + modifier;
}

describe('Tno Dice System', () => {
  describe('dieCountFor', () => {
    it('should return 2 dice for simple advantage', () => {
      expect(dieCountFor(TNO_ADVANTAGE.advantage)).toBe(2);
    });

    it('should return 2 dice for simple disadvantage', () => {
      expect(dieCountFor(TNO_ADVANTAGE.disadvantage)).toBe(2);
    });

    it('should return 3 dice for none', () => {
      expect(dieCountFor(TNO_ADVANTAGE.none)).toBe(3);
    });

    it('should return 3 dice for strong advantage', () => {
      expect(dieCountFor(TNO_ADVANTAGE.strongAdvantage)).toBe(3);
    });

    it('should return 3 dice for strong disadvantage', () => {
      expect(dieCountFor(TNO_ADVANTAGE.strongDisadvantage)).toBe(3);
    });
  });

  describe('pickCountingDie - Standard Roll (None)', () => {
    it('C1: should pick middle die from [12, 19, 8]', () => {
      const result = pickCountingDie([12, 19, 8], TNO_ADVANTAGE.none);
      expect(result.value).toBe(12);
    });

    it('should pick middle die from sorted values', () => {
      const result = pickCountingDie([5, 15, 10], TNO_ADVANTAGE.none);
      expect(result.value).toBe(10);
    });

    it('should handle all same values', () => {
      const result = pickCountingDie([10, 10, 10], TNO_ADVANTAGE.none);
      expect(result.value).toBe(10);
    });
  });

  describe('pickCountingDie - Simple Advantage', () => {
    it('C2: should pick lower die from [8, 15]', () => {
      const result = pickCountingDie([8, 15], TNO_ADVANTAGE.advantage);
      expect(result.value).toBe(8);
    });

    it('should pick lower die when reversed', () => {
      const result = pickCountingDie([15, 8], TNO_ADVANTAGE.advantage);
      expect(result.value).toBe(8);
    });
  });

  describe('pickCountingDie - Simple Disadvantage', () => {
    it('C3: should pick higher die from [8, 15]', () => {
      const result = pickCountingDie([8, 15], TNO_ADVANTAGE.disadvantage);
      expect(result.value).toBe(15);
    });

    it('should pick higher die when reversed', () => {
      const result = pickCountingDie([15, 8], TNO_ADVANTAGE.disadvantage);
      expect(result.value).toBe(15);
    });
  });

  describe('pickCountingDie - Strong Advantage', () => {
    it('C4: should pick lowest die from [8, 15, 12]', () => {
      const result = pickCountingDie([8, 15, 12], TNO_ADVANTAGE.strongAdvantage);
      expect(result.value).toBe(8);
    });

    it('should pick lowest die from any order', () => {
      const result = pickCountingDie([19, 5, 12], TNO_ADVANTAGE.strongAdvantage);
      expect(result.value).toBe(5);
    });
  });

  describe('pickCountingDie - Strong Disadvantage', () => {
    it('C5: should pick highest die from [8, 15, 12]', () => {
      const result = pickCountingDie([8, 15, 12], TNO_ADVANTAGE.strongDisadvantage);
      expect(result.value).toBe(15);
    });

    it('should pick highest die from any order', () => {
      const result = pickCountingDie([5, 19, 12], TNO_ADVANTAGE.strongDisadvantage);
      expect(result.value).toBe(19);
    });
  });

  describe('criticalResultFor - Standard Roll (None)', () => {
    it('T1: [1, 1, 15] should be critical success', () => {
      expect(criticalResultFor([1, 1, 15], TNO_ADVANTAGE.none)).toBe('criticalSuccess');
    });

    it('T2: [20, 20, 5] should be critical failure', () => {
      expect(criticalResultFor([20, 20, 5], TNO_ADVANTAGE.none)).toBe('criticalFailure');
    });

    it('T3: [1, 10, 15] should be null', () => {
      expect(criticalResultFor([1, 10, 15], TNO_ADVANTAGE.none)).toBeNull();
    });

    it('should detect all ones as critical success', () => {
      expect(criticalResultFor([1, 1, 1], TNO_ADVANTAGE.none)).toBe('criticalSuccess');
    });

    it('should detect all twenties as critical failure', () => {
      expect(criticalResultFor([20, 20, 20], TNO_ADVANTAGE.none)).toBe('criticalFailure');
    });
  });

  describe('criticalResultFor - Simple Advantage', () => {
    it('T4: [1, 15] should be critical success', () => {
      expect(criticalResultFor([1, 15], TNO_ADVANTAGE.advantage)).toBe('criticalSuccess');
    });

    it('T5: [20, 20] should be critical failure', () => {
      expect(criticalResultFor([20, 20], TNO_ADVANTAGE.advantage)).toBe('criticalFailure');
    });

    it('T6: [20, 10] should be null', () => {
      expect(criticalResultFor([20, 10], TNO_ADVANTAGE.advantage)).toBeNull();
    });

    it('should trigger on single one', () => {
      expect(criticalResultFor([1, 20], TNO_ADVANTAGE.advantage)).toBe('criticalSuccess');
    });

    it('should not trigger critical failure on single twenty', () => {
      expect(criticalResultFor([20, 5], TNO_ADVANTAGE.advantage)).toBeNull();
    });
  });

  describe('criticalResultFor - Simple Disadvantage', () => {
    it('T7: [20, 10] should be critical failure', () => {
      expect(criticalResultFor([20, 10], TNO_ADVANTAGE.disadvantage)).toBe('criticalFailure');
    });

    it('T8: [1, 1] should be critical success', () => {
      expect(criticalResultFor([1, 1], TNO_ADVANTAGE.disadvantage)).toBe('criticalSuccess');
    });

    it('T9: [1, 10] should be null', () => {
      expect(criticalResultFor([1, 10], TNO_ADVANTAGE.disadvantage)).toBeNull();
    });

    it('should trigger on single twenty', () => {
      expect(criticalResultFor([20, 1], TNO_ADVANTAGE.disadvantage)).toBe('criticalFailure');
    });

    it('should not trigger critical success on single one', () => {
      expect(criticalResultFor([1, 15], TNO_ADVANTAGE.disadvantage)).toBeNull();
    });
  });

  describe('criticalResultFor - Strong Advantage', () => {
    it('T10: [1, 15, 10] should be critical success', () => {
      expect(criticalResultFor([1, 15, 10], TNO_ADVANTAGE.strongAdvantage)).toBe('criticalSuccess');
    });

    it('T11: [20, 20, 20] should be critical failure', () => {
      expect(criticalResultFor([20, 20, 20], TNO_ADVANTAGE.strongAdvantage)).toBe('criticalFailure');
    });

    it('T12: [20, 20, 10] should be null', () => {
      expect(criticalResultFor([20, 20, 10], TNO_ADVANTAGE.strongAdvantage)).toBeNull();
    });

    it('should trigger critical success on single one', () => {
      expect(criticalResultFor([1, 19, 18], TNO_ADVANTAGE.strongAdvantage)).toBe('criticalSuccess');
    });

    it('should not trigger critical failure on two twenties', () => {
      expect(criticalResultFor([20, 20, 15], TNO_ADVANTAGE.strongAdvantage)).toBeNull();
    });
  });

  describe('criticalResultFor - Strong Disadvantage', () => {
    it('T13: [20, 10, 5] should be critical failure', () => {
      expect(criticalResultFor([20, 10, 5], TNO_ADVANTAGE.strongDisadvantage)).toBe('criticalFailure');
    });

    it('T14: [1, 1, 1] should be critical success', () => {
      expect(criticalResultFor([1, 1, 1], TNO_ADVANTAGE.strongDisadvantage)).toBe('criticalSuccess');
    });

    it('T15: [1, 1, 10] should be null', () => {
      expect(criticalResultFor([1, 1, 10], TNO_ADVANTAGE.strongDisadvantage)).toBeNull();
    });

    it('should trigger critical failure on single twenty', () => {
      expect(criticalResultFor([20, 5, 3], TNO_ADVANTAGE.strongDisadvantage)).toBe('criticalFailure');
    });

    it('should not trigger critical success on two ones', () => {
      expect(criticalResultFor([1, 1, 15], TNO_ADVANTAGE.strongDisadvantage)).toBeNull();
    });
  });

  describe('calculateThreshold', () => {
    it('TH1: should calculate 5 + 6 + 3 = 14', () => {
      expect(calculateThreshold(5, 6, 3)).toBe(14);
    });

    it('TH2: should calculate 5 + 6 - 3 = 8', () => {
      expect(calculateThreshold(5, 6, -3)).toBe(8);
    });

    it('TH3: should calculate 5 + 6 + 0 = 11', () => {
      expect(calculateThreshold(5, 6, 0)).toBe(11);
    });

    it('TH4: should calculate 5 + 6 + 6 = 17', () => {
      expect(calculateThreshold(5, 6, 6)).toBe(17);
    });

    it('should handle zero attribute', () => {
      expect(calculateThreshold(0, 5, 3)).toBe(8);
    });

    it('should handle negative modifiers', () => {
      expect(calculateThreshold(10, 5, -6)).toBe(9);
    });
  });

  describe('determineSuccess', () => {
    it('should return true for critical success regardless of threshold', () => {
      expect(determineSuccess(20, 5, 'criticalSuccess')).toBe(true);
    });

    it('should return false for critical failure regardless of threshold', () => {
      expect(determineSuccess(1, 20, 'criticalFailure')).toBe(false);
    });

    it('should return true when counting die equals threshold', () => {
      expect(determineSuccess(14, 14, null)).toBe(true);
    });

    it('should return true when counting die is below threshold', () => {
      expect(determineSuccess(12, 14, null)).toBe(true);
    });

    it('should return false when counting die is above threshold', () => {
      expect(determineSuccess(15, 14, null)).toBe(false);
    });
  });

  describe('Integration Tests - Complete Roll Flow', () => {
    it('should succeed with middle die 12 against threshold 14', () => {
      const values = [12, 19, 8];
      const threshold = 14;
      const advantage = TNO_ADVANTAGE.none;

      const counting = pickCountingDie(values, advantage);
      const critical = criticalResultFor(values, advantage);
      const success = determineSuccess(counting.value, threshold, critical);

      expect(counting.value).toBe(12);
      expect(critical).toBeNull();
      expect(success).toBe(true);
    });

    it('should fail with middle die 15 against threshold 14', () => {
      const values = [15, 19, 8];
      const threshold = 14;
      const advantage = TNO_ADVANTAGE.none;

      const counting = pickCountingDie(values, advantage);
      const critical = criticalResultFor(values, advantage);
      const success = determineSuccess(counting.value, threshold, critical);

      expect(counting.value).toBe(15);
      expect(critical).toBeNull();
      expect(success).toBe(false);
    });

    it('should auto-succeed on critical success regardless of threshold', () => {
      const values = [1, 1, 15];
      const threshold = 5;
      const advantage = TNO_ADVANTAGE.none;

      const critical = criticalResultFor(values, advantage);
      const success = determineSuccess(0, threshold, critical);

      expect(critical).toBe('criticalSuccess');
      expect(success).toBe(true);
    });

    it('should auto-fail on critical failure regardless of threshold', () => {
      const values = [20, 20, 5];
      const threshold = 20;
      const advantage = TNO_ADVANTAGE.none;

      const critical = criticalResultFor(values, advantage);
      const success = determineSuccess(0, threshold, critical);

      expect(critical).toBe('criticalFailure');
      expect(success).toBe(false);
    });

    it('should succeed with simple advantage lower die', () => {
      const values = [8, 15];
      const threshold = 10;
      const advantage = TNO_ADVANTAGE.advantage;

      const counting = pickCountingDie(values, advantage);
      const critical = criticalResultFor(values, advantage);
      const success = determineSuccess(counting.value, threshold, critical);

      expect(counting.value).toBe(8);
      expect(critical).toBeNull();
      expect(success).toBe(true);
    });

    it('should fail with simple disadvantage higher die', () => {
      const values = [8, 15];
      const threshold = 10;
      const advantage = TNO_ADVANTAGE.disadvantage;

      const counting = pickCountingDie(values, advantage);
      const critical = criticalResultFor(values, advantage);
      const success = determineSuccess(counting.value, threshold, critical);

      expect(counting.value).toBe(15);
      expect(critical).toBeNull();
      expect(success).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle all dice showing same value', () => {
      const values = [10, 10, 10];
      const counting = pickCountingDie(values, TNO_ADVANTAGE.none);
      expect(counting.value).toBe(10);
    });

    it('should handle threshold of 1 (almost always fails)', () => {
      const values = [5, 10, 15];
      const threshold = 1;
      const counting = pickCountingDie(values, TNO_ADVANTAGE.none);
      const success = determineSuccess(counting.value, threshold, null);
      expect(success).toBe(false);
    });

    it('should handle threshold of 20 (almost always succeeds)', () => {
      const values = [5, 10, 15];
      const threshold = 20;
      const counting = pickCountingDie(values, TNO_ADVANTAGE.none);
      const success = determineSuccess(counting.value, threshold, null);
      expect(success).toBe(true);
    });

    it('should handle zero threshold', () => {
      const values = [5, 10, 15];
      const threshold = 0;
      const counting = pickCountingDie(values, TNO_ADVANTAGE.none);
      const success = determineSuccess(counting.value, threshold, null);
      expect(success).toBe(false);
    });

    it('should handle negative threshold', () => {
      const values = [5, 10, 15];
      const threshold = -5;
      const counting = pickCountingDie(values, TNO_ADVANTAGE.none);
      const success = determineSuccess(counting.value, threshold, null);
      expect(success).toBe(false);
    });

    it('should preserve die index in counting die result', () => {
      const values = [19, 8, 12];
      const result = pickCountingDie(values, TNO_ADVANTAGE.none);
      expect(result.value).toBe(12);
      expect(result.index).toBe(2);
    });
  });
});

// The envelope as the defender actually meets it. Asserting `flags.tno.envelope`
// alone would leave the sentence they read untested, and it is the sentence —
// not the flag — that the manual path depends on.
describe('envelopeLines', () => {
  const zones = {
    head: 'Head',
    torso: 'Torso',
    arms: 'Arms',
    legs: 'Legs',
  };

  const withGlobals = (fn) => {
    const priorGame = globalThis.game;
    const priorConfig = globalThis.CONFIG;
    globalThis.game = {
      i18n: {
        localize: (key) => key,
        format: (key, values) => `${key}(${Object.values(values ?? {}).join(',')})`,
      },
    };
    globalThis.CONFIG = { TNO: { armorZones: zones } };
    try {
      return fn();
    } finally {
      globalThis.game = priorGame;
      globalThis.CONFIG = priorConfig;
    }
  };

  const full = {
    from: 'Anton',
    dk: 4,
    ansage: 3,
    zone: 'head',
    penetration: 5,
    sharp: 4,
    blunt: 2,
  };

  it('says nothing at all for a roll that carried no envelope', () => {
    // Every non-combat roll in the system goes through the same renderer.
    expect(withGlobals(() => envelopeLines(null))).toBeNull();
    expect(withGlobals(() => envelopeLines({ ansage: 3 }))).toBeNull();
  });

  it('states the Ansage as one figure, not one per defence', () => {
    // Which of the defender's rolls it lands on was settled out loud when the
    // two players agreed the number; the card carries the amount and no claim
    // about where it applies.
    expect(withGlobals(() => envelopeLines(full)).lines).toContain('TNO.Combat.Envelope.Ansage(3)');
    // Nothing declared is not a penalty and must not read as one.
    const plain = withGlobals(() => envelopeLines({ ...full, ansage: 0 }));
    expect(plain.lines.some((line) => line.startsWith('TNO.Combat.Envelope.Ansage'))).toBe(false);
  });

  it('carries the Distanzklasse as information, and only for melee', () => {
    // Reach stays a shared observation each side answers for itself — this is
    // the fact it is answered from.
    expect(withGlobals(() => envelopeLines(full)).lines).toContain('TNO.Combat.Envelope.Dk(4)');
    // A ranged weapon has no melee Distanzklasse, so the line is absent rather
    // than showing a null.
    const ranged = withGlobals(() => envelopeLines({ ...full, dk: null }));
    expect(ranged.lines.some((line) => line.startsWith('TNO.Combat.Envelope.Dk'))).toBe(false);
  });

  it('always names a Stelle, defaulting to Torso', () => {
    expect(withGlobals(() => envelopeLines(full)).lines).toContain('Head');
    // An attack that announced nothing still tells the defender where it landed.
    const plain = withGlobals(() => envelopeLines({ from: 'Anton', sharp: 4, blunt: 2 }));
    expect(plain.lines).toContain('Torso');
  });

  it('reads out the weapon card so the defender can make the comparison', () => {
    // The penetration comparison needs one number from each side; this is the
    // direction that keeps the armour private.
    expect(withGlobals(() => envelopeLines(full)).lines)
      .toContain('TNO.Combat.Envelope.Damage(5,4,2)');
    // A weapon with no authored damage says nothing rather than "undefined".
    const unauthored = withGlobals(() => envelopeLines({ from: 'Anton', sharp: null, blunt: null }));
    expect(unauthored.lines.some((line) => line.startsWith('TNO.Combat.Envelope.Damage'))).toBe(false);
  });

  it('never claims the armour was bypassed, since that is the defenders own call', () => {
    // The card carries an amount, not a reason — so it cannot say a bypass was
    // bought, and the defender ticks that box on their own resistance roll.
    expect(withGlobals(() => envelopeLines({ ...full, bypassArmor: true })).lines)
      .not.toContain('TNO.Combat.Envelope.BypassArmor');
  });
});
