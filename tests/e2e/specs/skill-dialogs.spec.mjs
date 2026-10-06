/**
 * The two skill dialogs on the sheet: adding, editing and deleting a custom
 * skill, and advancing a skill. Both are ApplicationV2 forms, so what is under
 * test is the wiring — that the sheet's buttons open them, their actions fire
 * and what they save reaches the actor. The cost table is the unit suite's.
 */
import { test, expect, createCharacter, openSheet } from '../fixtures.mjs';

const skillOf = (page, id, key) => page.evaluate(
  ([id, key]) => foundry.utils.deepClone(game.actors.get(id).system.skills?.[key] ?? null),
  [id, key],
);

test('the + button adds a custom skill, shift-click edits and deletes it', async ({ world }) => {
  const { page } = world;
  const { id } = await createCharacter(page);
  const sheet = await openSheet(page, id);

  // The list opens on "trained": an untrained character shows no group at all,
  // and so no + button, until every skill is listed.
  await sheet.locator('.skill-filter-btn[data-filter="all"]').click();
  await sheet.locator('.skill-create-button[data-category="general"]').click();
  const dialog = page.locator('.application:has(.tno-custom-skill-dialog)');
  await expect(dialog).toBeVisible();

  // A missing name is refused and the dialog stays open.
  await dialog.locator('input[name="name"]').fill('');
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeVisible();

  await dialog.locator('input[name="name"]').fill('Kartenlesen');
  await dialog.locator('select[name="attribute"]').selectOption('int');
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();

  const key = await page.evaluate((id) => Object.entries(game.actors.get(id).system.skills)
    .find(([, s]) => s.custom?.label === 'Kartenlesen')?.[0], id);
  expect(key).toBeTruthy();
  expect(await skillOf(page, id, key)).toMatchObject({
    value: 0,
    xp: 0,
    custom: { label: 'Kartenlesen', category: 'general', attribute: 'int' },
  });

  // Shift-click on the row opens the edit dialog; Löschen asks, then removes.
  await sheet.locator(`.skill-info[data-skill="${key}"]`).click({ modifiers: ['Shift'] });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="name"]')).toHaveValue('Kartenlesen');
  await dialog.locator('[data-action="deleteSkill"]').click();
  await page.locator('.application.dialog [data-action="yes"]').click();
  await expect(dialog).toBeHidden();
  expect(await skillOf(page, id, key)).toBeNull();

  expect(world.errors, 'no uncaught page errors in the custom skill dialog').toEqual([]);
});

test('the advance dialog spends XP, buys a rank and applies a correction', async ({ world }) => {
  const { page } = world;
  const { id } = await createCharacter(page, { skills: { swords: { value: 2, xp: 0 } } });
  const sheet = await openSheet(page, id);

  await sheet.locator('.skill-advance-button[data-skill="swords"]').click();
  const dialog = page.locator('.application:has(.tno-advance-dialog)');
  await expect(dialog).toBeVisible();

  // Guided actions write through at once: +1, then Shift for +5.
  await dialog.locator('[data-action="xpInc"]').click();
  await dialog.locator('[data-action="xpInc"]').click({ modifiers: ['Shift'] });
  await expect.poll(() => skillOf(page, id, 'swords')).toMatchObject({ value: 2, xp: 6 });
  await dialog.locator('[data-action="xpDec"]').click();
  await expect.poll(() => skillOf(page, id, 'swords')).toMatchObject({ value: 2, xp: 5 });

  // Top up to what the next rank costs, then buy it: the cost is consumed.
  const cost = await page.evaluate(async () =>
    (await import(foundry.utils.getRoute('systems/tno/module/helpers/advancement.mjs'))).nextRankXpCost('skill', 2));
  await dialog.locator('input[name="xp"]').fill(String(cost));
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.locator('[data-action="buy"]')).toBeEnabled();
  await dialog.locator('[data-action="buy"]').click();
  await expect.poll(() => skillOf(page, id, 'swords')).toMatchObject({ value: 3, xp: 0 });

  // The correction steppers only move the field; Übernehmen saves it.
  await dialog.locator('[data-action="step"][data-field="rank"][data-delta="1"]').click();
  await expect(dialog.locator('input[name="rank"]')).toHaveValue('4');
  expect(await skillOf(page, id, 'swords')).toMatchObject({ value: 3 });
  await dialog.locator('button.advance-apply').click();
  await expect.poll(() => skillOf(page, id, 'swords')).toMatchObject({ value: 4, xp: 0 });
  await expect(dialog).toBeVisible();

  expect(world.errors, 'no uncaught page errors in the advance dialog').toEqual([]);
});
