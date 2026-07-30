/**
 * Combat tracker initiative.
 *
 * The tracker must roll the same thing the character sheet's Initiative
 * lozenge rolls — TNO.initiativeFormula, "1d10 + @derived.initiative" — rather
 * than a formula of its own. That wiring only exists once Foundry has built a
 * real Combat with a real Combatant, so it cannot be unit tested.
 */

import { test, expect, createCharacter, openSheet } from '../fixtures.mjs';

/** ceil((2*7 + 5) / 3) = 7, so every roll must land in 8..17. */
const ABILITIES = {
  str: 5, dex: 7, fin: 3, per: 5, aut: 2, cha: 3,
  man: 4, emp: 6, wil: 9, int: 8, wis: 4, inv: 3,
};

/**
 * Put an actor into a fresh combat and roll its initiative through the tracker.
 * Combats outlive the `world` fixture's actor purge, so each one is deleted
 * again on the way out.
 */
async function rollInitiativeFor(page, actorId) {
  return page.evaluate(async (id) => {
    const combat = await Combat.create({});
    const [combatant] = await combat.createEmbeddedDocuments('Combatant', [{ actorId: id }]);

    const formula = combatant.getInitiativeRoll().formula;
    await combat.rollInitiative([combatant.id]);
    const initiative = combat.combatants.get(combatant.id).initiative;

    await combat.delete();
    return { formula, initiative, configured: CONFIG.Combat.initiative.formula };
  }, actorId);
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

test('the sheet lozenge and the tracker share one formula', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });
  const sheet = await openSheet(world.page, id);

  const sheetFormula = await sheet.locator('.lozenge.rollable[data-roll]').first().getAttribute('data-roll');
  const configured = await world.page.evaluate(() => CONFIG.Combat.initiative.formula);

  expect(sheetFormula).toBe(configured);
});

test('an NPC without derived data still rolls initiative', async ({ world }) => {
  // Only characters compute system.derived; the unresolved term used to make
  // the NPC's initiative roll throw instead of falling back to a flat 0.
  const npcId = await world.page.evaluate(async () => {
    const actor = await Actor.create({ name: 'E2E NPC', type: 'npc' });
    return actor.id;
  });

  const { formula, initiative } = await rollInitiativeFor(world.page, npcId);

  expect(formula).toBe('1d10 + 0');
  expect(initiative).toBeGreaterThanOrEqual(1);
  expect(initiative).toBeLessThanOrEqual(10);
  expect(world.errors, 'no uncaught page errors while rolling initiative').toEqual([]);
});
