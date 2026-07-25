Rules: Read files first. Write complete solution. Test once. No over-engineering.

## Wiki & Knowledge Base

An agent-oriented code map lives at [docs/wiki/index.md](docs/wiki/index.md) (Open Knowledge Format).
**You MUST follow this discovery and maintenance workflow:**

1. **Pre-Task Lookup:** Start at `docs/wiki/index.md` before exploring source code cold. 
2. **Targeted Reading:** Use YAML frontmatter (`type`, `tags`, `description`) in `docs/wiki/` pages to locate relevant domain concepts and their `resource:` / `spec:` code paths.
3. **Design Specs:** Wiki pages describe module intent and link out to `docs/design/*.md` for game-mechanics specs; do not restate design rules in code comments.
4. **Living Maintenance:** If your code changes alter architectural components, domain models, or cross-module dependencies, update or create the corresponding wiki pages in the same task.
5. **CI & Link Drift:** Every page carries YAML frontmatter pointing back to source files. **If you rename, move, or delete a file that a wiki page points at, update or remove that page in the same change** — a stale `resource:` fails CI. Run `npm run docs:check` to validate locally before pushing (also runs automatically before `npm run release`).

## Release Workflow

When instructed to perform or prepare a release:

1. **Check Compatibility:** If updating Foundry compatibility, explicitly confirm or update `compatibility.verified` (and optionally `compatibility.minimum`) in `system.json`.
2. **Execute Release Command:** Run `npm run release`. 
   * *Note:* This command automatically runs `docs:check`, updates `package.json` and `system.json` versions, updates `CHANGELOG.md`, creates a `chore: release vX.Y.Z` commit, tags it, and pushes to remote.
3. **Post-Release Automation:** Do NOT manually edit the `download` URL in `system.json`; the GitHub release workflow handles this automatically upon tag push.