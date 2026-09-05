#!/usr/bin/env node
/**
 * Fail if `src/packs/**` does not compile to a Foundry pack.
 *
 * This is the pack half of what `check-css-build.mjs` does for the stylesheet,
 * and it exists for the same reason: a release must not be tagged over a source
 * file that cannot be built. `npm test` covers the *content* of the sources —
 * ids unique, folders resolve, no shipped item missing a required field — but
 * nothing there proves the YAML actually compiles.
 *
 * **It builds into a temporary directory and throws the result away.** The real
 * `build:packs` cannot be used for this: it rebuilds `packs/` in place, and
 * `packs/` is a LevelDB a running Foundry holds open, so validating a release
 * meant first shutting down the world you were developing against. The output
 * here is not wanted — only the fact that it could be produced — so there is no
 * reason to aim it at the live directory. `packs/` is a gitignored artifact the
 * release workflow rebuilds from scratch anyway.
 */

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compilePack } from '@foundryvtt/foundryvtt-cli';

const SOURCE = 'src/packs';

const packs = (await readdir(SOURCE, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (!packs.length) {
  console.error(`✗ no pack sources found in ${SOURCE}/`);
  process.exit(1);
}

const scratch = await mkdtemp(join(tmpdir(), 'tno-packs-'));

try {
  for (const pack of packs) {
    const source = join(SOURCE, pack);
    try {
      await compilePack(source, join(scratch, pack), { yaml: true });
    } catch (error) {
      console.error(`✗ ${source} does not compile: ${error.message}`);
      process.exit(1);
    }
  }
  console.log(`✓ ${packs.length} pack source(s) compile: ${packs.join(', ')}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
