/**
 * Two small ApplicationV2 windows outside the sheet: the base-dice dialog
 * behind the chat's d20 button, and the heatmap lab in the settings menu.
 */
import { test, expect, createCharacter, lastMessage, openSheet } from '../fixtures.mjs';

test('the chat d20 opens the base-dice dialog, which rolls with the picked advantage', async ({ world }) => {
  const { page } = world;
  const before = await page.evaluate(() => game.messages.size);

  await page.locator('.tno-base-roll-button').click();
  const dialog = page.locator('#tno-base-roll-dialog');
  await expect(dialog).toBeVisible();

  // A second click brings the open dialog back instead of a second one.
  await page.locator('.tno-base-roll-button').click();
  await expect(dialog).toHaveCount(1);

  const effect = dialog.locator('.tno-advantage-effect');
  const opened = await effect.textContent();
  await dialog.locator('.tno-advantage-option[data-value="1"]').click();
  await expect(effect).not.toHaveText(opened);

  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => game.messages.size)).toBe(before + 1);
  expect(await lastMessage(page)).toMatchObject({ threshold: null, advantage: 1, edgeExempt: true });

  expect(world.errors, 'no uncaught page errors in the base-dice dialog').toEqual([]);
});

test('the heatmap lab loads a preset and repaints the open sheet', async ({ world }) => {
  const { page } = world;
  const { id } = await createCharacter(page);
  const sheet = await openSheet(page, id);
  const cell = sheet.locator('.heatmap-cell').first();
  const background = () => cell.evaluate((el) => el.style.background);

  await page.evaluate(async () => {
    const app = new (game.settings.menus.get('tno.heatmapLabMenu').type)();
    await app.render(true);
  });
  const lab = page.locator('#tno-heatmap-lab');
  await expect(lab).toBeVisible();

  const opened = await background();
  await lab.locator('[data-action="loadPreset"][data-preset="viridis"]').click();
  await expect.poll(() => page.evaluate(() => game.settings.get('tno', 'heatmapLow'))).toBe('#440154');
  await expect.poll(background).not.toBe(opened);

  // Dragging a slider repaints the preview only; nothing is saved until release.
  // Not 1: the low end is the low stop whatever the curve does to the way there.
  const swatch = lab.locator('.heatmap-lab-swatch[data-value="3"]');
  const swatchBefore = await swatch.evaluate((el) => el.style.background);
  await lab.locator('input[name="lowCurve"]').evaluate((input) => {
    input.value = input.max;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => swatch.evaluate((el) => el.style.background)).not.toBe(swatchBefore);
  expect(await page.evaluate(() => game.settings.get('tno', 'heatmapLowCurve'))).toBe(1);

  expect(world.errors, 'no uncaught page errors in the heatmap lab').toEqual([]);
});
