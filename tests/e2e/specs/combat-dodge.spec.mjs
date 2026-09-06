/**
 * The armour Stärkevorraussetzung landing on a real roll, per
 * `docs/design/workflows/combat-workflow-prd.md`.
 *
 * The arithmetic — that a shortfall costs one flat step however far short it
 * is, and that the summed SV is summed over every worn piece — lives in the
 * unit suite. What only a real Foundry can answer is whether the step actually
 * reaches a threshold the player rolls against, and Dodge is where the rule and
 * the sheet meet: Beweglichkeit 4 + Akrobatik 3 − 3 = 4.
 *
 * The character is put En Garde first, because a Haltung is what permits a
 * defence at all and the default 'Offen' permits none — "einfach in der Gegend
 * rumstehen wie ein Trottel".
 */
import { armor, test, expect, createCharacter, lastMessage, localize, openSheet } from '../fixtures.mjs';

const DODGE = {
  dex: 4,
  acrobatics: 3,
  strength: 1,
  armorSv: 2,
  threshold: 4,
};

test('a dodge is Beweglichkeit plus Akrobatik, less the armour step', async ({ world }) => {
  const { page } = world;

  const { id } = await createCharacter(page, {
    abilities: { str: DODGE.strength, dex: DODGE.dex },
    skills: { acrobatics: DODGE.acrobatics },
    stance: 'enGarde',
    // A single worn piece whose SV outweighs the character's base Strength.
    items: [armor({
      name: 'Heavy Plate', zone: 'torso', equipped: true,
      slots: 2, sv: DODGE.armorSv, rh: 4, rw: 2, ra: 6,
    })],
  });

  const { label } = await localize(page, { label: 'TNO.Combat.ArmorSvMalus' });

  const sheet = await openSheet(page, id);
  await sheet.locator('[data-roll-type="dodge"]').click();

  // The window's id carries the appId (`tno-roll-dialog-${appId}`), so it is
  // generated and not a selector. The form's own class is the stable handle.
  const dialog = page.locator('form.tno-roll-dialog');
  await expect(dialog).toBeVisible();

  // The step is a line of its own, not folded into Akrobatik or the bonus.
  const armorRow = dialog.locator('.tno-roll-gear-modifiers .tno-armor-malus');
  await expect(armorRow).toBeVisible();
  await expect(armorRow).toContainText(label);
  await expect(armorRow).toContainText('−3');
  await expect(dialog.locator('.tno-threshold-value')).toHaveText(String(DODGE.threshold));

  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();

  const flags = await lastMessage(page);
  expect(flags.threshold).toBe(DODGE.threshold);
  expect(flags.components).toEqual(expect.arrayContaining([
    expect.objectContaining({ label, value: -3 }),
  ]));
  expect(flags.components.reduce((sum, part) => sum + part.value, 0)).toBe(DODGE.threshold);

  expect(world.errors, 'no uncaught page errors during a dodge').toEqual([]);
});
