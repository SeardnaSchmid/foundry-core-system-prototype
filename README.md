# Trans-Neptunian Objects (TNO)

A game system for [Foundry VTT](https://foundryvtt.com/) v14: character sheets,
dice rolls, combat workflow, inventory and an equipment compendium for the
tabletop RPG *Trans-Neptunian Objects*.

"Trans-Neptunian Objects" is a working title; the system ID is `tno`
(see [Renaming](#renaming)).

## Installation

In Foundry, go to **Game Systems → Install System** and paste this manifest URL:

```
https://github.com/SeardnaSchmid/foundry-core-system-prototype/releases/latest/download/system.json
```

Requires Foundry VTT **v14**. Languages: German and English.

## Rules

The game rules are not part of this repository. They live in a separate wiki;
`npm run rules:fetch` pulls a local copy into `rules/wiki/` (its own Git
repository, ignored here). On game mechanics the wiki always wins —
[`docs/design/`](docs/design/) only describes how a rule is realised in Foundry.

## Development

Vanilla ESM, no bundler, no linter:

| Path | Contents |
| --- | --- |
| `module/` | System code (entry point: `module/tno.mjs`) |
| `templates/` | Handlebars templates |
| `src/scss/` → `css/` | Styles (Sass) |
| `src/packs/` → `packs/` | Compendia: YAML source and built LevelDB |
| `lang/` | Localisation (`de.json`, `en.json`) |
| `tests/` | Vitest unit tests; Playwright e2e under `tests/e2e/` |

Setup:

```bash
npm ci
npm run build
npm run build:packs
```

Then symlink `Data/systems/tno` in your Foundry data directory to this
repository. `npm run serve` starts your local Foundry install headless (paths
via `FOUNDRY_APP_PATH`, `FOUNDRY_DATA_PATH`, `FOUNDRY_WORLD`); `npm run watch`
rebuilds the CSS on every change.

Main commands:

| Command | Does |
| --- | --- |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | E2E tests against a throwaway Foundry in Docker |
| `npm run docs:check` | Checks the code map for stale pointers |
| `npm run release` | Bumps the version, updates the changelog, tags, pushes |

Full command list, CI and the release procedure:
[docs/codemap/guides/build-test-release.md](docs/codemap/guides/build-test-release.md).
The e2e tests need a signed Foundry licence; see
[docs/codemap/guides/e2e-testing.md](docs/codemap/guides/e2e-testing.md).

## Documentation

[docs/codemap/index.md](docs/codemap/index.md) is the code map: architecture,
concepts, and where things live in the code. Start there rather than searching
`module/`. Product decisions (PRDs) are in [docs/design/](docs/design/), the
change history in [CHANGELOG.md](CHANGELOG.md).

## Renaming

The displayed name comes solely from `title` in [system.json](system.json).
A full rename (system ID, namespace, files) has to happen in one step, because
existing worlds expect the ID `tno` and paths under `systems/tno/...`. It
touches:

- **`system.json`**: `id`, `title`, `manifest`/`download` URLs
- **Files with `tno` in the name**: `module/tno.mjs`, `css/tno.css`,
  `src/scss/tno.scss`
- **Namespace and classes**: `game.tno`, `TnoRollDialog` and other `Tno*`
  identifiers
- **Localisation**: the `TNO` key prefix in `lang/en.json` and `lang/de.json`
- **CSS classes** prefixed `tno-` in `src/scss/` and `templates/**/*.hbs`
- **Foundry paths** `systems/tno/...` in templates and the manifest
- **`package.json`** / `package-lock.json` (package name)
- **`.claude/settings.local.json`** (local Foundry symlink, debug paths)

Find every occurrence:

```bash
grep -rli "tno" --include="*.mjs" --include="*.json" --include="*.css" --include="*.scss" --include="*.hbs" .
```

## License

MIT, see [LICENSE.txt](LICENSE.txt).
