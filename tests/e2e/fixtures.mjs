/**
 * Shared fixtures for the e2e suite.
 *
 * The suite drives Foundry through `page.evaluate()` rather than by clicking
 * through the UI to set up state. Two reasons:
 *
 *  - `evaluate` runs inside the world with the *real* `game`, `Actor`, `CONFIG`
 *    and system code, and returns the resolved value straight back to Node. So a
 *    spec can assert on real derived data without a mock layer and without an
 *    in-world test-runner module.
 *  - Clicking through dialogs to build an actor is slow and brittle, and it
 *    tests the dialog rather than the thing the spec is actually about. UI
 *    interaction is reserved for the behaviour under test.
 */

import { test as base, expect } from '@playwright/test';

/** Attributes as defined in template.json. */
export const ABILITY_KEYS = [
  'str', 'dex', 'fin', 'per', 'aut', 'cha', 'man', 'emp', 'wil', 'int', 'wis', 'inv',
];

export const test = base.extend({
  /**
   * A page already inside the world, with the world emptied of actors.
   *
   * Each spec starting from a known-empty world is what keeps them independent
   * despite sharing one Foundry instance and running serially.
   */
  world: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/game');
    await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90_000 });

    await page.evaluate(async () => {
      const ids = game.actors.map((a) => a.id);
      if (ids.length) await Actor.deleteDocuments(ids);
    });

    await use({ page, errors });
  },
});

/**
 * Create a character actor and return its id plus its computed derived data.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{name?: string, abilities?: Record<string, number|{base: number, value: number}>, system?: object}} spec
 * @returns {Promise<{id: string, derived: object}>}
 */
export async function createCharacter(page, spec = {}) {
  return page.evaluate(async (spec) => {
    const abilities = {};
    for (const [key, val] of Object.entries(spec.abilities ?? {})) {
      // A bare number sets base and value together (the undamaged case); an
      // object lets a spec drive them apart to exercise damage-related derived
      // values such as canSprint.
      abilities[key] = typeof val === 'number' ? { base: val, value: val, xp: 0 } : { xp: 0, ...val };
    }

    const actor = await Actor.create({
      name: spec.name ?? 'E2E Character',
      type: 'character',
      system: { ...(spec.system ?? {}), abilities },
    });

    return { id: actor.id, derived: foundry.utils.deepClone(actor.system.derived) };
  }, spec);
}

/**
 * Render an actor's sheet and wait for it to be on screen.
 * @returns {Promise<import('@playwright/test').Locator>} the sheet's root element
 */
export async function openSheet(page, actorId) {
  const appId = await page.evaluate(async (id) => {
    const actor = game.actors.get(id);
    await actor.sheet.render(true);
    return actor.sheet.id;
  }, actorId);

  // ApplicationV2 identifies its frame by element id rather than the numeric
  // V1 `data-appid`; the id is a document-derived string, so it is selector-safe.
  const sheet = page.locator(`#${appId}`);
  await sheet.waitFor({ state: 'visible', timeout: 20_000 });
  // The sheet's own render is async beyond the promise above; waiting on a
  // known-present element avoids asserting against a half-populated form.
  await sheet.locator('.attribute-table.heatmap').waitFor({ state: 'visible', timeout: 20_000 });
  return sheet;
}

export { expect };
