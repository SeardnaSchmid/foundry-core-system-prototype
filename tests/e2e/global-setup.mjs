/**
 * Playwright global setup: bring up a disposable Foundry and log in as the GM.
 *
 * The resulting session cookie is saved to `storageState`, so individual specs
 * start already inside the world instead of each paying the join cost.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { BASE_URL, HOST_DATA, provision, start, status, logs } from './foundry-container.mjs';

export const STORAGE_STATE = path.join(HOST_DATA, 'storage-state.json');

export default async function globalSetup() {
  // Reuse an already-running instance during iterative local work: `docker run`
  // plus world launch is ~40s, which is a long time to pay on every re-run.
  const existing = await status();
  if (existing?.active) {
    console.log(`[e2e] reusing running Foundry at ${BASE_URL}`);
  } else {
    console.log('[e2e] provisioning disposable Foundry world…');
    provision();
    await start();
    console.log(`[e2e] Foundry ready at ${BASE_URL}`);
  }

  // `/api/status` flips to active a moment before the server is really ready to
  // accept a join, so a cold start can fail on the first attempt. Retrying is
  // far more reliable than trying to guess a long-enough sleep.
  for (let attempt = 1; ; attempt++) {
    try {
      await joinAsGamemaster();
      return;
    } catch (err) {
      if (attempt >= 3) throw err;
      console.warn(`[e2e] join attempt ${attempt} failed (${err.message.split('\n')[0]}); retrying…`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/**
 * Join the world as the Gamemaster Foundry auto-created for the fresh world.
 *
 * The user has no password, so this is a select-and-submit — but the join form
 * is rendered client-side after a websocket round-trip, hence the waits.
 */
async function joinAsGamemaster() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' });

    const userSelect = page.locator('select[name="userid"]');
    await userSelect.waitFor({ state: 'visible', timeout: 30_000 });

    // Pick the Gamemaster explicitly rather than "first option": the first entry
    // is a placeholder, and a spec that silently ran as a player would fail in
    // confusing ways much later.
    const gmValue = await userSelect
      .locator('option')
      .evaluateAll((opts) => {
        const gm = opts.find((o) => o.value && /gamemaster/i.test(o.textContent ?? ''));
        return (gm ?? opts.find((o) => o.value))?.value ?? null;
      });
    if (!gmValue) throw new Error('No selectable user on the join screen.');

    await userSelect.selectOption(gmValue);
    await page.locator('button[name="join"], button[type="submit"]').first().click();

    // `game.ready` is the only trustworthy "world is usable" signal: the canvas
    // and sheets are not wired up before it flips.
    await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90_000 });

    await context.storageState({ path: STORAGE_STATE });
    console.log('[e2e] joined as Gamemaster');
  } catch (err) {
    fs.writeFileSync(path.join(HOST_DATA, 'join-failure.html'), await page.content());
    console.error(await logs(40));
    throw err;
  } finally {
    await browser.close();
  }
}
