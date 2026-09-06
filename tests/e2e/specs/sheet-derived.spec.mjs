/**
 * Character sheet + derived data.
 *
 * These are the values TnoActor#_prepareCharacterData computes on every
 * `prepareDerivedData()` (module/documents/actor.mjs) and that
 * templates/actor/actor-character-sheet.hbs renders. Unit tests cannot reach
 * them: they only exist once a real Actor document has been prepared by Foundry.
 *
 * The expected numbers below are written out as literals rather than recomputed
 * from the same formula the code uses — a test that re-derives the expectation
 * would pass even if the formula were wrong.
 */

import { armor, gear, test, expect, createCharacter, openSheet } from '../fixtures.mjs';

/**
 * Attribute bases chosen so each formula produces a distinct, non-obvious
 * result. In particular the averages are deliberately not whole numbers, so a
 * ceil/round/floor mix-up changes the answer instead of going unnoticed.
 */
const ABILITIES = {
  str: 5, dex: 7, fin: 3, per: 5, aut: 2, cha: 3,
  man: 4, emp: 6, wil: 9, int: 8, wis: 4, inv: 3,
};

const EXPECTED = {
  initiative: 7,      // ceil((2*7 + 5) / 3)  = ceil(6.33) — round() would give 6
  movementWalk: 7,    // dex
  movementSprint: 21, // 3 * dex
  movementCrawl: 1,   // constant
  canSprint: true,    // the empty slot budget permits sprinting
  carrySlots: 17,     // 2*5 + 7
  carrySlotsUsed: 0,  // no items worn or carried
  carryWorn: 0,
  carryCarried: 0,
  carryState: 'ok',   // an empty pack is never a movement penalty
  carryNoContainer: false,
  damage: {
    sharp: 0,
    blunt: 0,
    capacity: 5,
    total: 0,
    malus: 0,
    downed: false,
  },
  armorSv: 0,         // nothing worn, so no strength requirement
  sixthSense: 5,      // round((5 + 6 + 3) / 3) = round(4.67)
  insight: 6,         // ceil((8 + 4) / 2)
  trialErrorMax: 9,   // ceil((8 + 9) / 2) = ceil(8.5) — floor() would give 8
  edgePoolMax: 7,     // ceil((9 + 4) / 2) = ceil(6.5)
  edgePool: 7,        // nothing spent yet
  postMortem: 6,      // 2 * inv
};

test('derived data is computed from the attribute bases', async ({ world }) => {
  const { derived } = await createCharacter(world.page, { abilities: ABILITIES });
  expect(derived).toMatchObject(EXPECTED);
});

test('the character sheet renders the derived values', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });
  const sheet = await openSheet(world.page, id);

  // All three left the banner for the derived strip under the attribute
  // matrix, on the Basics tab that opens by default. The combat tracker, not
  // the character sheet, still owns the actual initiative roll.
  await expect(sheet.locator('.derived-initiative .derived-cell-value')).toHaveText('7');
  await expect(sheet.locator('.portrait-init')).toHaveCount(0);
  await expect(sheet.locator('.derived-sense .derived-cell-value')).toHaveText('5');

  // Crawl | walk | sprint, on the strip's own read-only line.
  await expect(sheet.locator('.derived-move b')).toHaveText(['1', '7', '21']);

  // Nothing in the band rolls dice any more.
  await expect(sheet.locator('.sheet-banner .rollable')).toHaveCount(0);

  // Carry capacity is the Trageslots header's read-out, not a chip of its own.
  await expect(sheet.locator('.slot-grid-count')).toHaveText('0/17');

  // The edge pool is a pip per point of the max, filled up to what is left.
  await expect(sheet.locator('.edge-pip')).toHaveCount(7);
  await expect(sheet.locator('.edge-pip.filled')).toHaveCount(7);

  expect(world.errors, 'no uncaught page errors while rendering the sheet').toEqual([]);
});

test('the attribute heatmap renders one coloured cell per attribute', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });
  const sheet = await openSheet(world.page, id);

  const cells = sheet.locator('.attribute-table.heatmap .heatmap-cell');
  await expect(cells).toHaveCount(12);

  // Every cell gets its background from colorForValue(); a cell left unstyled
  // means the heatmap wiring broke, which is invisible to a snapshot of values.
  const backgrounds = await cells.evaluateAll((els) =>
    els.map((el) => el.style.background || el.style.backgroundColor)
  );
  expect(backgrounds.every((bg) => bg && bg.length > 0)).toBe(true);
  expect(new Set(backgrounds).size, 'differing attribute values produce differing colours').toBeGreaterThan(1);
});

test('a stale legacy value cannot override the sole attribute rating', async ({ world }) => {
  const { derived } = await createCharacter(world.page, {
    abilities: { ...ABILITIES, dex: { base: 7, value: 4 } },
  });

  expect(derived.canSprint).toBe(true);
  expect(derived.movementWalk).toBe(7);
  expect(derived.movementSprint).toBe(21);
  expect(derived.initiative).toBe(7);
});

