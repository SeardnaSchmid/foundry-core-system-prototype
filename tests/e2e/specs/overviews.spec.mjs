/**
 * The two GM overviews from the settings menu (ApplicationV2): that they list
 * what lives on the actors, and that their controls fire.
 */
import { test, expect, createCharacter, gear } from '../fixtures.mjs';

/** Open a settings-menu app the way the settings window does. */
const openMenu = (page, key) => page.evaluate(async (key) => {
  const app = new (game.settings.menus.get(key).type)();
  await app.render(true);
  return app.id;
}, key);

const layout = (page) => page.evaluate(() => foundry.utils.deepClone(game.settings.get('tno', 'itemOverviewLayout')));

test('the custom skills overview lists a custom skill and opens its actor', async ({ world }) => {
  const { page } = world;
  await createCharacter(page, {
    name: 'E2E Holder',
    system: { skills: { mapreading: { value: 2, xp: 1, custom: { label: 'Kartenlesen', category: 'general', attribute: 'int' } } } },
  });

  const app = page.locator(`#${await openMenu(page, 'tno.customSkillsOverviewMenu')}`);
  const row = app.locator('tr', { hasText: 'Kartenlesen' });
  await expect(row).toContainText('E2E Holder');

  await app.locator('[data-action="refresh"]').click();
  await expect(row).toBeVisible();
  await row.locator('[data-action="openActor"]').click();
  await expect(page.locator('.tno.sheet.actor')).toBeVisible();

  expect(world.errors, 'no uncaught page errors in the skills overview').toEqual([]);
});

test('the item overview lists held items, sorts, filters and picks columns', async ({ world }) => {
  const { page } = world;
  await page.evaluate(() => game.settings.set('tno', 'itemOverviewLayout', {
    columns: ['slots', 'quantity', 'sv', 'price'],
    sort: { key: 'name', dir: 'asc' },
  }));
  await createCharacter(page, { name: 'E2E Holder', items: [gear({ name: 'E2E Rope' })] });

  const app = page.locator(`#${await openMenu(page, 'tno.itemOverviewMenu')}`);
  const row = app.locator('.item-row', { hasText: 'E2E Rope' });
  await expect(row).toContainText('E2E Holder');

  await app.locator('[data-action="sort"][data-sort-key="name"]').click();
  await expect.poll(async () => (await layout(page)).sort).toEqual({ key: 'name', dir: 'desc' });

  // A hand-made item is not from the catalogue, so the filter keeps it.
  await app.locator('[data-action="toggleFilter"]').click();
  await expect(app.locator('[data-action="toggleFilter"]')).toHaveAttribute('aria-checked', 'true');
  await expect(row).toBeVisible();

  await app.locator('[data-action="toggleColumns"]').click();
  await app.locator('.item-column-option input[data-column="price"]').uncheck();
  await expect.poll(async () => (await layout(page)).columns).not.toContain('price');

  await row.locator('[data-action="openItem"]').click();
  await expect(page.locator('.tno.sheet.gear-dialog')).toBeVisible();

  expect(world.errors, 'no uncaught page errors in the item overview').toEqual([]);
});
