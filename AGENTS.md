Rules: Read files first. Write complete solution. Test once. No over-engineering.

## Wiki

An agent-oriented code map lives at [docs/wiki/index.md](docs/wiki/index.md) —
start there before exploring `module/` cold. It describes what the code does
and links out to `docs/design/*.md` for the game-mechanics spec; it does not
restate rules.

Every page carries YAML frontmatter with a `resource:` (or `spec:`) path back
to the source file(s) it documents. **If you rename or delete a file that a
wiki page points at, update or remove that page in the same change** — a
stale `resource:` fails CI. Run `npm run docs:check` to validate locally
before pushing (also runs automatically before `npm run release`).

## Release Steps
1. If updating Foundry compatibility: Manually update `system.json` - `compatibility.verified` (and optionally `compatibility.minimum`)
2. Run `npm run release` - This will:
   - Update version in `package.json` and `system.json`
   - Update `CHANGELOG.md` with changes
   - Create commit with message "chore: release vX.Y.Z"
   - Tag commit with `vX.Y.Z`
   - Push commit and tag
3. GitHub workflow auto-creates release with manifest/zip and updates `download` URL

**Note:** The `download` URL in system.json is auto-updated by the release workflow, no manual change needed.