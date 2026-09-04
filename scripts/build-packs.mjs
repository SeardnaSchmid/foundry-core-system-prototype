#!/usr/bin/env node
/**
 * Compile the shipped compendium packs, and extract them back again.
 *
 * A Foundry pack is a LevelDB directory, which is neither reviewable nor
 * mergeable, so the source of truth is one YAML file per document under
 * `src/packs/<pack>/` and `packs/<pack>/` is a build artifact — the same
 * relationship `src/scss` has to `css`, except that this one is not committed.
 *
 *   node scripts/build-packs.mjs            compile src/packs -> packs
 *   node scripts/build-packs.mjs --extract  packs -> src/packs, after editing
 *                                           the compendium inside Foundry
 *
 * Compiling always removes the target directory first: LevelDB merges writes
 * into whatever is already there, so a document deleted from the source would
 * otherwise survive in the pack for ever.
 *
 * That is also why this refuses to run while Foundry has the pack open. The
 * removal unlinks files the live process still holds, and Foundry then
 * recovers its own cached copy back over the freshly built one — the build
 * reports success and the pack silently reverts. Taking LevelDB's own lock
 * first is the only reliable way to see that coming.
 */

import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { compilePack, extractPack } from '@foundryvtt/foundryvtt-cli';
import { ClassicLevel } from 'classic-level';

const SOURCE = 'src/packs';
const BUILT = 'packs';

const extract = process.argv.includes('--extract');

const packs = (await readdir(SOURCE, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (!packs.length) {
  console.error(`✗ no pack sources found in ${SOURCE}/`);
  process.exit(1);
}

/**
 * Fail loudly if another process holds the pack's LevelDB lock.
 * @param {string} dir  The built pack directory.
 */
async function assertNotInUse(dir) {
  if (!existsSync(dir)) return;
  const db = new ClassicLevel(dir);
  try {
    await db.open();
  } catch {
    console.error(
      `✗ ${dir} is open in another process — almost certainly a running Foundry.\n` +
      '  Return to setup (or stop the server) first: rebuilding a pack under a live\n' +
      '  Foundry lets it write its cached copy back over what you just built.'
    );
    process.exit(1);
  }
  await db.close();
}

for (const pack of packs) {
  const source = join(SOURCE, pack);
  const built = join(BUILT, pack);

  if (extract) {
    await rm(source, { recursive: true, force: true });
    await extractPack(built, source, { yaml: true });
    console.log(`✓ ${built} -> ${source}`);
    continue;
  }

  await assertNotInUse(built);
  await rm(built, { recursive: true, force: true });
  await compilePack(source, built, { yaml: true });
  console.log(`✓ ${source} -> ${built}`);
}
