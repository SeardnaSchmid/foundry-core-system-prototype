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
 * announced 7 from a weapon the armour is harder than: 5 + 4 − 7 + 3 = 5.
 */
import { test, expect, createCharacter, openSheet } from '../fixtures.mjs';

const RESIST = {
  strength: 5,
  suitRw: 1,
  helmetRw: 3,
  damage: 7,
  threshold: 5,
};

test('a hit location rolls its resistance against the damage the attacker announced', async ({ world }) => {
  const { page } = world;

  const { id } = await createCharacter(page, {
    abilities: { str: RESIST.strength, dex: 4 },
  });

  await page.evaluate(async ([actorId, spec]) => {
    const actor = game.actors.get(actorId);
    const [suit, helmet] = await actor.createEmbeddedDocuments('Item', [
      {
        name: 'Unterkleidung',
        type: 'item',
        system: {
          roles: { weapon: false, armor: true, consumable: false },
          zone: 'suit',
          slots: 1,
          quantity: 1,
          sv: 0,
          rw: spec.suitRw,
        },
      },
      {
        name: 'Helm',
        type: 'item',
        system: {
          roles: { weapon: false, armor: true, consumable: false },
          zone: 'head',
          slots: 1,
          quantity: 1,
          sv: 0,
          rh: 5,
          rw: spec.helmetRw,
          ra: 6,
        },
      },
    ]);
    await actor.update({ 'system.equipment.suit': suit.id, 'system.equipment.head': helmet.id });
  }, [id, RESIST]);

  const labels = await page.evaluate(() => ({
    rw: game.i18n.format('TNO.Combat.ResistanceRw', { zone: game.i18n.localize('TNO.Armor.Zone.Head') }),
    damage: game.i18n.localize('TNO.Combat.DamageValue'),
  }));

  const sheet = await openSheet(page, id);

  // The silhouette is the primary way in: you click where you were hit. An SVG
  // group has no `click()` of its own, so the event is dispatched by hand.
  await sheet.locator('.paperdoll-figure .zone[data-zone="head"]').evaluate((zone) => {
    zone.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  const dialog = page.locator('#tno-roll-dialog');
  await expect(dialog).toBeVisible();

  // The RW of the location clicked, already summed over the suit and the addon.
  const modifiers = dialog.locator('.tno-roll-gear-modifiers .tno-ledger-row');
  await expect(modifiers.filter({ hasText: labels.rw })).toHaveText(new RegExp(`${labels.rw}\\s*\\+4`));

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

  const flags = await page.evaluate(() => {
    const message = game.messages.contents.at(-1);
    return {
      threshold: message.flags.tno.threshold,
      components: message.flags.tno.components,
      requiredValue: message.flags.tno.requiredValue,
    };
  });
  expect(flags.threshold).toBe(RESIST.threshold);
  expect(flags.requiredValue).toMatchObject({ label: labels.damage, value: -RESIST.damage });
  expect(flags.components.reduce((sum, part) => sum + part.value, 0)).toBe(RESIST.threshold);

  expect(world.errors, 'no uncaught page errors during a resistance roll').toEqual([]);
});
