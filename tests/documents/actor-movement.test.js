import { describe, expect, it } from 'vitest';

// The three Bewegungsreichweiten are the only derived values a player reads
// straight off the banner without a roll ever touching them, which is why they
// went uncovered for so long — and why a wrong one is invisible until someone
// counts squares. All three come out of `_prepareCharacterData`, so the whole
// tier is checked here by preparing an actor and reading the chip's numbers.
globalThis.Actor = class {};
globalThis.CONFIG = {
  TNO: {
    stances: { open: { label: 'TNO.Combat.Stance.Open', defenses: [] } },
    defaultStance: 'open',
  },
};

const { TnoActor } = await import('../../module/documents/actor.mjs');

/**
 * A character with nothing worn and nothing carried, so the load thresholds
 * never enter into it and the movement numbers are the attribute alone.
 * `base` and `value` are set apart wherever a test needs to tell damage from
 * training.
 */
const prepared = ({ dexBase = 4, dexValue = dexBase } = {}) => {
  const actor = Object.assign(new TnoActor(), {
    type: 'character',
    items: [],
    system: {
      abilities: {
        str: { base: 4, value: 4 },
        dex: { base: dexBase, value: dexValue },
      },
      skills: {},
      equipment: {},
      hasContainer: true,
      combat: { stance: 'open', defenses: { parry: 0, dodge: 0 } },
    },
  });
  actor._prepareCharacterData(actor);
  return actor.system.derived;
};

describe('Bewegungsreichweiten', () => {
  it('derives all three tiers from Beweglichkeit', () => {
    const derived = prepared({ dexBase: 6 });
    expect(derived.movementWalk).toBe(6);
    expect(derived.movementSprint).toBe(18);
    // Beweglichkeit/3, aufgerundet.
    expect(derived.movementCrawl).toBe(2);
  });

  it('rounds the crawl up, never to nearest and never down', () => {
    expect(prepared({ dexBase: 3 }).movementCrawl).toBe(1);
    expect(prepared({ dexBase: 4 }).movementCrawl).toBe(2);
    expect(prepared({ dexBase: 5 }).movementCrawl).toBe(2);
    expect(prepared({ dexBase: 7 }).movementCrawl).toBe(3);
    expect(prepared({ dexBase: 8 }).movementCrawl).toBe(3);
  });

  // Rounding up is also what keeps the tier reachable at all: a Beweglichkeit
  // of 1 or 2 rounds to nothing under round-to-nearest.
  it('leaves the lowest Beweglichkeit a crawl to make', () => {
    expect(prepared({ dexBase: 1 }).movementCrawl).toBe(1);
    expect(prepared({ dexBase: 2 }).movementCrawl).toBe(1);
  });

  // "Bewegungsreichweiten ändern sich nie, stattdessen verhindert jeder
  // Beweglichkeitsschaden, dass der Charakter sprintet." So damage moves the
  // sprint flag and leaves all three numbers exactly where they were.
  it('holds every tier steady under Beweglichkeitsschaden, blocking only the sprint', () => {
    const hurt = prepared({ dexBase: 6, dexValue: 3 });
    expect(hurt.movementWalk).toBe(6);
    expect(hurt.movementSprint).toBe(18);
    expect(hurt.movementCrawl).toBe(2);
    expect(hurt.canSprint).toBe(false);
    expect(prepared({ dexBase: 6 }).canSprint).toBe(true);
  });
});
