/**
 * The FV malus finding its consumer, per
 * `docs/design/workflows/combat-workflow-prd.md`.
 *
 * The rule that separates the two cases is a single sentence — "würfelt er alle
 * Manöver mit einem Malus", and a Standardangriff is not a Manöver — so this
 * spec asserts exactly that difference on one character, one weapon and one
 * dialog: with nothing declared the attack refuses the shortfall, and the first
 * Ansage turns the same roll into a Manöver and brings it in.
 *
 * It also pins the half of the Ansage rule that surprises people: what you pay
 * is not what the opponent takes. Geschickte Angriffe 2 with a 3er Finte costs
 * the attack 4 — "bis zum Limit der Manöverfähigkeit 1 zu 1 …, darüber hinaus
 * 1 zu 2" — while the defender is told 3.
 *
 * Fingerfertigkeit 4 + Schwerter 5 = 9, less 4 for the Finte and 3 for the FV
 * shortfall.
 */
import { test, expect, createCharacter, openSheet } from '../fixtures.mjs';

const MANEUVER = {
  fin: 4,
  swords: 5,
  cunningAttacks: 2,
  fvRank: 9,
  feint: 3,
  standardThreshold: 9,
  maneuverThreshold: 2,
};

test('an Ansage turns an attack into a Manöver and brings the FV malus with it', async ({ world }) => {
  const { page } = world;

  const { id } = await createCharacter(page, {
    abilities: { str: 4, dex: 4, fin: MANEUVER.fin },
    system: {
      skills: {
        swords: { value: MANEUVER.swords, xp: 0 },
        cunningAttacks: { value: MANEUVER.cunningAttacks, xp: 0 },
      },
    },
  });

  const itemId = await page.evaluate(async ([actorId, spec]) => {
    const actor = game.actors.get(actorId);
    const [blade] = await actor.createEmbeddedDocuments('Item', [
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
    ]);
    return blade.id;
  }, [id, MANEUVER]);

  const labels = await page.evaluate(() => ({
    fv: game.i18n.localize('TNO.Combat.FvMalus'),
  }));

  const sheet = await openSheet(page, id);

  await sheet.locator(`.slot-cell.slot-first[data-item-id="${itemId}"]`).evaluate((cell) => cell.click());
  await page.locator('.tno.item-popover [data-popover-action="weapon-check"]').click();
  const dialog = page.locator('#tno-roll-dialog');
  await expect(dialog).toBeVisible();

  // 1. Nothing declared: Handhabung alone in the modifiers, and no FV step —
  //    this is a Standardangriff and a Standardangriff is not a Manöver.
  await expect(dialog.locator('.tno-roll-modifiers .tno-roll-detail:visible')).toHaveCount(1);
  await expect(dialog.locator('.tno-threshold-value')).toHaveText(String(MANEUVER.standardThreshold));

  // 2. Declaring a Finte prices itself against Geschickte Angriffe and pulls the
  //    weapon's FV shortfall onto the same roll.
  const feint = dialog.locator('.tno-ansage-row[data-ansage="feint"]');
  await expect(feint).toBeVisible();
  await feint.locator('.tno-ansage-input').fill(String(MANEUVER.feint));
  await feint.locator('.tno-ansage-input').dispatchEvent('change');

  // Declared above the rank, so the row warns that the exchange has turned 2:1.
  await expect(feint.locator('.tno-ansage-over-rank')).toBeVisible();
  await expect(dialog.locator('.tno-threshold-value')).toHaveText(String(MANEUVER.maneuverThreshold));

  // The reach comparison is still required before the roll may be made.
  const submit = dialog.locator('button[type="submit"]');
  await expect(submit).toBeDisabled();
  await dialog.locator('input[name="contextChoice"][value="0"]').evaluate((input) => input.click());
  await expect(submit).toBeEnabled();

  await submit.click();
  await expect(dialog).toBeHidden();

  const flags = await page.evaluate(() => game.messages.contents.at(-1).flags.tno);
  // The FV step reached the roll as its own component, never folded into another.
  expect(flags.components).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: labels.fv, value: -3 }),
  ]));
  expect(flags.components.reduce((sum, part) => sum + part.value, 0)).toBe(MANEUVER.maneuverThreshold);

  // And what crosses to the defender is the declared Betrag, not the cost.
  expect(flags.ansagen).toEqual([expect.objectContaining({ key: 'feint', betrag: MANEUVER.feint, cost: 4 })]);

  expect(world.errors, 'no uncaught page errors during a Manöver').toEqual([]);
});
