/**
 * The combat tracker's Haltung column.
 *
 * A Haltung decides which defence a combatant may make, so it is the one piece
 * of state the whole table needs to read without opening a sheet. Only a real
 * sidebar can show whether it got there: the row is built by Foundry's own
 * `_prepareTurnContext` and drawn by a template that is a copy of a core one.
 *
 * This suite therefore does double duty. It checks the Haltung, and it checks
 * that the parts of the core template TNO did not write — the initiative field,
 * the roll button, the effect icons — are still in the copy. That is the drift
 * this system pays for owning the template, and it is worth catching here.
 */

import {
  ABILITIES, test, expect, createCharacter, createCombat, createNpc, deleteCombat,
} from '../fixtures.mjs';

/** Put actors into a combat with the tracker on screen. */
const trackCombat = (page, actorIds) => createCombat(page, actorIds, { render: true });

/** What `CONFIG.TNO` says a Haltung is called and which icon it wears. */
function stanceConfig(page, key) {
  return page.evaluate((k) => {
    const stance = CONFIG.TNO.stances[k];
    return { label: game.i18n.localize(stance.label), icon: stance.icon };
  }, key);
}

test('the tracker shows each combatant stance beside its initiative', async ({ world }) => {
  const enGarde = await createCharacter(world.page, {
    name: 'E2E En Garde', abilities: ABILITIES, stance: 'enGarde',
  });
  const inCover = await createCharacter(world.page, {
    name: 'E2E In Cover', abilities: ABILITIES, stance: 'inCover',
  });

  const { id: combatId } = await trackCombat(world.page, [enGarde.id, inCover.id]);

  for (const [name, key] of [['E2E En Garde', 'enGarde'], ['E2E In Cover', 'inCover']]) {
    const { label, icon } = await stanceConfig(world.page, key);
    const row = world.page.locator('#combat li.combatant').filter({ hasText: name });
    await expect(row.locator('.tno-stance-label')).toHaveText(label);
    await expect(row.locator(`.tno-stance-chip i.${icon}`)).toHaveCount(1);
  }

  // The core parts of the copied template, which nothing else would notice the
  // loss of until a Foundry upgrade had already shipped.
  const first = world.page.locator('#combat li.combatant').first();
  await expect(first.locator('.token-initiative .combatant-control.roll')).toHaveCount(1);
  await expect(first.locator('.token-effects')).toHaveCount(1);
  await world.page.evaluate((id) => {
    const combat = game.combats.get(id);
    return combat.rollInitiative(combat.combatants.map((c) => c.id));
  }, combatId);
  await expect(first.locator('input.initiative-input')).toHaveCount(1);

  await deleteCombat(world.page, combatId);
  expect(world.errors, 'no uncaught page errors while rendering the tracker').toEqual([]);
});

test('a stance change on the sheet reaches the tracker', async ({ world }) => {
  const { id } = await createCharacter(world.page, {
    name: 'E2E Mover', abilities: ABILITIES, stance: 'open',
  });
  const { id: combatId } = await trackCombat(world.page, [id]);

  const open = await stanceConfig(world.page, 'open');
  const label = world.page.locator('#combat li.combatant .tno-stance-label');
  await expect(label).toHaveText(open.label);

  // Nothing in core re-renders the tracker on an actor update; the system's own
  // `updateActor` hook is what closes that gap.
  await world.page.evaluate(
    (actorId) => game.actors.get(actorId).update({ 'system.combat.stance': 'fastMove' }),
    id
  );

  const fastMove = await stanceConfig(world.page, 'fastMove');
  await expect(label).toHaveText(fastMove.label);

  await deleteCombat(world.page, combatId);
  expect(world.errors, 'no uncaught page errors while changing stance').toEqual([]);
});

test('a combatant without a stance falls back to the default', async ({ world }) => {
  // NPCs have no `system.combat` at all — see template.json — so the tracker
  // draws a row for an actor whose Haltung simply does not exist.
  const npcId = await createNpc(world.page);
  const { id: combatId } = await trackCombat(world.page, [npcId]);

  const fallback = await world.page.evaluate(() => {
    const key = CONFIG.TNO.defaultStance;
    return game.i18n.localize(CONFIG.TNO.stances[key].label);
  });

  await expect(world.page.locator('#combat li.combatant .tno-stance-label')).toHaveText(fallback);

  await deleteCombat(world.page, combatId);
  expect(world.errors, 'no uncaught page errors while rendering an NPC row').toEqual([]);
});