test('the edge pool refills to its max minus what has been spent', async ({ world }) => {
  const { derived } = await createCharacter(world.page, {
    abilities: ABILITIES,
    system: { problemSolving: { spent: 3 } },
  });

  expect(derived.edgePoolMax).toBe(7);
  expect(derived.edgePool).toBe(4);
});

test('spending more than the pool holds clamps to zero rather than going negative', async ({ world }) => {
  const { derived } = await createCharacter(world.page, {
    abilities: ABILITIES,
    system: { problemSolving: { spent: 99 } },
  });

  expect(derived.edgePool).toBe(0);
});

test('carried items consume slots by slot cost times quantity', async ({ world }) => {
  const { derived } = await createCharacter(world.page, {
    abilities: ABILITIES,
    items: [
      gear({ name: 'Crate', slots: 3, quantity: 2 }),
      gear({ name: 'Toolkit', slots: 4 }),
      // A feature is not carried gear, so it must not consume slots.
      { name: 'Steady Hands', type: 'feature', system: {} },
    ],
  });

  expect(derived.carrySlotsUsed).toBe(10); // 3*2 + 4*1
  expect(derived.carrySlots).toBe(17);
  // 10 of 17 is past half, which by the Inventarregeln already costs sprinting.
  expect(derived.carryState).toBe('noSprint');
  expect(derived.canSprint).toBe(false);
});

test('worn armour remains in the slot budget and moves into the worn subtotal', async ({ world }) => {
  // Neither is worn yet, so both are merely carried.
  const { id, items, derived } = await createCharacter(world.page, {
    abilities: ABILITIES,
    items: [
      armor({ name: 'Composite Helmet', zone: 'head', slots: 2, rh: 5, rw: 3, ra: 8 }),
      armor({ name: 'Spare Plates', zone: 'torso', slots: 3 }),
    ],
  });

  // Putting the helmet on is the transition under test, so it happens here
  // rather than in the fixture: the point is the pair of readings around it.
  const result = await world.page.evaluate(async ([actorId, helmId]) => {
    const actor = game.actors.get(actorId);
    await actor.update({ 'system.equipment.head': helmId });
    return {
      worn: actor.system.derived.carrySlotsUsed,
      wornSubtotal: actor.system.derived.carryWorn,
      carriedSubtotal: actor.system.derived.carryCarried,
    };
  }, [id, items['Composite Helmet']]);

  expect(derived.carrySlotsUsed).toBe(5); // 2 + 3, neither worn yet
  expect(result.worn).toBe(5); // wearing changes the band, not the shared total
  expect(result.wornSubtotal).toBe(2);
  expect(result.carriedSubtotal).toBe(3);
});

test('the Unterkleidung layers under every zone without granting hardness', async ({ world }) => {
  const { derived } = await createCharacter(world.page, {
    abilities: ABILITIES,
    items: [
      armor({ name: 'Vacuum Suit', zone: 'suit', equipped: true, rh: 2, rw: 1, ra: 6 }),
      armor({ name: 'Composite Helmet', zone: 'head', equipped: true, rh: 5, rw: 3, ra: 8 }),
    ],
  });
  const zones = derived.armor;

  // RH comes from the addon alone — 5, not 5+2.
  expect(zones.head.rh).toBe(5);
  // RW adds suit and addon.
  expect(zones.head.rw).toBe(4);
  // RA adds too, clamped to the documented 1-10 band.
  expect(zones.head.ra).toBe(10);
  // The suit still covers a zone with no addon of its own, but gives it no RH.
  expect(zones.legs).toMatchObject({ rh: 0, rw: 1, ra: 6 });
});

test('exceeding the slot budget drops the character to crawling', async ({ world }) => {
  // 20 slots against a budget of 17 — over capacity is legal, it just costs
  // movement, so the item is created rather than refused.
  const { derived } = await createCharacter(world.page, {
    abilities: ABILITIES,
    items: [gear({ name: 'Cargo', slots: 4, quantity: 5 })],
  });

  expect(derived.carrySlotsUsed).toBe(20);
  expect(derived.carryState).toBe('crawlOnly');
  expect(derived.canSprint).toBe(false);
});

test('without a container only worn gear participates in the slot economy', async ({ world }) => {
  const { id } = await createCharacter(world.page, {
    abilities: ABILITIES,
    items: [
      gear({ name: 'Cargo', slots: 4, quantity: 5 }),
      armor({ name: 'Suit', zone: 'suit', slots: 6, equipped: true }),
    ],
  });

  // Losing the container is the transition under test.
  const derived = await world.page.evaluate(async (actorId) => {
    const actor = game.actors.get(actorId);
    await actor.update({ 'system.hasContainer': false });
    return foundry.utils.deepClone(actor.system.derived);
  }, id);

  expect(derived.carrySlotsUsed).toBe(6);
  expect(derived.carryWorn).toBe(6);
  expect(derived.carryCarried).toBe(0);
  expect(derived.carryState).toBe('ok');
  expect(derived.carryNoContainer).toBe(true);
});
