/**
 * The Ansage on a weapon attack, per
 * `docs/design/workflows/combat-workflow-prd.md`: a free magnitude, taken at
 * face value. The rulebook's 1:1-to-the-rank / 2:1-past-it conversion is arithmetic
 * the player and the GM do out loud before typing, so a declared 3 costs the
 * roll 3 and reaches the defender as 3 — no Manöverfertigkeit is consulted, and
 * no rank appears anywhere in this path.
 *
 * Fingerfertigkeit 4 + Schwerter 5 = 9, less 3 for the Ansage.
 */
import { test, expect, createCharacter, lastMessage, openSheet, weapon } from '../fixtures.mjs';

const MANEUVER = {
  fin: 4,
  swords: 5,
  ansage: 3,
  standardThreshold: 9,
  maneuverThreshold: 6,
};

test('an Ansage costs a weapon attack exactly its amount', async ({ world }) => {
  const { page } = world;

  const { id, items } = await createCharacter(page, {
    abilities: { str: 4, dex: 4, fin: MANEUVER.fin },
    skills: { swords: MANEUVER.swords },
    items: [weapon({
      name: 'Demanding Blade',
      wa: 'fin',
      // Asks for no Strength at all: the SV must stay out of what this spec
      // is about.
      wf: 'swords',
      rb: 3,
      ss: { count: 2 },
    })],
  });
  const itemId = items['Demanding Blade'];

  const sheet = await openSheet(page, id);

  await sheet.locator(`.slot-cell.slot-first[data-item-id="${itemId}"]`).evaluate((cell) => cell.click());
  await page.locator('.tno.item-popover [data-popover-action="weapon-check"]').click();
  // The window's id carries the appId (`tno-roll-dialog-${appId}`), so it is
  // generated and not a selector. The form's own class is the stable handle.
  const dialog = page.locator('form.tno-roll-dialog');
  await expect(dialog).toBeVisible();

  // 1. Nothing declared.
  const threshold = dialog.locator('[data-role="threshold"]');
  await expect(threshold).toHaveText(`(≤ ${MANEUVER.standardThreshold})`);

  // 2. Declaring an amount costs exactly that amount.
  const ansage = dialog.locator('input[name="ansage"]');
  await expect(ansage).toBeVisible();
  await ansage.fill(String(MANEUVER.ansage));
  await ansage.dispatchEvent('change');
  await expect(dialog.locator('[data-role="ansage-delta"]')).toHaveText('−3');
  await expect(threshold).toHaveText(`(≤ ${MANEUVER.maneuverThreshold})`);

  // The reach comparison is still required before the roll may be made.
  const submit = dialog.locator('button[type="submit"]');
  await expect(submit).toHaveAttribute('aria-disabled', 'true');
  await dialog.locator('input[name="contextChoice"][value="0"]').evaluate((input) => input.click());
  await expect(submit).not.toHaveAttribute('aria-disabled', 'true');
  await expect(threshold).toHaveText(`≤ ${MANEUVER.maneuverThreshold}`);

  await submit.click();
  await expect(dialog).toBeHidden();

  const flags = await lastMessage(page);
  expect(flags.components.reduce((sum, part) => sum + part.value, 0)).toBe(MANEUVER.maneuverThreshold);

  // What crosses to the defender is only the amount at face value.
  expect(flags.envelope).toEqual({ ansage: MANEUVER.ansage });

  expect(world.errors, 'no uncaught page errors during an Ansage').toEqual([]);
});
