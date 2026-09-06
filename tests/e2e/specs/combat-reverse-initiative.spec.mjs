/**
 * Reverse combat initiative — the slowest combatant acts first.
 *
 * `TnoCombat` overrides four of Foundry's own turn-order methods and keeps its
 * activation history in a Combat flag. None of that exists until Foundry has
 * built a real Combat with real Combatants and a real turn cursor, so the rule
 * is checked here against the live document rather than against a fake.
 *
 * The activation history itself is pure, and its edge cases are pinned down a
 * layer below in `tests/helpers/round-state.test.js` and
 * `tests/documents/combat-turn-order.test.js`.
 */

import { test, expect, createCharacter } from '../fixtures.mjs';

const ABILITIES = {
  str: 5, dex: 7, fin: 3, per: 5, aut: 2, cha: 3,
  man: 4, emp: 6, wil: 9, int: 8, wis: 4, inv: 3,
};

/**
 * Three combatants on fixed initiatives, so the order under test is the rule
 * rather than the dice. They are created out of order on purpose.
 * @returns {Promise<string>} the combat id
 */
async function stageCombat(page) {
  const actorIds = [];
  for (const name of ['Slow', 'Medium', 'Fast']) {
    const { id } = await createCharacter(page, { name: `E2E ${name}`, abilities: ABILITIES });
    actorIds.push(id);
  }

  return page.evaluate(async ([slow, medium, fast]) => {
    const combat = await Combat.create({});
    const created = await combat.createEmbeddedDocuments('Combatant', [
      { actorId: fast }, { actorId: slow }, { actorId: medium },
    ]);
    const byActor = Object.fromEntries(created.map((c) => [c.actorId, c.id]));
    await combat.updateEmbeddedDocuments('Combatant', [
      { _id: byActor[slow], initiative: 6 },
      { _id: byActor[medium], initiative: 9 },
      { _id: byActor[fast], initiative: 14 },
    ]);
    return combat.id;
  }, actorIds);
}

/** The combat outlives the `world` fixture's actor purge, so remove it by hand. */
async function endCombat(page, combatId) {
  await page.evaluate((id) => game.combats.get(id)?.delete(), combatId);
}

test('the slowest combatant activates first when combat starts', async ({ world }) => {
  const combatId = await stageCombat(world.page);

  const result = await world.page.evaluate(async (id) => {
    const combat = game.combats.get(id);
    const order = combat.turns.map((c) => c.name);
    await combat.startCombat();
    return {
      order,
      active: combat.turns[combat.turn].name,
      activated: combat.activatedIds.length,
      baseInitiatives: Object.values(combat.getFlag('tno', 'baseInitiatives')),
    };
  }, combatId);

  // Ascending order is the whole mechanism: it makes turns[0] the slowest, so
  // Foundry's own turn cursor already walks slow to fast.
  expect(result.order).toEqual(['E2E Slow', 'E2E Medium', 'E2E Fast']);
  expect(result.active).toBe('E2E Slow');
  expect(result.activated).toBe(1);
  expect(result.baseInitiatives.sort((a, b) => a - b)).toEqual([6, 9, 14]);

  await endCombat(world.page, combatId);
  expect(world.errors, 'no uncaught page errors while starting combat').toEqual([]);
});

test('next turn walks from the slowest to the fastest combatant', async ({ world }) => {
  const combatId = await stageCombat(world.page);

  const result = await world.page.evaluate(async (id) => {
    const combat = game.combats.get(id);
    await combat.startCombat();
    const seen = [combat.turns[combat.turn].name];
    await combat.nextTurn();
    seen.push(combat.turns[combat.turn].name);
    await combat.nextTurn();
    seen.push(combat.turns[combat.turn].name);
    return { seen, round: combat.round, activated: combat.activatedIds.length };
  }, combatId);

  expect(result.seen).toEqual(['E2E Slow', 'E2E Medium', 'E2E Fast']);
  expect(result.round).toBe(1);
  expect(result.activated).toBe(3);

  await endCombat(world.page, combatId);
  expect(world.errors, 'no uncaught page errors while advancing turns').toEqual([]);
});

test('previous turn retraces the activation history', async ({ world }) => {
  const combatId = await stageCombat(world.page);

  const result = await world.page.evaluate(async (id) => {
    const combat = game.combats.get(id);
    await combat.startCombat();
    await combat.nextTurn();
    await combat.nextTurn();

    const back = [];
    await combat.previousTurn();
    back.push(combat.turns[combat.turn].name);
    await combat.previousTurn();
    back.push(combat.turns[combat.turn].name);
    return { back, activated: combat.activatedIds };
  }, combatId);

  expect(result.back).toEqual(['E2E Medium', 'E2E Slow']);
  expect(result.activated).toHaveLength(1);

  await endCombat(world.page, combatId);
  expect(world.errors, 'no uncaught page errors while rewinding turns').toEqual([]);
});

test('a new round restores the initiative values from combat start', async ({ world }) => {
  const combatId = await stageCombat(world.page);

  const result = await world.page.evaluate(async (id) => {
    const combat = game.combats.get(id);
    await combat.startCombat();
    // Whatever the round did to the numbers — a hand edit, a drag — the next
    // round starts from the values the encounter opened on.
    await combat.setInitiative(combat.turns[0].id, 99);
    await combat.nextRound();
    return {
      round: combat.round,
      initiatives: combat.turns.map((c) => c.initiative),
      active: combat.turns[combat.turn].name,
    };
  }, combatId);

  expect(result.round).toBe(2);
  expect(result.initiatives).toEqual([6, 9, 14]);
  expect(result.active).toBe('E2E Slow');

  await endCombat(world.page, combatId);
  expect(world.errors, 'no uncaught page errors while turning the round').toEqual([]);
});

test('the GM can pull a combatant forward out of order', async ({ world }) => {
  const combatId = await stageCombat(world.page);

  const result = await world.page.evaluate(async (id) => {
    const combat = game.combats.get(id);
    await combat.startCombat();

    const fast = combat.turns.find((c) => c.name === 'E2E Fast');
    await combat.activateEarly(fast.id);
    const afterInterrupt = combat.turns[combat.turn].name;

    // A second attempt in the same round is refused: an interrupt is once per
    // combatant per round.
    await combat.activateEarly(fast.id);
    const afterRepeat = combat.turns[combat.turn].name;

    // The round now owes only the combatant who was skipped over.
    await combat.nextTurn();
    return {
      afterInterrupt,
      afterRepeat,
      activated: combat.activatedIds.length,
      next: combat.turns[combat.turn].name,
      round: combat.round,
    };
  }, combatId);

  expect(result.afterInterrupt).toBe('E2E Fast');
  expect(result.afterRepeat).toBe('E2E Fast');
  expect(result.activated).toBe(3);
  expect(result.next).toBe('E2E Medium');
  expect(result.round).toBe(1);

  await endCombat(world.page, combatId);
  expect(world.errors, 'no uncaught page errors while interrupting').toEqual([]);
});
