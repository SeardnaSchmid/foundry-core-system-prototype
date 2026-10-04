Rules: Read files first. Write complete solution. Test once. Only run e2e tests if asked. No over-engineering.
If the request or the existing design looks wrong, stop and say so before writing code.

This repo is **TNO**, a game system for Foundry VTT: vanilla ESM in `module/`,
Handlebars in `templates/`, Sass in `src/scss/` → `css/`. No bundler, no linter.

## Before you touch code

1. Read [`docs/codemap/index.md`](docs/codemap/index.md) — an agent-oriented code map
   (Open Knowledge Format) that routes you to the right page by concept. Start
   there instead of grepping `module/` cold.
2. Run `find docs/ -name "*.md" | sort`. The code map is not all of `docs/`; some
   pages are reachable no other way.
3. Read only the pages the task needs. Frontmatter (`type`, `tags`,
   `description`) tells you which page; its `resource:` / `spec:` keys tell you
   where the code and the spec live.

## Rules

The game rules live in `rules/wiki/`, a mirror of the live wiki (an independent
Git repo, ignored here; `npm run rules:fetch` creates or refreshes it). On game
mechanics the wiki always wins. `docs/design/*.md` only decides what the wiki
leaves open and how a rule is realised in Foundry (workflow, UI, data). Never
restate a rule — not in a PRD, a code comment or the code map; point at the
wiki page instead.

After every rules fetch, before any other work, sync the new
`rules/CHANGELOG.md` entries as [`docs/design/rules-sync.md`](docs/design/rules-sync.md)
describes.

## Before you commit

Update the code map **as the last step, once the code is final** — never interleave
doc edits with implementation. Two updates are mandatory:

- If the change alters architectural components, domain models, or cross-module
  dependencies, update or create the matching code-map page.
- If you renamed, moved, or deleted a file a page points at, fix that page's
  `resource:` in the same commit — a stale pointer fails CI.

Then run `npm test` and `npm run docs:check`.

Commands, CI, and the full release procedure:
[`docs/codemap/guides/build-test-release.md`](docs/codemap/guides/build-test-release.md).
