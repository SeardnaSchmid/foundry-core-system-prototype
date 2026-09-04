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
import { test, expect, createCharacter, openSheet } from '../fixtures.mjs';

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
    system: {
      skills: { acrobatics: { value: DODGE.acrobatics, xp: 0 } },
      combat: { stance: 'enGarde', defenses: { parry: 0, dodge: 0 } },
    },
  });

  // A single worn piece whose SV outweighs the character's base Strength.
  await page.evaluate(async ([actorId, spec]) => {
    const actor = game.actors.get(actorId);
    const [armor] = await actor.createEmbeddedDocuments('Item', [{
      name: 'Heavy Plate',
      type: 'item',
      system: {
        roles: { weapon: false, armor: true, consumable: false },
        zone: 'torso',
        slots: 2,
        quantity: 1,
        sv: spec.armorSv,
        rh: 4,
        rw: 2,
        ra: 6,
      },
    }]);
    await actor.update({ 'system.equipment.torso': armor.id });
  }, [id, DODGE]);

  const label = await page.evaluate(() => game.i18n.localize('TNO.Combat.ArmorSvMalus'));

  const sheet = await openSheet(page, id);
  await sheet.locator('[data-roll-type="dodge"]').click();

  const dialog = page.locator('#tno-roll-dialog');
  await expect(dialog).toBeVisible();

  // The step is a line of its own, not folded into Akrobatik or the bonus.
  const armorRow = dialog.locator('.tno-roll-gear-modifiers .tno-armor-malus');
  await expect(armorRow).toBeVisible();
  await expect(armorRow).toHaveText(new RegExp(`${label}\\s*−3`));
  await expect(dialog.locator('.tno-threshold-value')).toHaveText(String(DODGE.threshold));

  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();

  const flags = await page.evaluate(() => {
    const message = game.messages.contents.at(-1);
    return { threshold: message.flags.tno.threshold, components: message.flags.tno.components };
  });
  expect(flags.threshold).toBe(DODGE.threshold);
  expect(flags.components).toEqual(expect.arrayContaining([
    expect.objectContaining({ label, value: -3 }),
  ]));
  expect(flags.components.reduce((sum, part) => sum + part.value, 0)).toBe(DODGE.threshold);

  expect(world.errors, 'no uncaught page errors during a dodge').toEqual([]);
});
