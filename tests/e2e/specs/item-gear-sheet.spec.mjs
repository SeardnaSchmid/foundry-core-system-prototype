import { test, expect, createCharacter, weapon } from '../fixtures.mjs';

/** The example carbine, authored in full: this spec is about the editor's rows. */
const CARBINE = weapon({
  name: 'E2E Carbine',
  use: 'ranged',
  slots: 2,
  price: 40,
  availability: 2,
  sv: 5,
  fv: { skill: 'shooting', rank: 3 },
  dk: 2,
  range: { sn: null, near: -3, mid: 0, far: 3, sf: 0 },
  rd: 5,
  ss: { count: 4, die: 'd6' },
  ws: { count: 2, die: 'd6' },
  hh: { active: 1, passive: 0 },
  rb: 1,
  description: '<p>Compact service weapon.</p>',
});

/** Open the gear sheet of an item the actor already owns. */
async function openGearSheet(page, actorId, itemId) {
  const appId = await page.evaluate(async ([actor, item]) => {
    const owned = game.actors.get(actor).items.get(item);
    await owned.sheet.render(true);
    return owned.sheet.id;
  }, [actorId, itemId]);

  const sheet = page.locator(`#${appId}`);
  await sheet.waitFor({ state: 'visible', timeout: 20_000 });
  await sheet.locator('.gear-rows').waitFor({ state: 'visible', timeout: 20_000 });
  return sheet;
}

test('gear sheet opens directly as a bounded editor', async ({ world }) => {
  const { id, items } = await createCharacter(world.page, {
    abilities: { str: 3, dex: 6 },
    items: [CARBINE],
  });
  const sheet = await openGearSheet(world.page, id, items['E2E Carbine']);

  await expect(sheet.locator('.gear-overview, .gear-modes')).toHaveCount(0);
  await expect(sheet.locator('.effect-control')).toHaveCount(0);
  await expect(sheet.locator('[data-tab="effects"]')).toHaveCount(0);
  await expect(sheet.locator('.gear-rows')).toBeVisible();
  await expect(sheet.locator('input[name="system.quantity"]')).toHaveAttribute('min', '0');
  await expect(sheet.locator('input[name="system.hh.active"]')).toHaveAttribute('max', '3');
  await expect(sheet.locator('.role-chip').first()).toHaveJSProperty('tagName', 'BUTTON');
  await expect(sheet.locator('.range-cycle .range-visual')).toHaveCount(5);
  await expect(sheet.locator('.gear-section-divider').filter({ hasText: /^Weapon Values$/ })).toBeVisible();
  await expect(sheet.locator('.effect-control')).toHaveCount(0);

  // Switching role re-renders the armour partial; this pins the template parse
  // regression that previously made the whole item window disappear.
  await sheet.getByRole('radio', { name: 'Armour' }).evaluate((button) => button.click());
  await expect(sheet.locator('.zone-chip')).toHaveCount(5);
  await expect(sheet.locator('.gear-section-divider')).toContainText('Armour Values');
});
