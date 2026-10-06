/**
 * The feature and spell sheet (TnoItemSheet, ApplicationV2): that it opens,
 * writes its fields through, posts to chat from the window menu and deletes
 * its item.
 */
import { test, expect, createCharacter } from '../fixtures.mjs';

async function openItemSheet(page, actorId, itemId) {
  const appId = await page.evaluate(async ([actor, item]) => {
    const owned = game.actors.get(actor).items.get(item);
    await owned.sheet.render(true);
    return owned.sheet.id;
  }, [actorId, itemId]);
  const sheet = page.locator(`#${appId}`);
  await sheet.locator('input[name="name"]').waitFor({ state: 'visible', timeout: 20_000 });
  return sheet;
}

const itemOf = (page, actorId, itemId) => page.evaluate(
  ([actor, item]) => game.actors.get(actor).items.get(item)?.toObject() ?? null,
  [actorId, itemId],
);

test('a spell sheet saves its fields, posts to chat and deletes the spell', async ({ world }) => {
  const { page } = world;
  const { id, items } = await createCharacter(page, {
    items: [{ name: 'E2E Spell', type: 'spell', system: { spellLevel: 1 } }],
  });
  const itemId = items['E2E Spell'];
  const sheet = await openItemSheet(page, id, itemId);

  await sheet.locator('input[name="name"]').fill('E2E Fireball');
  await sheet.locator('input[name="name"]').press('Tab');
  await sheet.locator('input[name="system.spellLevel"]').fill('3');
  await sheet.locator('input[name="system.spellLevel"]').press('Tab');
  await expect.poll(() => itemOf(page, id, itemId)).toMatchObject({
    name: 'E2E Fireball',
    system: { spellLevel: 3 },
  });

  const before = await page.evaluate(() => game.messages.size);
  await sheet.locator('[data-action="toggleControls"]').click();
  // The window menu draws its entries as plain list items, without the action.
  await page.getByRole('navigation').getByRole('listitem').filter({ hasText: /^Show in chat$/ }).click();
  await expect.poll(() => page.evaluate(() => game.messages.size)).toBe(before + 1);

  await sheet.locator('.item-self-delete').click();
  await page.locator('.application.dialog [data-action="yes"]').click();
  await expect(sheet).toBeHidden();
  expect(await itemOf(page, id, itemId)).toBeNull();

  expect(world.errors, 'no uncaught page errors on the item sheet').toEqual([]);
});

test('a feature sheet has no spell level', async ({ world }) => {
  const { page } = world;
  const { id, items } = await createCharacter(page, {
    items: [{ name: 'E2E Feature', type: 'feature', system: {} }],
  });
  const sheet = await openItemSheet(page, id, items['E2E Feature']);
  await expect(sheet.locator('prose-mirror[name="system.description"]')).toHaveCount(1);
  await expect(sheet.locator('input[name="system.spellLevel"]')).toHaveCount(0);
  expect(world.errors, 'no uncaught page errors on the item sheet').toEqual([]);
});
