/**
 * The resistance roll of one hit location, per
 * `docs/design/workflows/combat-workflow-prd.md`.
 *
 * Two things only a real Foundry can answer, and this spec asserts nothing
 * else: that clicking a location on the paper doll opens *that* location's
 * roll with the RW the doll shows, and that the two facts the defender's sheet
 * cannot know — the announced Schadenswert and the RH-versus-RB/RD comparison —
 * really block the roll until the player states them.
 *
 * Stärke 5, an Unterkleidung of RW 1 under a helmet of RW 3, resisting an
 * announced 7 from a weapon the armour is harder than: 5 + 4 − 7 = 2.
 */
import { armor, test, expect, createCharacter, lastMessage, localize, openSheet } from '../fixtures.mjs';

const RESIST = {
  strength: 5,
  suitRw: 1,
  helmetRw: 3,
  damage: 7,
  threshold: 2,
};

test('a hit location rolls its resistance against the damage the attacker announced', async ({ world }) => {
  const { page } = world;

  const { id } = await createCharacter(page, {
    abilities: { str: RESIST.strength, dex: 4 },
    // An Unterkleidung under a helmet: the RW of a location is summed over the
    // all-covering suit and the addon worn on top of it.
    items: [
      armor({ name: 'Unterkleidung', zone: 'suit', equipped: true, rw: RESIST.suitRw }),
      armor({ name: 'Helm', zone: 'head', equipped: true, rh: 5, rw: RESIST.helmetRw, ra: 6 }),
    ],
  });

  const { head } = await localize(page, { head: 'TNO.Armor.Zone.Head' });
  const labels = await localize(page, {
    rw: ['TNO.Combat.ResistanceRw', { zone: head }],
    damage: 'TNO.Combat.DamageValue',
  });

  const sheet = await openSheet(page, id);

  // The silhouette is the primary way in: you click where you were hit. An SVG
  // group has no `click()` of its own, so the event is dispatched by hand.
  await sheet.locator('.paperdoll-figure .zone[data-zone="head"]').evaluate((zone) => {
    zone.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  // The window's id carries the appId (`tno-roll-dialog-${appId}`), so it is
  // generated and not a selector. The form's own class is the stable handle.
  const dialog = page.locator('form.tno-roll-dialog');
  await expect(dialog).toBeVisible();

  // The RW of the location clicked, already summed over the suit and the addon.
  const modifiers = dialog.locator('.tno-roll-gear-modifiers .tno-ledger-row');
  await expect(modifiers.filter({ hasText: labels.rw })).toContainText('+4');

  // Neither the announced damage nor the comparison is answered yet, and until
  // both are there is nothing truthful to roll.
  const submit = dialog.locator('button[type="submit"]');
  await expect(submit).toBeDisabled();
  await expect(dialog.locator('input[name="contextChoice"]')).toHaveCount(3);

  await dialog.locator('input[name="requiredValue"]').fill(String(RESIST.damage));
  await expect(submit).toBeDisabled();
  await dialog.locator('input[name="contextChoice"][value="harder"]').evaluate((input) => input.click());
  await expect(submit).toBeEnabled();

  await expect(dialog.locator('.tno-threshold-value')).toHaveText(String(RESIST.threshold));

  await submit.click();
  await expect(dialog).toBeHidden();

  const flags = await lastMessage(page);
  expect(flags.threshold).toBe(RESIST.threshold);
  expect(flags.requiredValue).toMatchObject({ label: labels.damage, value: -RESIST.damage });
  expect(flags.components.reduce((sum, part) => sum + part.value, 0)).toBe(RESIST.threshold);

  expect(world.errors, 'no uncaught page errors during a resistance roll').toEqual([]);
});
