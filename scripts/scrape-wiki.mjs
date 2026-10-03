#!/usr/bin/env node
// Scrapes the "You Need A Wiki" wiki (https://youneedawiki.com/app/page/…?p=…)
// into local Markdown. The wiki is nothing but a public Google Drive folder of
// Google Docs, so no auth is needed: folders are listed via Drive's
// embeddedfolderview HTML, docs are pulled through the Docs Markdown export.
//
//   node scripts/scrape-wiki.mjs [--root <folderId>] [--out <dir>] [--dry-run] [--no-summary]
//
// Output mirrors the Drive tree: one directory per folder, one .md per doc,
// plus an index.md listing every page. A complete download is staged before it
// replaces --out. Keep rules/ as its own Git repository to review each refresh.
//
// When the text changed, the delta is handed to the local `claude` CLI, which
// writes a plain-language entry at the top of rules/CHANGELOG.md. That entry is
// committed together with the snapshot; a failed summary never fails the fetch.

import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  root: '1EvO4JoI7haBFdUUzvUUz1gC8A186yZGi', // "Transneptunische Subjekte"
  out: join(ROOT_DIR, 'rules', 'wiki'),
};

const FOLDER_VIEW = (id) => `https://drive.google.com/embeddedfolderview?id=${id}#list`;
const DOC_EXPORT = (id) => `https://docs.google.com/document/d/${id}/export?format=md`;
const DOC_URL = (id) => `https://docs.google.com/document/d/${id}/edit`;
const WIKI_URL = (id, root) => `https://youneedawiki.com/app/page/${id}?p=${root}`;

// One <div class="flip-entry"> per child; the href tells folder from document.
const ENTRY_RE =
  /<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div>/g;

