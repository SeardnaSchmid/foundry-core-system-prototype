/**
 * The FV malus finding its consumer, per `docs/design/combat-workflow-prd.md`.
 *
 * The rule that separates the two workflows is a single sentence — "würfelt er
 * alle Manöver mit einem Malus", and a Standardangriff is not a Manöver — so
 * this spec asserts exactly that difference on one character with one weapon:
 * the attack refuses the shortfall, the Manöver takes it.
 *
 * Beinarbeit is a dex-attributed Manöver, and the character is also over their
 * armour's Stärkevorraussetzung, so the roll is where the two independent
 * requirements meet: Beweglichkeit 4 + Beinarbeit 2 − 3 (armour) − 3 (FV) = 0.
 */
import { test, expect, createCharacter, openSheet } from '../fixtures.mjs';

const MANEUVER = {
  dex: 4,
  strength: 1,
  swords: 5,
  footwork: 2,
  fvRank: 9,
  armorSv: 2,
  threshold: 0,
};

test('a Manöver takes the weapon FV malus a standard attack refuses', async ({ world }) => {
  const { page } = world;

  const { id } = await createCharacter(page, {
    abilities: { str: MANEUVER.strength, dex: MANEUVER.dex, fin: 4 },
    system: {
      skills: {
        swords: { value: MANEUVER.swords, xp: 0 },
        footwork: { value: MANEUVER.footwork, xp: 0 },
      },
    },
  });

  const itemId = await page.evaluate(async ([actorId, spec]) => {
    const actor = game.actors.get(actorId);
    const [blade, armor] = await actor.createEmbeddedDocuments('Item', [
      {
        name: 'Demanding Blade',
        type: 'item',
        system: {
          roles: { weapon: true, armor: false, consumable: false },
          use: 'melee',
          wa: 'fin',
          slots: 1,
          quantity: 1,
          // Asks for a rank the character does not have, and for no Strength at
          // all: the SV must stay out of what this spec is about.
          fv: { skill: 'swords', rank: spec.fvRank },
          sv: 0,
          dk: 0,
          rb: 3,
          ss: { count: 2 },
          hh: { active: 0, passive: 0 },
        },
      },
      {
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
      },
    ]);
    await actor.update({ 'system.equipment.torso': armor.id });
    return blade.id;
  }, [id, MANEUVER]);

  const labels = await page.evaluate(() => ({
    armor: game.i18n.localize('TNO.Combat.ArmorSvMalus'),
    fv: game.i18n.format('TNO.Combat.FvMalusFor', { weapon: 'Demanding Blade' }),
  }));

  const sheet = await openSheet(page, id);

  // 1. The standard attack refuses the shortfall: it is a Manöver rule, and an
  //    attack is not a Manöver.
  await sheet.locator(`.slot-cell.slot-first[data-item-id="${itemId}"]`).evaluate((cell) => cell.click());
  await page.locator('.tno.item-popover [data-popover-action="weapon-check"]').click();
  const attackDialog = page.locator('#tno-roll-dialog');
  await expect(attackDialog).toBeVisible();
  // Handhabung alone. The armour step is absent because the blade rolls from
  // Fingerfertigkeit, and the FV shortfall because an attack is not a Manöver:
  // Fingerfertigkeit 4 + Schwerter 5, nothing taken off.
  await expect(attackDialog.locator('.tno-roll-modifiers .tno-roll-detail:visible')).toHaveCount(1);
  await expect(attackDialog.locator('.tno-threshold-value')).toHaveText('9');
  await page.keyboard.press('Escape');
  await expect(attackDialog).toBeHidden();

  // 2. The Manöver asks which weapon it is declared with, and that answer is
  //    what finally brings the shortfall onto a threshold.
  await sheet.locator('.skill-info.rollable[data-skill="footwork"]').click();
  const dialog = page.locator('#tno-roll-dialog');
  await expect(dialog).toBeVisible();

  const submit = dialog.locator('button[type="submit"]');
  await expect(submit).toBeDisabled();

  // The armour step is already there — Beinarbeit is Beweglichkeit — while the
  // weapon's own step waits on the declaration.
  const armorRow = dialog.locator('.tno-roll-modifiers .tno-armor-malus');
  await expect(armorRow).toBeVisible();
  await expect(armorRow).toHaveText(new RegExp(`${labels.armor}\\s*−3`));

  await dialog.locator('select[name="contextChoice"]').selectOption({ label: 'Demanding Blade (−3)' });
  await expect(submit).toBeEnabled();
  await expect(dialog.locator('.tno-threshold-value')).toHaveText(String(MANEUVER.threshold));

  await submit.click();
  await expect(dialog).toBeHidden();

  // Two independent requirements, two labels, two components — never one.
  const components = await page.evaluate(() => game.messages.contents.at(-1).flags.tno.components);
  expect(components).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: labels.armor, value: -3 }),
    expect.objectContaining({ label: labels.fv, value: -3 }),
  ]));
  expect(components.reduce((sum, part) => sum + part.value, 0)).toBe(MANEUVER.threshold);

  expect(world.errors, 'no uncaught page errors during a Manöver').toEqual([]);
});
