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

import { test, expect, createCharacter, openSheet } from '../fixtures.mjs';

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
  canSprint: true,    // dex value is undamaged
  carrySlots: 17,     // 2*5 + 7
  carrySlotsUsed: 0,  // no items carried
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

  // Initiative is rendered as "<value><small>+1d10</small>", because it is
  // rolled as initiative + 1d10.
  await expect(sheet.locator('.lozenge[data-roll*="derived.initiative"] .lozenge-value')).toHaveText(
    '7+1d10'
  );
  await expect(sheet.locator('.lozenge[data-roll-type="sixthSense"] .lozenge-value')).toHaveText('5');

  const movement = sheet.locator('.movement-group .movement-value');
  await expect(movement).toHaveText(['1', '7', '21', '0/17']);

  // The edge pool is an editable input showing what is left, capped at the max.
  const reserve = sheet.locator('.reserve-value-input');
  await expect(reserve).toHaveValue('7');
  await expect(reserve).toHaveAttribute('max', '7');

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

test('damaged Beweglichkeit blocks sprinting but leaves derived values stable', async ({ world }) => {
  // canSprint is the one derived value that compares value against base; the
  // rest are computed from base alone so they stay put under temporary damage.
  const { derived } = await createCharacter(world.page, {
    abilities: { ...ABILITIES, dex: { base: 7, value: 4 } },
  });

  expect(derived.canSprint).toBe(false);
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

test('carried items consume slots by weight times quantity', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });

  const derived = await world.page.evaluate(async (actorId) => {
    const actor = game.actors.get(actorId);
    await actor.createEmbeddedDocuments('Item', [
      { name: 'Crate', type: 'item', system: { weight: 3, quantity: 2 } },
      { name: 'Toolkit', type: 'item', system: { weight: 4, quantity: 1 } },
      // A feature is not carried gear, so it must not consume slots.
      { name: 'Steady Hands', type: 'feature', system: {} },
    ]);
    return foundry.utils.deepClone(actor.system.derived);
  }, id);

  expect(derived.carrySlotsUsed).toBe(10); // 3*2 + 4*1
  expect(derived.carrySlots).toBe(17);
});
