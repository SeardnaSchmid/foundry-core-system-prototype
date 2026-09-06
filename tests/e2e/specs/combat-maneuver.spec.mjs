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
 * Two things declare, and the spec walks both: naming a Stelle other than the
 * Torso, which Gezielte Angriffe prices itself, and typing a free amount.
 *
 * It also pins what the Ansage field is now: a free magnitude, taken at face
 * value. The rulebook's 1:1-to-the-rank / 2:1-past-it conversion is arithmetic
 * the player and the GM do out loud before typing, so a declared 3 costs the
 * roll 3 and reaches the defender as 3 — no Manöverfertigkeit is consulted, and
 * no rank appears anywhere in this path.
 *
 * Fingerfertigkeit 4 + Schwerter 5 = 9, less 3 for the Ansage and 3 for the FV
 * shortfall; or less 6 for a head shot and the same 3.
 */
import { test, expect, createCharacter, lastMessage, localize, openSheet, weapon } from '../fixtures.mjs';

const MANEUVER = {
  fin: 4,
  swords: 5,
  fvRank: 9,
  ansage: 3,
  standardThreshold: 9,
  // 9, less 6 for the Kopf and 3 for the FV shortfall the aim brought with it.
  aimedThreshold: 0,
  maneuverThreshold: 3,
};

test('an Ansage turns an attack into a Manöver and brings the FV malus with it', async ({ world }) => {
  const { page } = world;

  const { id, items } = await createCharacter(page, {
    abilities: { str: 4, dex: 4, fin: MANEUVER.fin },
    skills: { swords: MANEUVER.swords },
    items: [weapon({
      name: 'Demanding Blade',
      wa: 'fin',
      // Asks for a rank the character does not have, and for no Strength at
      // all: the SV must stay out of what this spec is about.
      fv: { skill: 'swords', rank: MANEUVER.fvRank },
      rb: 3,
      ss: { count: 2 },
    })],
  });
  const itemId = items['Demanding Blade'];


  const labels = await localize(page, { fv: 'TNO.Combat.FvMalus' });

  const sheet = await openSheet(page, id);

  await sheet.locator(`.slot-cell.slot-first[data-item-id="${itemId}"]`).evaluate((cell) => cell.click());
  await page.locator('.tno.item-popover [data-popover-action="weapon-check"]').click();
  // The window's id carries the appId (`tno-roll-dialog-${appId}`), so it is
  // generated and not a selector. The form's own class is the stable handle.
  const dialog = page.locator('form.tno-roll-dialog');
  await expect(dialog).toBeVisible();

  // 1. Nothing declared: Handhabung alone among the gear rows, and no FV step —
  //    this is a Standardangriff and a Standardangriff is not a Manöver. The
  //    Stelle line reads ±0, the Torso being where an unannounced blow lands.
  await expect(dialog.locator('.tno-roll-gear-modifiers .tno-ledger-row:visible')).toHaveCount(1);
  await expect(dialog.locator('.tno-threshold-value')).toHaveText(String(MANEUVER.standardThreshold));
  await expect(dialog.locator('.tno-maneuver-malus')).toBeHidden();
  await expect(dialog.locator('.tno-ledger-delta[data-role="zone-delta"]')).toHaveText('±0');

  // 2. Naming a Stelle other than the Torso *is* a declaration — "Ansagen auf
  //    Trefferzonen im Nahkampf, normale Ansageregeln gelten hier auf alles" —
  //    so the head costs its own −6 and pulls the FV shortfall in with it.
  await dialog.locator('input[name="zoneChoice"][value="head"]').evaluate((input) => input.click());
  await expect(dialog.locator('.tno-threshold-value')).toHaveText(String(MANEUVER.aimedThreshold));
  await expect(dialog.locator('.tno-ledger-delta[data-role="zone-delta"]')).toHaveText('−6');
  await expect(dialog.locator('.tno-maneuver-malus')).toBeVisible();

  // Back to the Torso: the standard attack is where an unannounced blow lands,
  // so it costs nothing and takes the FV step back off again.
  await dialog.locator('input[name="zoneChoice"][value="torso"]').evaluate((input) => input.click());
  await expect(dialog.locator('.tno-threshold-value')).toHaveText(String(MANEUVER.standardThreshold));
  await expect(dialog.locator('.tno-maneuver-malus')).toBeHidden();

  // 3. Declaring an amount does the same thing by the other route, and the two
  //    stay separate components rather than one summed figure.
  const ansage = dialog.locator('input[name="ansage"]');
  await expect(ansage).toBeVisible();
  await ansage.fill(String(MANEUVER.ansage));
  await ansage.dispatchEvent('change');
  await expect(dialog.locator('.tno-ledger-delta[data-role="ansage-delta"]')).toHaveText('−3');
  await expect(dialog.locator('.tno-threshold-value')).toHaveText(String(MANEUVER.maneuverThreshold));

  // The reach comparison is still required before the roll may be made.
  const submit = dialog.locator('button[type="submit"]');
  await expect(submit).toBeDisabled();
  await dialog.locator('input[name="contextChoice"][value="0"]').evaluate((input) => input.click());
  await expect(submit).toBeEnabled();

  await submit.click();
  await expect(dialog).toBeHidden();

  const flags = await lastMessage(page);
  // The FV step reached the roll as its own component, never folded into another.
  expect(flags.components).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: labels.fv, value: -3 }),
  ]));
  expect(flags.components.reduce((sum, part) => sum + part.value, 0)).toBe(MANEUVER.maneuverThreshold);

  // What crosses to the defender: the amount at face value and the Stelle, with
  // nothing said about which of their rolls it lands on.
  expect(flags.envelope).toMatchObject({ ansage: MANEUVER.ansage, zone: 'head' });

  expect(world.errors, 'no uncaught page errors during a Manöver').toEqual([]);
});
