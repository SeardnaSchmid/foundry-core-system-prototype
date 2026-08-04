#!/usr/bin/env node
/**
 * Fail if `css/tno.css` is not what `src/scss` currently compiles to.
 *
 * The compiled stylesheet is a committed artifact — Foundry loads it straight
 * from the manifest and there is no bundler in front of it — so a `.scss` edit
 * committed without `npm run build` ships a sheet that silently does not match
 * the source. Nothing else in the pipeline notices: `npm test` only covers the
 * pure helpers and `docs:check` only reads the wiki.
 *
 * Compiles to a temporary file with the exact flags `npm run build` uses and
 * compares byte for byte, so this can never disagree with the real build.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCE = 'src/scss/tno.scss';
const BUILT = 'css/tno.css';

const scratch = mkdtempSync(join(tmpdir(), 'tno-css-'));
const candidate = join(scratch, 'tno.css');

try {
  execFileSync(
    'npx',
    ['sass', SOURCE, candidate, '--style=expanded', '--no-source-map'],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );

  let committed;
  try {
    committed = readFileSync(BUILT, 'utf8');
  } catch {
    console.error(`✗ ${BUILT} is missing. Run: npm run build`);
    process.exit(1);
  }

  if (readFileSync(candidate, 'utf8') !== committed) {
    console.error(
      `✗ ${BUILT} is stale — it does not match what ${SOURCE} compiles to.\n` +
        '  Run: npm run build   (and commit the result)'
    );
    process.exit(1);
  }

  console.log(`✓ ${BUILT} matches ${SOURCE}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
