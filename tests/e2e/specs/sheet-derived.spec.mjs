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
  carryState: 'ok',   // an empty pack is never a movement penalty
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

  // Initiative is rendered as "<value><small>+1d10</small>" in the banner's
  // portrait caption, because it is rolled as initiative + 1d10.
  await expect(sheet.locator('.portrait-init[data-roll*="derived.initiative"] .init-value')).toHaveText(
    '7+1d10'
  );
  await expect(sheet.locator('.chip-sense .chip-value')).toHaveText('5');

  // Crawl | walk | sprint, in one banner chip.
  await expect(sheet.locator('.chip-movement .chip-move')).toHaveText(['1', '7', '21']);

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

test('carried items consume slots by slot cost times quantity', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });

  const derived = await world.page.evaluate(async (actorId) => {
    const actor = game.actors.get(actorId);
    await actor.createEmbeddedDocuments('Item', [
      { name: 'Crate', type: 'item', system: { slots: 3, quantity: 2 } },
      { name: 'Toolkit', type: 'item', system: { slots: 4, quantity: 1 } },
      // A feature is not carried gear, so it must not consume slots.
      { name: 'Steady Hands', type: 'feature', system: {} },
    ]);
    return foundry.utils.deepClone(actor.system.derived);
  }, id);

  expect(derived.carrySlotsUsed).toBe(10); // 3*2 + 4*1
  expect(derived.carrySlots).toBe(17);
  // 10 of 17 is past half, which by the Inventarregeln already costs sprinting.
  expect(derived.carryState).toBe('noSprint');
  expect(derived.canSprint).toBe(false);
});

test('worn armour is exempt from the slot budget, carried armour is not', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });

  const result = await world.page.evaluate(async (actorId) => {
    const actor = game.actors.get(actorId);
    const [helm] = await actor.createEmbeddedDocuments('Item', [
      { name: 'Composite Helmet', type: 'armor', system: { zone: 'head', slots: 2, rh: 5, rw: 3, ra: 8 } },
      { name: 'Spare Plates', type: 'armor', system: { zone: 'torso', slots: 3 } },
    ]);

    // Both are merely carried at this point.
    const carried = actor.system.derived.carrySlotsUsed;

    await actor.update({ 'system.equipment.head': helm.id });
    const worn = actor.system.derived.carrySlotsUsed;

    return { carried, worn };
  }, id);

  expect(result.carried).toBe(5); // 2 + 3, neither worn yet
  expect(result.worn).toBe(3); // the helmet no longer counts once worn
});

test('the Unterkleidung layers under every zone without granting hardness', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });

  const armor = await world.page.evaluate(async (actorId) => {
    const actor = game.actors.get(actorId);
    const [suit, helm] = await actor.createEmbeddedDocuments('Item', [
      { name: 'Vacuum Suit', type: 'armor', system: { zone: 'suit', rh: 2, rw: 1, ra: 6 } },
      { name: 'Composite Helmet', type: 'armor', system: { zone: 'head', rh: 5, rw: 3, ra: 8 } },
    ]);
    await actor.update({ 'system.equipment.suit': suit.id, 'system.equipment.head': helm.id });
    return foundry.utils.deepClone(actor.system.derived.armor);
  }, id);

  // RH comes from the addon alone — 5, not 5+2.
  expect(armor.head.rh).toBe(5);
  // RW adds suit and addon.
  expect(armor.head.rw).toBe(4);
  // RA adds too, clamped to the documented 1-10 band.
  expect(armor.head.ra).toBe(10);
  // The suit still covers a zone with no addon of its own, but gives it no RH.
  expect(armor.legs).toMatchObject({ rh: 0, rw: 1, ra: 6 });
});

test('exceeding the slot budget drops the character to crawling', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });

  const derived = await world.page.evaluate(async (actorId) => {
    const actor = game.actors.get(actorId);
    // 20 slots against a budget of 17 — over capacity is legal, it just costs
    // movement, so the item is created rather than refused.
    await actor.createEmbeddedDocuments('Item', [
      { name: 'Cargo', type: 'item', system: { slots: 4, quantity: 5 } },
    ]);
    return foundry.utils.deepClone(actor.system.derived);
  }, id);

  expect(derived.carrySlotsUsed).toBe(20);
  expect(derived.carryState).toBe('crawlOnly');
  expect(derived.canSprint).toBe(false);
});

test('without a container there is no slot economy at all', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });

  const derived = await world.page.evaluate(async (actorId) => {
    const actor = game.actors.get(actorId);
    await actor.createEmbeddedDocuments('Item', [
      { name: 'Cargo', type: 'item', system: { slots: 4, quantity: 5 } },
    ]);
    await actor.update({ 'system.hasContainer': false });
    return foundry.utils.deepClone(actor.system.derived);
  }, id);

  expect(derived.carrySlotsUsed).toBe(0);
  expect(derived.carryState).toBe('noContainer');
});
