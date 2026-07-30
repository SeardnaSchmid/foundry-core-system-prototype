/**
 * ApplicationV2 sheet plumbing.
 *
 * The character sheet was migrated from the V1 `ActorSheet` to
 * `HandlebarsApplicationMixin(ActorSheetV2)` specifically to gain Foundry v14's
 * native pop-out: the "Detach" control ships in
 * `ApplicationV2.DEFAULT_OPTIONS.window.controls` and V1 windows never render
 * it. These tests pin the two things that migration hinges on — the detach
 * affordance existing, and tab navigation still working now that it is driven
 * by `ApplicationV2#changeTab` instead of the V1 `Tabs` helper.
 */

import { test, expect, createCharacter, openSheet } from '../fixtures.mjs';

const ABILITIES = {
  str: 5, dex: 7, fin: 3, per: 5, aut: 2, cha: 3,
  man: 4, emp: 6, wil: 9, int: 8, wis: 4, inv: 3,
};

test('the character sheet is an ApplicationV2 that permits detaching', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });
  await openSheet(world.page, id);

  const state = await world.page.evaluate((actorId) => {
    const sheet = game.actors.get(actorId).sheet;
    return {
      isV2: sheet instanceof foundry.applications.api.ApplicationV2,
      canDetach: sheet._canDetach(),
      // The control is rendered into the frame's header controls dropdown.
      hasDetachControl: [...sheet._headerControlButtons()].some((c) => c.action === 'detach'),
    };
  }, id);

  expect(state).toEqual({ isV2: true, canDetach: true, hasDetachControl: true });
  expect(world.errors, 'no uncaught page errors while rendering the sheet').toEqual([]);
});

test('tab navigation switches the active tab', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: ABILITIES });
  const sheet = await openSheet(world.page, id);

  // The sheet opens on "basics" per TnoActorSheet.TABS.
  await expect(sheet.locator('.tab.basics')).toHaveClass(/active/);

  await sheet.locator('nav.sheet-tabs [data-tab="items"]').click();

  await expect(sheet.locator('.tab.items')).toHaveClass(/active/);
  await expect(sheet.locator('.tab.basics')).not.toHaveClass(/active/);
  expect(world.errors, 'no uncaught page errors while switching tabs').toEqual([]);
});
