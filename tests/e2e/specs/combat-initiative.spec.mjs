/**
 * Combat tracker initiative.
 *
 * The tracker and the character sheet share TNO.initiativeFormula,
 * "1d10 + @derived.initiative". The tracker wiring only exists once Foundry
 * has built a real Combat with a real Combatant, so it cannot be unit tested.
 */

import {
  ABILITIES, test, expect, createCharacter, createCombat, createNpc, deleteCombat, openSheet,
} from '../fixtures.mjs';

// The shared example character's derived initiative is ceil((2*7 + 5) / 3) = 7,
// so every roll below must land in 8..17.

/** Put an actor into a fresh combat and roll its initiative through the tracker. */
async function rollInitiativeFor(page, actorId) {
  const { id, ids } = await createCombat(page, [actorId]);

  const result = await page.evaluate(async ([combatId, combatantId]) => {
    const combat = game.combats.get(combatId);
    const formula = combat.combatants.get(combatantId).getInitiativeRoll().formula;
    await combat.rollInitiative([combatantId]);
    return {
      formula,
      initiative: combat.combatants.get(combatantId).initiative,
      configured: CONFIG.Combat.initiative.formula,
    };
  }, [id, ids[actorId]]);

  await deleteCombat(page, id);
  return result;
}

test('the tracker rolls 1d10 plus the derived initiative value', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });
  const { formula, initiative, configured } = await rollInitiativeFor(world.page, id);

  expect(configured).toBe('1d10 + @derived.initiative');
  // The formula the combatant actually rolls, with the actor's roll data
  // substituted in — this is what proves the derived value reached the tracker.
  expect(formula).toBe('1d10 + 7');
  expect(initiative).toBeGreaterThanOrEqual(8);
  expect(initiative).toBeLessThanOrEqual(17);
});

test('the sheet initiative cell and tracker share one formula', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });
  const sheet = await openSheet(world.page, id);

  const sheetFormula = await sheet.locator('.derived-initiative.rollable[data-roll]').getAttribute('data-roll');
  const configured = await world.page.evaluate(() => CONFIG.Combat.initiative.formula);

  expect(sheetFormula).toBe(configured);
});

test('an NPC without derived data still rolls initiative', async ({ world }) => {
  // Only characters compute system.derived; the unresolved term used to make
  // the NPC's initiative roll throw instead of falling back to a flat 0.
  const npcId = await createNpc(world.page);

  const { formula, initiative } = await rollInitiativeFor(world.page, npcId);

  expect(formula).toBe('1d10 + 0');
  expect(initiative).toBeGreaterThanOrEqual(1);
  expect(initiative).toBeLessThanOrEqual(10);
  expect(world.errors, 'no uncaught page errors while rolling initiative').toEqual([]);
});
