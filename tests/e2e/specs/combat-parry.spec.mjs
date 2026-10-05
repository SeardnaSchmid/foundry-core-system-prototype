/**
 * The parry, per `docs/design/workflows/combat-workflow-prd.md`: melee weapon →
 * popover → Parry → reach comparison → Roll.
 *
 * The defence ladder and the Haltung table are pinned in the unit suite. What a
 * browser has to answer is the wiring around them: that the weapon popover
 * offers a parry only in a Haltung that permits one, that the parry rolls on
 * passive Handhabung, and that a parry made is counted, so the next one is
 * priced on the popover and in the dialog.
 *
 * Fingerfertigkeit 4 + Schwerter 5, passive Handhabung −1, even reach: 8. The
 * second parry in the same Haltung costs one step more: 5.
 */
import { test, expect, createCharacter, lastMessage, localize, openSheet, weapon } from '../fixtures.mjs';

const PARRY = {
  fin: 4,
  swords: 5,
  passive: -1,
  first: 8,
  second: 5,
};

const blade = () => weapon({
  name: 'Parry Blade',
  wa: 'fin',
  wf: 'swords',
  dk: 0,
  hh: { active: 1, passive: PARRY.passive },
});

async function openPopover(page, sheet, itemId) {
  await sheet.locator(`.slot-cell.slot-first[data-item-id="${itemId}"]`).evaluate((cell) => cell.click());
  // The sheet mounts several `.item-popover`s; only the item's one is open.
  const popover = page.locator('.tno.item-popover:popover-open');
  await expect(popover).toBeVisible();
  return popover;
}

test('a Haltung without a parry offers none on the weapon', async ({ world }) => {
  const { page } = world;

  // `open` is the default Haltung, and it permits no defence at all.
  const { id, items } = await createCharacter(page, {
    abilities: { fin: PARRY.fin },
    skills: { swords: PARRY.swords },
    stance: 'open',
    items: [blade()],
  });

  const sheet = await openSheet(page, id);
  const popover = await openPopover(page, sheet, items['Parry Blade']);
  await expect(popover.locator('[data-popover-action="weapon-check"]')).toBeVisible();
  await expect(popover.locator('[data-popover-action="weapon-parry"]')).toHaveCount(0);
});

test('a parry rolls on passive handling and prices the next one', async ({ world }) => {
  const { page } = world;

  const { id, items } = await createCharacter(page, {
    abilities: { fin: PARRY.fin },
    skills: { swords: PARRY.swords },
    stance: 'enGarde',
    items: [blade()],
  });
  const itemId = items['Parry Blade'];

  const labels = await localize(page, {
    passive: 'TNO.Combat.PassiveHandling',
    repeated: ['TNO.Combat.RepeatedDefense', { count: 2 }],
  });

  const sheet = await openSheet(page, id);
  const dialog = page.locator('form.tno-roll-dialog');
  const threshold = dialog.locator('[data-role="threshold"]');
  const submit = dialog.locator('button[type="submit"]');

  // 1. The first parry: no repeat malus yet, and the reach must be answered.
  let popover = await openPopover(page, sheet, itemId);
  const parry = popover.locator('[data-popover-action="weapon-parry"]');
  await expect(parry.locator('.defense-malus')).toHaveCount(0);
  await parry.click();
  await expect(dialog).toBeVisible();

  await expect(submit).toHaveAttribute('aria-disabled', 'true');
  await dialog.locator('input[name="contextChoice"][value="0"]').evaluate((input) => input.click());
  await expect(threshold).toHaveText(`≤ ${PARRY.first}`);

  await submit.click();
  await expect(dialog).toBeHidden();

  const first = await lastMessage(page);
  expect(first.threshold).toBe(PARRY.first);
  expect(first.components).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: labels.passive, value: PARRY.passive }),
  ]));

  // 2. The parry was counted: the popover says what the next one costs, and the
  // dialog adds it as its own line.
  await expect.poll(() => page.evaluate(
    (id) => game.actors.get(id).system.combat.defenses.parry, id
  )).toBe(1);

  popover = await openPopover(page, sheet, itemId);
  await expect(popover.locator('[data-popover-action="weapon-parry"] .defense-malus')).toHaveText('-3');
  await popover.locator('[data-popover-action="weapon-parry"]').click();
  await expect(dialog).toBeVisible();

  await dialog.locator('input[name="contextChoice"][value="0"]').evaluate((input) => input.click());
  await expect(threshold).toHaveText(`≤ ${PARRY.second}`);
  await submit.click();
  await expect(dialog).toBeHidden();

  const second = await lastMessage(page);
  expect(second.components).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: labels.repeated, value: -3 }),
  ]));
  expect(second.threshold).toBe(PARRY.second);

  expect(world.errors, 'no uncaught page errors during a parry').toEqual([]);
});