function parseArgs(argv) {
  const opts = { ...DEFAULTS, dryRun: false, summary: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') opts.root = argv[++i];
    else if (arg === '--out') opts.out = resolve(process.cwd(), argv[++i]);
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--no-summary') opts.summary = false;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

// Drive titles are free-form; keep them readable but path-safe.
function safeName(title) {
  const cleaned = title
    .replace(/[/\\?%*:|"<>\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');
  return cleaned || 'unbenannt';
}

async function fetchText(url, { label }) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
      }
      return await res.text();
    } catch (error) {
      lastError = error;
      if (error.fatal || attempt === 4) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`${label}: ${lastError.message} (${url})`);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function runGit(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.stderr.trim() || `exit ${result.status}`}`);
  }
  return result.stdout.trim();
}

async function ensureRulesRepo(out) {
  const repo = dirname(out);
  await mkdir(repo, { recursive: true });
  if (!(await exists(join(repo, '.git')))) {
    runGit(repo, ['init', '-b', 'main', '.']);
  }
  const topLevel = resolve(runGit(repo, ['rev-parse', '--show-toplevel']));
  if (topLevel !== resolve(repo)) {
    throw new Error(`${repo} is not an independent Git repository`);
  }
  return repo;
}

function commitSnapshot(repo, paths, timestamp) {
  runGit(repo, ['add', '--', ...paths]);
  runGit(repo, [
    'commit',
    '--allow-empty',
    '--only',
    '-m',
    `chore: fetch rules ${timestamp}`,
    '--',
    ...paths,
  ]);
  return runGit(repo, ['rev-parse', '--short', 'HEAD']);
}

// The staged delta of the snapshot, minus the `scraped:` lines a changed
// document rewrites — those say when, not what.
function stagedRuleDiff(repo, target) {
  runGit(repo, ['add', '--', target]);
  return runGit(repo, ['diff', '--cached', '-I', '^scraped: ', '--', target]);
}

const SUMMARY_PROMPT = `Du bekommst auf stdin den git-Diff eines Regel-Wikis für das Pen-&-Paper-Rollenspiel TNO (Transneptunische Subjekte). Schreibe daraus einen Changelog-Eintrag auf Deutsch in Markdown für jemanden, der verstehen will, was sich an den Regeln geändert hat.

- Beginne mit ein bis drei Sätzen Überblick: was ist die wichtigste Änderung?
- Danach je Dokument mit inhaltlichen Änderungen eine Überschrift \`### <Dokumenttitel>\` und pro Änderung einen Stichpunkt in Klartext: was galt vorher, was gilt jetzt, und was folgt daraus. Ändert sich eine Formel oder ein Wert, rechne ein kurzes Beispiel vor.
- Neue Tabellen und Einträge zusammenfassen statt abschreiben: Namen und auffällige Werte genügen.
- Gestrichene Abschnitte ausdrücklich als entfernt nennen.
- Rein formale Änderungen (Ankerlinks, Formatierung, Tippfehler) am Ende unter \`### Formales\` in einem Satz bündeln; gibt es keine, lass den Abschnitt weg.
- Nichts erfinden und nicht über Gründe spekulieren. Was der Diff offenlässt, als unklar kennzeichnen.
- Gib nur den Eintrag aus: keine Einleitung wie „Hier ist“, keine Überschrift der ersten oder zweiten Ebene.`;

function summarizeRuleDiff(repo, diff) {
  const result = spawnSync(
    'claude',
    ['-p', SUMMARY_PROMPT, '--tools', '', '--no-session-persistence'],
    { cwd: repo, input: diff, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 10 * 60 * 1000 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`);
  }
  const text = result.stdout.trim();
  if (!text) throw new Error('leere Antwort');
  return text;
}

const CHANGELOG_HEADER = `# Regeländerungen

Automatisch erzeugt von \`scripts/scrape-wiki.mjs\` bei jedem Abruf mit
inhaltlicher Änderung, neueste zuerst. Die Zusammenfassung schreibt die
\`claude\`-CLI; maßgeblich bleibt der Diff des jeweiligen Commits.
`;

async function prependChangelog(file, timestamp, body) {
  const previous = (await exists(file)) ? await readFile(file, 'utf8') : '';
  const start = previous.indexOf('\n## ');
  const entries = start === -1 ? '' : previous.slice(start + 1);
  const entry = `## ${timestamp.slice(0, 10)} · Abruf ${timestamp.slice(11, 16)} UTC\n\n${body}\n`;
  await writeFile(file, `${CHANGELOG_HEADER}\n${entry}${entries ? `\n${entries}` : ''}`);
}

// Never throws: a summary that cannot be written is recorded as such, with the
// pointer to the raw delta, and the snapshot is committed regardless.
async function recordChangelog(repo, target, timestamp) {
  const diff = stagedRuleDiff(repo, target);
  if (!diff) {
    process.stdout.write('Keine inhaltlichen Regeländerungen.\n');
    return [];
  }
  const file = join(repo, 'CHANGELOG.md');
  process.stdout.write('Fasse Regeländerungen zusammen …\n');
  let body;
  try {
    body = summarizeRuleDiff(repo, diff);
  } catch (error) {
    const stat = runGit(repo, ['diff', '--cached', '--stat', '-I', '^scraped: ', '--', target]);
    body = [
      `_Zusammenfassung fehlgeschlagen: ${error.message.split('\n')[0]}_`,
      '',
      'Geänderte Dateien:',
      '',
      '```',
      stat,
      '```',
      '',
      `Rohes Delta: \`git -C rules show HEAD -- ${target}\` direkt nach diesem Abruf.`,
    ].join('\n');
    process.stderr.write(`scrape-wiki: Zusammenfassung fehlgeschlagen: ${error.message}\n`);
  }
  await prependChangelog(file, timestamp, body);
  process.stdout.write(`Changelog: ${relative(process.cwd(), file)}\n`);
  return [relative(repo, file)];
}

function withoutScrapeDate(text) {
  return text.replace(/^scraped: .*$/m, 'scraped:');
}

async function writeSnapshotFile(file, content, previousFile) {
  if (await exists(previousFile)) {
    const previous = await readFile(previousFile, 'utf8');
    if (withoutScrapeDate(previous) === withoutScrapeDate(content)) {
      await writeFile(file, previous);
      return;
    }
  }
  await writeFile(file, content);
}

async function listFolder(folderId, title) {
  const html = await fetchText(FOLDER_VIEW(folderId), { label: `folder "${title}"` });
  const entries = [];
  for (const match of html.matchAll(ENTRY_RE)) {
    const [, id, href, rawTitle] = match;
    entries.push({
      id,
      title: decodeEntities(rawTitle).trim(),
      type: href.includes('/drive/folders/') ? 'folder' : 'doc',
    });
  }
  return entries;
}

// A Drive folder can hold the same title twice; keep both by suffixing.
function uniqueName(used, name) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  for (let n = 2; ; n += 1) {
    const candidate = `${name} (${n})`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

async function crawl(node, { root, out, previousOut, dryRun, stats, scrapedDate }, depth = 0) {
  const entries = await listFolder(node.id, node.title);
  const used = new Set();
  const children = [];

  for (const entry of entries) {
    const name = uniqueName(used, safeName(entry.title));
    if (entry.type === 'folder') {
      const child = { ...entry, name, dir: join(node.dir, name), children: [] };
      children.push(child);
      if (!dryRun) await mkdir(child.dir, { recursive: true });
      child.children = await crawl(
        child,
        { root, out, previousOut, dryRun, stats, scrapedDate },
        depth + 1,
      );
    } else {
      const body = await fetchText(DOC_EXPORT(entry.id), { label: `doc "${entry.title}"` });
      const file = join(node.dir, `${name}.md`);
      const empty = body.trim() === '';
      const front = [
        '---',
        `title: ${JSON.stringify(entry.title)}`,
        `doc_id: ${entry.id}`,
        `source: ${DOC_URL(entry.id)}`,
        `wiki: ${WIKI_URL(entry.id, root)}`,
        `scraped: ${scrapedDate}`,
        '---',
        '',
      ].join('\n');
      if (!dryRun) {
        await writeSnapshotFile(
          file,
          `${front}${empty ? '_(Dokument ist leer.)_\n' : body}`,
          join(previousOut, relative(out, file)),
        );
      }
      children.push({ ...entry, name, file, empty });
      stats.docs += 1;
      if (empty) stats.empty += 1;
      process.stdout.write(
        `${'  '.repeat(depth)}${relative(out, file)}${empty ? ' (leer)' : ''}\n`,
      );
    }
  }
  return children;
}

function renderIndex(children, out, depth = 0) {
  const lines = [];
  for (const child of children) {
    const pad = '  '.repeat(depth);
    if (child.type === 'folder') {
      lines.push(`${pad}- **${child.title}**`, ...renderIndex(child.children, out, depth + 1));
    } else {
      const href = relative(out, child.file)
        .split('\\')
        .join('/')
        .split('/')
        .map(encodeURIComponent)
        .join('/');
      const label = child.title.replace(/([[\]])/g, '\\$1');
      lines.push(`${pad}- [${label}](${href})${child.empty ? ' _(leer)_' : ''}`);
    }
  }
  return lines;
}

async function installSnapshot(stagingOut, out) {
  const hadPrevious = await exists(out);
  const backup = `${out}.previous-${process.pid}`;
  if (hadPrevious) await rename(out, backup);
  try {
    await rename(stagingOut, out);
  } catch (error) {
    if (hadPrevious) await rename(backup, out);
    throw error;
  }
  if (hadPrevious) await rm(backup, { recursive: true, force: true });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      'usage: node scripts/scrape-wiki.mjs [--root <folderId>] [--out <dir>] [--dry-run] [--no-summary]\n',
    );
    return;
  }

  const rootEntries = await listFolder(opts.root, 'root');
  if (rootEntries.length === 0) {
    throw new Error(
      `no entries under ${opts.root} — is the Drive folder still shared with "anyone with the link"?`,
    );
  }

  const timestamp = new Date().toISOString();
  const scrapedDate = timestamp.slice(0, 10);
  let stagingOut = opts.out;
  let rulesRepo;
  if (!opts.dryRun) {
    rulesRepo = await ensureRulesRepo(opts.out);
    stagingOut = await mkdtemp(join(dirname(opts.out), `.${basename(opts.out)}-staging-`));
  }

  const stats = { docs: 0, empty: 0 };
  try {
    const tree = await crawl(
      { id: opts.root, title: 'root', dir: stagingOut },
      {
        root: opts.root,
        out: stagingOut,
        previousOut: opts.out,
        dryRun: opts.dryRun,
        stats,
        scrapedDate,
      },
    );

    if (!opts.dryRun) {
      const index = [
        '---',
        'title: "Wiki-Abzug"',
        `root_folder: ${opts.root}`,
        `source: https://drive.google.com/drive/folders/${opts.root}`,
        `scraped: ${scrapedDate}`,
        '---',
        '',
        '# Wiki-Abzug',
        '',
        `Automatisch erzeugt von \`scripts/scrape-wiki.mjs\` — nicht von Hand bearbeiten.`,
        '',
        ...renderIndex(tree, stagingOut),
        '',
      ].join('\n');
      await writeSnapshotFile(
        join(stagingOut, 'index.md'),
        index,
        join(opts.out, 'index.md'),
      );

      await installSnapshot(stagingOut, opts.out);
      stagingOut = undefined;
      const target = relative(rulesRepo, opts.out);
      const extra = opts.summary ? await recordChangelog(rulesRepo, target, timestamp) : [];
      const commit = commitSnapshot(rulesRepo, [target, ...extra], timestamp);
      process.stdout.write(`Regel-Commit: ${commit}\n`);
    }

    process.stdout.write(
      `${stats.docs} Dokumente (${stats.empty} leer) → ${relative(process.cwd(), opts.out)}\n`,
    );
    if (!opts.dryRun) {
      process.stdout.write(`Letztes Delta: git -C ${relative(process.cwd(), rulesRepo)} show --stat --oneline HEAD\n`);
    }
  } finally {
    if (stagingOut && stagingOut !== opts.out) {
      await rm(stagingOut, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  process.stderr.write(`scrape-wiki: ${error.message}\n`);
  process.exitCode = 1;
});
