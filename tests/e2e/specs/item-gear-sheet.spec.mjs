import { test, expect, createCharacter } from '../fixtures.mjs';

async function createWeaponAndOpen(page, actorId) {
  const result = await page.evaluate(async (id) => {
    const actor = game.actors.get(id);
    const [item] = await actor.createEmbeddedDocuments('Item', [{
      name: 'E2E Carbine',
      type: 'item',
      system: {
        roles: { weapon: true, armor: false, consumable: false },
        use: 'ranged',
        slots: 2,
        quantity: 1,
        price: 40,
        availability: 2,
        sv: 5,
        fv: { skill: 'shooting', rank: 3 },
        dk: 2,
        range: { sn: null, near: -3, mid: 0, far: 3, sf: 0 },
        ammo: { count: 4, type: 'cells' },
        rd: 5,
        ss: { count: 4, die: 'd6' },
        ws: { count: 2, die: 'd6' },
        hh: { active: 1, passive: 0 },
        rb: 1,
        description: '<p>Compact service weapon.</p>',
      },
    }]);
    await item.sheet.render(true);
    return { itemId: item.id, appId: item.sheet.id };
  }, actorId);

  const sheet = page.locator(`#${result.appId}`);
  await sheet.waitFor({ state: 'visible', timeout: 20_000 });
  await sheet.locator('.gear-overview').waitFor({ state: 'visible', timeout: 20_000 });
  return { ...result, sheet };
}

test('gear sheet switches between a contextual overview and bounded editor', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: { str: 3, dex: 6 } });
  const { sheet } = await createWeaponAndOpen(world.page, id);

  await expect(sheet.locator('.range-profile')).toBeVisible();
  await expect(sheet.locator('.penetration-segment.equal')).toHaveText('RH 5');
  await expect(sheet.locator('.slot-profile')).toContainText('2 of 12');
  await expect(sheet.locator('.strength-profile')).toHaveClass(/unmet/);
  await expect(sheet.locator('.overview-actions .item-self-delete')).toBeVisible();
  await expect(sheet.locator('.effect-control')).toHaveCount(0);
  await expect(sheet.locator('[data-tab="effects"]')).toHaveCount(0);

  // Foundry's permanent headless-browser warnings and first-world tour can
  // cover application chrome even though the control itself is actionable.
  await sheet.locator('.gear-mode[data-view="edit"]').evaluate((button) => button.click());
  await expect(sheet.locator('.gear-rows')).toBeVisible();
  await expect(sheet.locator('input[name="system.quantity"]')).toHaveAttribute('min', '0');
  await expect(sheet.locator('input[name="system.hh.active"]')).toHaveAttribute('max', '3');
  await expect(sheet.locator('.role-chip').first()).toHaveJSProperty('tagName', 'BUTTON');
  await expect(sheet.locator('.range-cycle .range-visual')).toHaveCount(5);
  await expect(sheet.locator('.gear-section-divider')).toContainText('Weapon Values');
  await expect(sheet.locator('.effect-control')).toHaveCount(0);

  // Switching role re-renders the armour partial; this pins the template parse
  // regression that previously made the whole item window disappear.
  await sheet.getByRole('radio', { name: 'Armour' }).evaluate((button) => button.click());
  await expect(sheet.locator('.zone-chip')).toHaveCount(5);
  await expect(sheet.locator('.gear-section-divider')).toContainText('Armour Values');
});

test('overview actions adjust ammunition and open the normal weapon check', async ({ world }) => {
  const { id } = await createCharacter(world.page, { abilities: { str: 5, dex: 5 } });
  const { itemId, sheet } = await createWeaponAndOpen(world.page, id);

  await sheet.locator('[data-field="system.ammo.count"][data-by="1"]').click();
  await expect.poll(() => world.page.evaluate(
    ([actorId, embeddedId]) => game.actors.get(actorId).items.get(embeddedId).system.ammo.count,
    [id, itemId],
  )).toBe(5);

  await sheet.locator('.item-weapon-check').click();
  await expect(world.page.locator('#tno-roll-dialog')).toBeVisible();
  await expect(world.page.locator('#tno-roll-dialog')).toContainText('E2E Carbine');
  expect(world.errors, 'no uncaught page errors while using the item overview').toEqual([]);
});
