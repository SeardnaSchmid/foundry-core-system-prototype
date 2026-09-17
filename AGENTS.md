Rules: Read files first. Write complete solution. Test once. Only run e2e tests if asked. No over-engineering.
If the request or the existing design looks wrong, stop and say so before writing code.

This repo is **TNO**, a game system for Foundry VTT: vanilla ESM in `module/`,
Handlebars in `templates/`, Sass in `src/scss/` → `css/`. No bundler, no linter.

## Before you touch code

1. Read [`docs/wiki/index.md`](docs/wiki/index.md) — an agent-oriented code map
   (Open Knowledge Format) that routes you to the right page by concept. Start
   there instead of grepping `module/` cold.
2. Run `find docs/ -name "*.md" | sort`. The wiki is not all of `docs/`; some
   pages are reachable no other way.
3. Read only the pages the task needs. Frontmatter (`type`, `tags`,
   `description`) tells you which page; its `resource:` / `spec:` keys tell you
   where the code and the spec live.

The wiki is a code map, not a rulebook. Game mechanics live in `docs/design/*.md`
and the PRD always wins — never restate rules in code comments or wiki prose.

## Before you commit

Update the wiki **as the last step, once the code is final** — never interleave
doc edits with implementation. Two updates are mandatory:

- If the change alters architectural components, domain models, or cross-module
  dependencies, update or create the matching wiki page.
- If you renamed, moved, or deleted a file a page points at, fix that page's
  `resource:` in the same commit — a stale pointer fails CI.

Then run `npm test` and `npm run docs:check`.

Commands, CI, and the full release procedure:
[`docs/wiki/guides/build-test-release.md`](docs/wiki/guides/build-test-release.md).
