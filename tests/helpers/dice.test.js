import { describe, it, expect } from 'vitest';
import {
  TNO_ADVANTAGE,
  dieCountFor,
  pickCountingDie,
  criticalResultFor,
  envelopeLines,
  resolveDice,
} from '../../module/helpers/dice.mjs';

const successOf = (values, advantage, threshold) => resolveDice(values, advantage, threshold).success;

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

  describe('resolveDice', () => {
    it('succeeds when the counting die equals or undercuts the threshold', () => {
      expect(successOf([14, 2, 19], TNO_ADVANTAGE.none, 14)).toBe(true);
      expect(successOf([12, 2, 19], TNO_ADVANTAGE.none, 14)).toBe(true);
      expect(successOf([15, 2, 19], TNO_ADVANTAGE.none, 14)).toBe(false);
    });

    it('lets a critical decide whatever the threshold', () => {
      expect(resolveDice([1, 1, 15], TNO_ADVANTAGE.none, 0)).toMatchObject({ success: true, outcome: 'criticalSuccess' });
      expect(resolveDice([20, 20, 5], TNO_ADVANTAGE.none, 20)).toMatchObject({ success: false, outcome: 'criticalFailure' });
    });

    it('gives a base roll without a threshold no outcome but a critical', () => {
      expect(resolveDice([5, 10, 15], TNO_ADVANTAGE.none)).toMatchObject({ success: null, outcome: null });
      expect(resolveDice([1, 1, 15], TNO_ADVANTAGE.none)).toMatchObject({ success: true, outcome: 'criticalSuccess' });
    });

    it('draws the dice sorted with the counting die marked', () => {
      expect(resolveDice([19, 8, 12], TNO_ADVANTAGE.none, 10).dice).toEqual([
        { value: 8, isCounted: false },
        { value: 12, isCounted: true },
        { value: 19, isCounted: false },
      ]);
    });
  });

  describe('Integration Tests - Complete Roll Flow', () => {
    it('should succeed with middle die 12 against threshold 14', () => {
      const values = [12, 19, 8];
      const threshold = 14;
      const advantage = TNO_ADVANTAGE.none;

      const counting = pickCountingDie(values, advantage);
      const critical = criticalResultFor(values, advantage);
      const { success } = resolveDice(values, advantage, threshold);

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
      const { success } = resolveDice(values, advantage, threshold);

      expect(counting.value).toBe(15);
      expect(critical).toBeNull();
      expect(success).toBe(false);
    });

    it('should auto-succeed on critical success regardless of threshold', () => {
      const values = [1, 1, 15];
      const threshold = 5;
      const advantage = TNO_ADVANTAGE.none;

      const critical = criticalResultFor(values, advantage);
      const { success } = resolveDice(values, advantage, threshold);

      expect(critical).toBe('criticalSuccess');
      expect(success).toBe(true);
    });

    it('should auto-fail on critical failure regardless of threshold', () => {
      const values = [20, 20, 5];
      const threshold = 20;
      const advantage = TNO_ADVANTAGE.none;

      const critical = criticalResultFor(values, advantage);
      const { success } = resolveDice(values, advantage, threshold);

      expect(critical).toBe('criticalFailure');
      expect(success).toBe(false);
    });

    it('should succeed with simple advantage lower die', () => {
      const values = [8, 15];
      const threshold = 10;
      const advantage = TNO_ADVANTAGE.advantage;

      const counting = pickCountingDie(values, advantage);
      const critical = criticalResultFor(values, advantage);
      const { success } = resolveDice(values, advantage, threshold);

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
      const { success } = resolveDice(values, advantage, threshold);

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
      const success = successOf(values, TNO_ADVANTAGE.none, threshold);
      expect(success).toBe(false);
    });

    it('should handle threshold of 20 (almost always succeeds)', () => {
      const values = [5, 10, 15];
      const threshold = 20;
      const success = successOf(values, TNO_ADVANTAGE.none, threshold);
      expect(success).toBe(true);
    });

    it('should handle zero threshold', () => {
      const values = [5, 10, 15];
      const threshold = 0;
      const success = successOf(values, TNO_ADVANTAGE.none, threshold);
      expect(success).toBe(false);
    });

    it('should handle negative threshold', () => {
      const values = [5, 10, 15];
      const threshold = -5;
      const success = successOf(values, TNO_ADVANTAGE.none, threshold);
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
  const withGlobals = (fn) => {
    const priorGame = globalThis.game;
    globalThis.game = {
      i18n: {
        localize: (key) => key,
        format: (key, values) => `${key}(${Object.values(values ?? {}).join(',')})`,
      },
    };
    try {
      return fn();
    } finally {
      globalThis.game = priorGame;
    }
  };

  const full = {
    from: 'Anton',
    dk: 4,
    ansage: 3,
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

// What a failed roll costs is offered before the dice and earned only by them.
// The gate lives in `rollTno` because nothing that opens a dialog can know how
// the roll will land — so this is where the card stops promising damage on a
// roll the defender actually made.
describe('rollTno consequence', () => {
  const consequence = { label: 'Anzuwenden', text: '4 Schaden (S)', note: '' };

  /**
   * Roll with the dice forced to `values`, against the given threshold, and
   * report what the card was rendered with and what the message kept.
   */
  const rolled = async (values, threshold) => {
    const prior = { game: globalThis.game, CONFIG: globalThis.CONFIG, foundry: globalThis.foundry, Roll: globalThis.Roll, ChatMessage: globalThis.ChatMessage };
    let rendered = null;
    let created = null;

    globalThis.Roll = class {
      constructor() {
        this.terms = [{ results: values.map((result) => ({ result })) }];
      }

      async evaluate() {
        return this;
      }
    };
    globalThis.ChatMessage = {
      getSpeaker: () => ({}),
      create: async (data) => {
        created = data;
        return data;
      },
    };
    globalThis.CONFIG = { sounds: { dice: '' } };
    globalThis.foundry = {
      applications: {
        handlebars: {
          renderTemplate: async (_path, data) => {
            rendered = data;
            return '';
          },
        },
      },
    };
    globalThis.game = {
      i18n: { localize: (key) => key, format: (key) => key },
      settings: { get: () => 'publicroll' },
    };

    try {
      const { rollTno } = await import('../../module/helpers/dice.mjs');
      await rollTno({ threshold, extraFlags: { consequence } });
      return { rendered, created };
    } finally {
      Object.assign(globalThis, prior);
    }
  };

  it('states the cost on the card that failed', async () => {
    const { rendered, created } = await rolled([15, 16, 17], 5);
    expect(rendered.consequence).toEqual(consequence);
    expect(created.flags.tno.consequence).toEqual(consequence);
  });

  it('says nothing at all on the roll that succeeded', async () => {
    // Both the card and the flag are gated on the same read, so a stored
    // consequence always means it applies.
    const { rendered, created } = await rolled([2, 3, 4], 5);
    expect(rendered.consequence).toBeNull();
    expect(created.flags.tno.consequence).toBeUndefined();
  });

  it('states it on a critical failure too, which is a failure with a name', async () => {
    const { rendered } = await rolled([20, 20, 3], 5);
    expect(rendered.outcome).toBe('criticalFailure');
    expect(rendered.consequence).toEqual(consequence);
  });
});
