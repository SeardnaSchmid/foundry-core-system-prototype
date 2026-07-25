#!/usr/bin/env node
// Validates docs/wiki/**: frontmatter shape, that resource/spec paths still
// exist on disk (the anti-rot check), that relative links resolve, and that
// every page is reachable from index.md. Exits non-zero on any failure.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIKI_ROOT = join(ROOT, 'docs', 'wiki');
const TYPES = new Set(['concept', 'architecture', 'reference', 'guide', 'index']);
const TYPES_REQUIRING_RESOURCE = new Set(['concept', 'architecture', 'reference']);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MD_LINK = /\[[^\]]*\]\(([^)#]+)(?:#[^)]*)?\)/g;

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

function parseFrontmatter(raw, file, errors) {
  if (!raw.startsWith('---\n')) {
    errors.push(`${rel(file)}: missing frontmatter (must start with "---")`);
    return null;
  }
  const end = raw.indexOf('\n---', 4);
  if (end === -1) {
    errors.push(`${rel(file)}: frontmatter never closed with "---"`);
    return null;
  }
  const block = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\r?\n/, '');
  let data;
  try {
    data = loadYaml(block);
  } catch (err) {
    errors.push(`${rel(file)}: invalid YAML frontmatter (${err.message})`);
    return null;
  }
  return { data: data ?? {}, body };
}

function rel(file) {
  return relative(ROOT, file);
}

function validateFrontmatter(file, data, errors) {
  const label = rel(file);

  if (!TYPES.has(data.type)) {
    errors.push(`${label}: "type" must be one of ${[...TYPES].join(', ')} (got ${JSON.stringify(data.type)})`);
  }
  if (typeof data.title !== 'string' || !data.title.trim()) {
    errors.push(`${label}: "title" is required and must be a non-empty string`);
  } else if (data.title.includes('\n')) {
    errors.push(`${label}: "title" must be a single line`);
  }
  if (typeof data.description !== 'string' || !data.description.trim()) {
    errors.push(`${label}: "description" is required and must be a non-empty string`);
  } else if (data.description.length > 200) {
    errors.push(`${label}: "description" must be <= 200 chars (got ${data.description.length})`);
  } else if (data.description.includes('\n')) {
    errors.push(`${label}: "description" must be a single line`);
  }
  if (!Array.isArray(data.tags) || data.tags.length === 0) {
    errors.push(`${label}: "tags" is required and must be a non-empty array`);
  } else {
    for (const tag of data.tags) {
      if (typeof tag !== 'string' || !KEBAB.test(tag)) {
        errors.push(`${label}: tag ${JSON.stringify(tag)} must be a kebab-case string`);
      }
    }
  }

  if (data.type && TYPES_REQUIRING_RESOURCE.has(data.type)) {
    if (data.resource === undefined) {
      errors.push(`${label}: "resource" is required for type "${data.type}"`);
    }
  }

  const resources = data.resource === undefined ? [] : [].concat(data.resource);
  for (const resource of resources) {
    if (typeof resource !== 'string') {
      errors.push(`${label}: "resource" entries must be strings (got ${JSON.stringify(resource)})`);
      continue;
    }
    if (!existsSync(join(ROOT, resource))) {
      errors.push(`${label}: resource "${resource}" does not exist on disk`);
    }
  }

  if (data.spec !== undefined) {
    if (typeof data.spec !== 'string' || !existsSync(join(ROOT, data.spec))) {
      errors.push(`${label}: spec "${data.spec}" does not exist on disk`);
    }
  }

  if (data.related !== undefined && !Array.isArray(data.related)) {
    errors.push(`${label}: "related" must be an array of wiki slugs`);
  }
}

function slugOf(file) {
  return relative(WIKI_ROOT, file).replace(/\.md$/, '');
}

async function main() {
  if (!existsSync(WIKI_ROOT)) {
    console.error(`No wiki found at ${rel(WIKI_ROOT)}`);
    process.exit(1);
  }

  const files = await walk(WIKI_ROOT);
  const errors = [];
  const pages = new Map(); // slug -> { file, data, body }
  const titles = new Map(); // title -> [files]

  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const parsed = parseFrontmatter(raw, file, errors);
    if (!parsed) continue;
    validateFrontmatter(file, parsed.data, errors);

    const slug = slugOf(file);
    pages.set(slug, { file, data: parsed.data, body: parsed.body });

    if (parsed.data.title) {
      const list = titles.get(parsed.data.title) ?? [];
      list.push(rel(file));
      titles.set(parsed.data.title, list);
    }
  }

  for (const [title, list] of titles) {
    if (list.length > 1) errors.push(`duplicate title "${title}" in: ${list.join(', ')}`);
  }

  // Relative link resolution + link graph for the orphan check.
  const graph = new Map(); // slug -> Set(slug)
  for (const [slug, page] of pages) {
    const edges = new Set();
    for (const match of page.body.matchAll(MD_LINK)) {
      const target = match[1].trim();
      if (/^(https?:)?\/\//.test(target) || target.startsWith('mailto:')) continue;

      const resolved = resolve(dirname(page.file), target);
      if (resolved.startsWith(WIKI_ROOT)) {
        if (!existsSync(resolved)) {
          errors.push(`${rel(page.file)}: broken link to "${target}"`);
        } else if (resolved.endsWith('.md')) {
          edges.add(slugOf(resolved));
        }
      } else if (!existsSync(resolved)) {
        errors.push(`${rel(page.file)}: broken link to "${target}"`);
      }
    }

    if (Array.isArray(page.data.related)) {
      for (const slug of page.data.related) {
        if (!pages.has(slug)) {
          errors.push(`${rel(page.file)}: related slug "${slug}" does not resolve to a wiki page`);
        } else {
          edges.add(slug);
        }
      }
    }
    graph.set(slug, edges);
  }

  if (pages.has('index')) {
    const reachable = new Set(['index']);
    const queue = ['index'];
    while (queue.length) {
      const current = queue.pop();
      for (const next of graph.get(current) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
    for (const slug of pages.keys()) {
      if (!reachable.has(slug)) {
        errors.push(`${rel(pages.get(slug).file)}: orphaned — not reachable from index.md via links or "related"`);
      }
    }
  } else {
    errors.push('docs/wiki/index.md is missing — required as the orphan-check root');
  }

  if (errors.length) {
    console.error(`\nWiki validation failed with ${errors.length} error(s):\n`);
    for (const error of errors) console.error(`  - ${error}`);
    console.error('');
    process.exit(1);
  }

  console.log(`Wiki validation passed: ${pages.size} page(s) checked.`);
}

main();
