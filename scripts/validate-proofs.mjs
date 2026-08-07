#!/usr/bin/env node
// Validates the "Proof" references in docs/design/**: every `<file> › <test>`
// citation must name a test that actually exists. Exits non-zero on any
// failure.
//
// Why this exists: a PRD that carries a hand-written "Status: implemented"
// states something nobody checks, and it is wrong exactly when it matters —
// this repo shipped `Status: Implemented` over a rule the code got wrong. A
// citation of an executable test cannot rot silently: rename or delete the
// test and the build goes red, which is the only kind of documentation that
// stays true.
//
// The convention it enforces, and the whole status model of docs/design:
//
//   | rule row | … | `tests/helpers/items.test.js › grades a shortfall …` |
//   | rule row | … | —                                                   |
//
// A reference means "this rule is pinned down by that test". An em dash means
// "specified, not proven" — which for anything in these documents is the same
// statement as "not implemented", because a rule the suite does not exercise
// is a rule nothing is holding in place.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_ROOT = join(ROOT, 'docs', 'design');

// An inline-code span holding a path, "›", and a test title. The separator is
// deliberately a character no path or title contains, so nothing else in the
// prose can be mistaken for a citation.
const PROOF = /`([^`›]+?)\s*›\s*([^`]+?)`/g;

// How vitest and Playwright declare a case. The title is matched as a whole
// quoted string so a reference cannot pass on a prefix of a longer name.
const TEST_TITLE = /(?:^|\s)(?:it|test)(?:\.\w+)?\(\s*(['"`])([\s\S]*?)\1/gm;

const rel = (file) => relative(ROOT, file);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

/** Every test title declared in a spec file, or null if it cannot be read. */
function titlesIn(file) {
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const titles = new Set();
  for (const [, , title] of source.matchAll(TEST_TITLE)) titles.add(title);
  return titles;
}

async function main() {
  const errors = [];
  const cache = new Map();
  let citations = 0;

  for (const page of await walk(DESIGN_ROOT)) {
    const body = readFileSync(page, 'utf8');
    for (const [, path, title] of body.matchAll(PROOF)) {
      citations += 1;
      const specFile = join(ROOT, path.trim());
      if (!cache.has(specFile)) cache.set(specFile, titlesIn(specFile));
      const titles = cache.get(specFile);

      if (titles === null) {
        errors.push(`${rel(page)}: proof cites "${path.trim()}", which does not exist`);
        continue;
      }
      if (!titles.has(title.trim())) {
        errors.push(`${rel(page)}: ${path.trim()} has no test named "${title.trim()}"`);
      }
    }
  }

  if (errors.length) {
    console.error(`\nProof validation failed with ${errors.length} error(s):\n`);
    for (const error of errors) console.error(`  - ${error}`);
    console.error('\nA proof must name a test that exists. Update the citation, or');
    console.error('drop it to "—" if the rule is no longer pinned down.\n');
    process.exit(1);
  }

  console.log(`Proof validation passed: ${citations} citation(s) checked.`);
}

main();
