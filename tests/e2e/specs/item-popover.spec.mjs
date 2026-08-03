import { test, expect, createCharacter, openSheet } from '../fixtures.mjs';

test('carry-cell popover stays open across actions and opens the editor directly', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: { str: 5, dex: 5 } });
  const itemId = await world.page.evaluate(async (actorId) => {
    const actor = game.actors.get(actorId);
    const [item] = await actor.createEmbeddedDocuments('Item', [{
      name: 'Popover Carbine',
      type: 'item',
      system: {
        roles: { weapon: true, armor: false, consumable: false },
        use: 'ranged',
        slots: 2,
        quantity: 1,
        fv: { skill: 'shooting', rank: 3 },
        rd: 4,
        ss: { count: 3 },
      },
    }]);
    return item.id;
  }, id);
  const sheet = await openSheet(world.page, id);

  // Foundry's first-world tour may cover the sheet even though the target is
  // ready; dispatch the interaction on the element under test itself.
  await sheet.locator(`.slot-cell.slot-first[data-item-id="${itemId}"]`).evaluate((cell) => cell.click());
  const popover = world.page.locator('.tno.item-popover');
  await expect(popover).toBeVisible();
  await expect(popover.locator('.item-popover-head')).toContainText('Popover Carbine');
  await expect(popover.locator('.item-popover-badges')).toContainText('Ranged');
  await expect(popover.locator('.item-popover-stats')).toContainText('Shooting 3');

  const summaryParts = '.item-popover-head, .item-popover-badges, .item-popover-stats';
  const expectedSummary = await popover.locator(summaryParts).allInnerTexts();
  await popover.locator('[data-popover-action="post"]').click();
  const chatSummary = world.page.locator('#chat-log .chat-message .item-chat-summary').last();
  await expect(chatSummary).toBeVisible();
  expect(await chatSummary.locator(summaryParts).allInnerTexts()).toEqual(expectedSummary);

  await popover.locator('[data-popover-action="edit"]').click();
  const itemSheetId = await world.page.evaluate(
    ([actorId, embeddedId]) => game.actors.get(actorId).items.get(embeddedId).sheet.id,
    [id, itemId],
  );
  const itemSheet = world.page.locator(`#${itemSheetId}`);
  await expect(itemSheet.locator('.gear-rows')).toBeVisible();
  await expect(popover).toBeHidden();
  expect(world.errors, 'no uncaught page errors while using the item popover').toEqual([]);
});
