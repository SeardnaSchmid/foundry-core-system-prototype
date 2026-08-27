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
import { test, expect, createCharacter, openSheet } from '../fixtures.mjs';

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

  const { id } = await createCharacter(page, {
    abilities: { str: ATTACK.strength, dex: 4, fin: 4 },
    system: { skills: { swords: { value: ATTACK.skillRank, xp: 0 } } },
  });

  const itemId = await page.evaluate(async ([actorId, spec]) => {
    const [item] = await game.actors.get(actorId).createEmbeddedDocuments('Item', [{
      name: 'Requirement Blade',
      type: 'item',
      system: {
        roles: { weapon: true, armor: false, consumable: false },
        use: 'melee',
        wa: 'str',
        slots: 1,
        quantity: 1,
        fv: { skill: 'swords', rank: spec.fvRank },
        sv: spec.sv,
        dk: 0,
        hh: { active: spec.handling, passive: -1 },
      },
    }]);
    return item.id;
  }, [id, ATTACK]);

  // The labels are read out of the running world rather than hard-coded, so
  // the spec asserts the same strings the player sees in whichever language
  // the world runs, and does not quietly pass on a missing translation key.
  const labels = await page.evaluate(() => ({
    sv: game.i18n.format('TNO.Combat.SvMalus', { steps: 2 }),
    handling: game.i18n.localize('TNO.Combat.ActiveHandling'),
    reach: game.i18n.localize('TNO.Combat.DkDifference'),
  }));

  const sheet = await openSheet(page, id);

  // 1. An authored, complete weapon profile offers the attack.
  await sheet.locator(`.slot-cell.slot-first[data-item-id="${itemId}"]`).evaluate((cell) => cell.click());
  const popover = page.locator('.tno.item-popover');
  const attack = popover.locator('[data-popover-action="weapon-check"]');
  await expect(attack).toBeVisible();
  await expect(attack).toBeEnabled();

  await attack.click();
  const dialog = page.locator('#tno-roll-dialog');
  await expect(dialog).toBeVisible();

  // 3a. The SV shortfall reaches the dialog as its own line, and the FV
  // shortfall reaches it not at all.
  const modifiers = dialog.locator('.tno-roll-gear-modifiers .tno-roll-detail');
  await expect(modifiers.filter({ hasText: labels.sv })).toHaveText(new RegExp(`${labels.sv}\\s*−6`));
  await expect(modifiers).toHaveCount(2); // Handhabung and the SV malus, nothing else.

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
  const card = page.locator('#chat-log .chat-message').last();
  await expect(card).toBeVisible();
  const breakdown = card.locator('.tno-roll-tooltip .tno-roll-detail');
  await expect(breakdown.filter({ hasText: labels.sv })).toHaveCount(1);
  await expect(breakdown.filter({ hasText: labels.reach })).toHaveCount(1);

  const flags = await page.evaluate(() => {
    const message = game.messages.contents.at(-1);
    return { threshold: message.flags.tno.threshold, components: message.flags.tno.components };
  });
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
