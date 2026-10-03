/**
 * The resistance roll of one hit location, per
 * `docs/design/workflows/combat-workflow-prd.md`.
 *
 * Two things only a real Foundry can answer, and this spec asserts nothing
 * else: that clicking a location on the paper doll opens *that* location's
 * roll with the RW the doll shows, and that the two numbers the defender's
 * sheet cannot know — the attacker's RB/RD and their announced damage — really
 * block the roll until the player types them.
 *
 * Stärke 5, an Unterkleidung of RW 1 under a helmet of RW 3, resisting an
 * announced 7 from a weapon the armour is harder than: 5 + 4 − 7 = 2.
 */
import { armor, test, expect, createCharacter, lastMessage, localize, openSheet } from '../fixtures.mjs';

const RESIST = {
  strength: 5,
  suitRw: 1,
  helmetRw: 3,
  // Below the helmet's RH 5: the armour holds, so the Wucht value applies.
  penetration: 2,
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
    damage: 'TNO.Combat.DamageBlunt',
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

  // The RW of the location clicked, already summed over the suit and the addon,
  // listed in the Beleg.
  const rows = dialog.locator('.tno-beleg-row');
  await expect(rows.filter({ hasText: labels.rw })).toContainText('+4');

  // Neither the RB/RD nor the damage is in yet, and until both are there is
  // nothing truthful to roll. The damage stays closed until the comparison is.
  const submit = dialog.locator('button[type="submit"]');
  await expect(submit).toHaveAttribute('aria-disabled', 'true');
  await expect(dialog.locator('input[name="requiredValue"]')).toBeDisabled();

  const penetration = dialog.locator('input[name="compareValue"]');
  await penetration.fill(String(RESIST.penetration));
  await penetration.dispatchEvent('change');
  await expect(dialog.locator('.tno-verdict.is-selected')).toHaveAttribute('data-key', 'harder');
  await expect(submit).toHaveAttribute('aria-disabled', 'true');

  const damage = dialog.locator('input[name="requiredValue"]');
  await damage.fill(String(RESIST.damage));
  await damage.dispatchEvent('change');
  await expect(submit).not.toHaveAttribute('aria-disabled', 'true');

  await expect(dialog.locator('[data-role="threshold"]')).toHaveText(`≤ ${RESIST.threshold}`);

  await submit.click();
  await expect(dialog).toBeHidden();

  const flags = await lastMessage(page);
  expect(flags.threshold).toBe(RESIST.threshold);
  expect(flags.requiredValue).toMatchObject({ label: labels.damage, value: -RESIST.damage });
  expect(flags.components.reduce((sum, part) => sum + part.value, 0)).toBe(RESIST.threshold);

  expect(world.errors, 'no uncaught page errors during a resistance roll').toEqual([]);
});
