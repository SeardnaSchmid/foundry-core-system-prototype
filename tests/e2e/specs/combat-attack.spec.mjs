/**
 * The one combat journey the e2e suite pins down, per
 * `docs/design/workflows/combat-workflow-prd.md`.
 *
 * Deliberately *not* a second home for the rules: the malus ladder, which
 * shortfall costs what, and which Strength is compared are arithmetic and live
 * in the unit suite, where a case costs a millisecond instead of a browser.
 * What only a real Foundry can answer is the wiring, and that is all this
 * spec asserts:
 *
 *  1. an authored weapon actually offers its attack, and
 *  2. a mandatory pre-roll context really blocks the roll until it is chosen,
 *  3. the threshold on screen is the sum of the components on screen, and
 *  4. those same components survive into the chat card and the message flags —
 *     the PRD's "live threshold, chat breakdown, and message flags" claim.
 *
 * Strength 2, Swords 5, a weapon asking FV 8 / SV 6 with active Handhabung +1,
 * swung with the reach advantage. SV is 4 short, so two Malusstufen; the FV
 * shortfall deliberately costs nothing, because that malus is a Manöver rule
 * and a standard attack is not a Manöver. Threshold: 2 + 5 + 1 − 6 + 3 = 5.
 */
import { test, expect, createCharacter, lastMessage, localize, openSheet, weapon } from '../fixtures.mjs';

const ATTACK = {
  strength: 2,
  skillRank: 5,
  fvRank: 8,
  sv: 6,
  handling: 1,
  reach: 3,
  threshold: 5,
};

test('a weapon attack carries its requirement maluses from dialog to chat card', async ({ world }) => {
  const { page } = world;

  const { id, items } = await createCharacter(page, {
    abilities: { str: ATTACK.strength, dex: 4, fin: 4 },
    skills: { swords: ATTACK.skillRank },
    items: [weapon({
      name: 'Requirement Blade',
      wa: 'str',
      fv: { skill: 'swords', rank: ATTACK.fvRank },
      sv: ATTACK.sv,
      hh: { active: ATTACK.handling, passive: -1 },
    })],
  });
  const itemId = items['Requirement Blade'];

  // The labels are read out of the running world rather than hard-coded, so
  // the spec asserts the same strings the player sees in whichever language
  // the world runs, and does not quietly pass on a missing translation key.
  const labels = await localize(page, {
    sv: ['TNO.Combat.SvMalus', { steps: 2 }],
    handling: 'TNO.Combat.ActiveHandling',
    reach: 'TNO.Combat.DkDifference',
  });

  const sheet = await openSheet(page, id);

  // 1. An authored, complete weapon profile offers the attack.
  await sheet.locator(`.slot-cell.slot-first[data-item-id="${itemId}"]`).evaluate((cell) => cell.click());
  const popover = page.locator('.tno.item-popover');
  const attack = popover.locator('[data-popover-action="weapon-check"]');
  await expect(attack).toBeVisible();
  await expect(attack).toBeEnabled();

  await attack.click();
  // The window's id carries the appId (`tno-roll-dialog-${appId}`), so it is
  // generated and not a selector. The form's own class is the stable handle.
  const dialog = page.locator('form.tno-roll-dialog');
  await expect(dialog).toBeVisible();

  // 3a. The SV shortfall reaches the dialog as its own line, and the FV
  // shortfall reaches it not at all.
  // `filter` scopes to the row, so the label and its delta are asserted together
  // without building a regex out of a localized string — "SV requirement (2×)"
  // carries parentheses, which a regex would read as a capture group.
  const modifiers = dialog.locator('.tno-roll-gear-modifiers .tno-ledger-row');
  await expect(modifiers.filter({ hasText: labels.sv })).toContainText('−6');
  // `:visible`, because the FV row is in the DOM from the start and only
  // unhides once something is declared — an unfiltered count would see three.
  const visibleModifiers = dialog.locator('.tno-roll-gear-modifiers .tno-ledger-row:visible');
  await expect(visibleModifiers).toHaveCount(2); // Handhabung and the SV malus, nothing else.

  // 2. A melee attack requires the reach comparison: until it is answered there
  // is nothing to roll, and the dialog must say so by refusing to submit. Only
  // the two outcomes the rule can produce are on offer — it grants `+3` to the
  // longer weapon and says nothing about the shorter one.
  const submit = dialog.locator('button[type="submit"]');
  await expect(submit).toBeDisabled();
  await expect(dialog.locator('input[name="contextChoice"]')).toHaveCount(2);

  await dialog.locator(`input[name="contextChoice"][value="${ATTACK.reach}"]`).evaluate((input) => input.click());
  await expect(submit).toBeEnabled();

  // 3b. The number the player decides on is the sum of the parts shown to them.
  await expect(dialog.locator('.tno-threshold-value')).toHaveText(String(ATTACK.threshold));

  await submit.click();
  await expect(dialog).toBeHidden();

  // 4. The card and the flags carry the same breakdown the dialog previewed.
  // `.chat-scroll`, not `#chat-log`: v14 renders the log as `ol.chat-log` and
  // renders it *twice* — once in the sidebar tab and once inside the floating
  // `#chat-notifications` toast. Only the sidebar's sits in a `.chat-scroll`.
  const card = page.locator('.chat-scroll .chat-message').last();
  await expect(card).toBeVisible();
  const breakdown = card.locator('.tno-roll-tooltip .tno-roll-detail');
  await expect(breakdown.filter({ hasText: labels.sv })).toHaveCount(1);
  await expect(breakdown.filter({ hasText: labels.reach })).toHaveCount(1);

  const flags = await lastMessage(page);
  expect(flags.threshold).toBe(ATTACK.threshold);
  // `objectContaining`, because an immutable component also carries the signed
  // string the dialog and the card display it as.
  expect(flags.components).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: labels.handling, value: ATTACK.handling }),
    expect.objectContaining({ label: labels.sv, value: -6 }),
  ]));
  // The components must add up to the threshold that was rolled against, or
  // the card is telling the player a story the dice did not follow.
  expect(flags.components.reduce((sum, part) => sum + part.value, 0)).toBe(ATTACK.threshold);

  expect(world.errors, 'no uncaught page errors during a weapon attack').toEqual([]);
});
