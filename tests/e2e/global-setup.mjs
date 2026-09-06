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

  // Seeded *before* the first navigation, so even this join boots without a
  // canvas — see `prepareClient` for why that matters. `core.noCanvas` is a
  // client-scoped setting, and Foundry stores those in `localStorage` under
  // `<namespace>.<key>` with a JSON value, so it can be written before any
  // Foundry code has run.
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('core.noCanvas', 'true');
    } catch {
      // A context without storage access still runs; it just pays for the canvas.
    }
  });

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

    await prepareClient(page);

    await context.storageState({ path: STORAGE_STATE });
    console.log('[e2e] joined as Gamemaster');
  } catch (err) {
    // Diagnostics must never replace the diagnosis: `page.content()` throws its
    // own error while the page is mid-navigation, which used to swallow the
    // failure that actually happened and report a content-retrieval problem
    // instead.
    try {
      fs.writeFileSync(path.join(HOST_DATA, 'join-failure.html'), await page.content());
      console.error(await logs(40));
    } catch (diagnosticErr) {
      console.error(`[e2e] could not capture join diagnostics: ${diagnosticErr.message}`);
    }
    throw err;
  } finally {
    await browser.close();
  }
}

/**
 * Put this client into the state every spec wants, once, for the whole run.
 *
 * Both settings below are **client**-scoped, which is what makes this work from
 * here: client settings live in `localStorage`, and `storageState` carries
 * `localStorage`. So they are written once and every spec's page inherits them,
 * instead of costing a round trip per test.
 *
 * **No canvas.** Not one spec in this suite touches the tabletop — they are
 * about sheets, dialogs, chat cards and the combat tracker, all of them DOM. But
 * a fresh world does not stay canvas-free: `NUEManager#showNewWorldTour` creates
 * and *activates* a welcome scene (`NUEDEFAULTSCENE0`), so from the first join
 * onward every page load initialises a real scene. The container has no GPU, so
 * that runs through SwiftShader at a couple of frames a second, and it is by far
 * the largest thing in a spec's wall clock. `core.noCanvas` skips it entirely.
 *
 * **No tours.** The same NUE path auto-starts `core.welcome` while its status is
 * `UNSTARTED`. The tour lays a modal over the UI and dims what is behind it, so
 * real clicks fail their actionability check — which is why several specs
 * dispatch `element.click()` through `evaluate`, a workaround that skips those
 * checks and would hide a genuinely obscured control. `Tour#complete()` moves
 * the cursor past the last step and persists it; any tour already on screen is
 * exited too, since the one we race may have started during the `ready` hook we
 * just waited on.
 */
async function prepareClient(page) {
  const prepared = await page.evaluate(async () => {
    // Already seeded into localStorage before load; set again so the value is
    // registered through the real API and survives into `storageState` even if
    // the init script could not run.
    await game.settings.set('core', 'noCanvas', true);

    const tours = [];
    for (const tour of game.tours) {
      tour.exit();
      await tour.complete();
      tours.push(`${tour.namespace}.${tour.id}`);
    }
    return { tours, noCanvas: game.settings.get('core', 'noCanvas') };
  });
  console.log(`[e2e] client prepared: noCanvas=${prepared.noCanvas}, tours completed: `
    + `${prepared.tours.length ? prepared.tours.join(', ') : 'none registered'}`);
}
