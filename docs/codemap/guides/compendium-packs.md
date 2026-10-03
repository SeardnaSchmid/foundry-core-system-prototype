---
type: guide
title: The shipped gear compendium
description: How src/packs YAML becomes the LevelDB pack in packs/, what the GM gets, and how to add or edit an entry.
tags: [packs, compendium, gear, build, release]
related: [concepts/item-roles, concepts/inventory, guides/build-test-release]
---

# The shipped gear compendium

The system ships one compendium, **`tno.gear`** — labelled *TNO – Ausrüstung* —
so a GM starting a world already has the equipment catalogue instead of typing
it in. It is registered in the `packs` array of
[`system.json`](../../../system.json), which is the whole of the runtime
integration: Foundry mounts the pack, players get `OBSERVER`, assistants get
`OWNER`.

## Source is YAML, the pack is a build artifact

A Foundry pack is a LevelDB directory. It cannot be reviewed, merged or
diffed, so it is not the source of truth and it is **not committed** —
`.gitignore` excludes `packs/*/`, while `packs/.gitattributes` keeps the
directory itself in the tree.

What is committed is `src/packs/gear/`: one YAML file per document, one
document per item, plus one file per folder. The relationship is the one
`src/scss` has to `css`, with one difference — the compiled stylesheet is
committed because Foundry loads it from the manifest as text, whereas the pack
is rebuilt in full every time.

```
npm run build:packs      # src/packs -> packs, wiping the target first
npm run packs:extract    # packs -> src/packs, after editing inside Foundry
```

Compiling always deletes the target directory first. LevelDB merges writes into
whatever is already there, so an item deleted from the source would otherwise
survive in the pack indefinitely.

**Never build while Foundry is running.** The removal unlinks files a live
Foundry still holds open; it then recovers its own cached copy back over the
new pack, and the build reports success while the compendium silently reverts
to the previous version. `build:packs` takes LevelDB's lock before touching
anything and refuses to run when Foundry holds it — return to setup, build,
then launch the world again. A browser refresh is not enough: packs are opened
server-side at world launch.

[`scripts/build-packs.mjs`](../../../scripts/build-packs.mjs) is both
directions; it walks every directory under `src/packs/`, so a second pack needs
no change to the script — only its own `system.json` entry.

## The two ways to author an item

**By hand.** Copy an existing `.yml`, change the values. Three fields are
structural rather than content: `_id` is a 16-character document id, `_key` must
be `!items!<that id>`, and `folder` must be the `_id` of one of the
`folder-*.yml` documents. Everything under `system` is the gear schema from
[`template.json`](../../../template.json) — see
[concepts/item-roles.md](../concepts/item-roles.md) for what each field means and
which ones a role makes required.

**In Foundry.** Unlock the compendium, edit entries with the real item sheet,
then run `npm run packs:extract` to write the result back over `src/packs/`.
This is the better path for anything with a lot of fields, because the sheet
enforces the schema and the extract is mechanical.

Either way, `npm test` reads the source back: `tests/packs/gear-source.test.js`
checks ids are unique, folders resolve, and — using the sheet's own
`missingRequired()` — that no shipped item arrives with a warning banner on its
card. Two weapons are named exceptions in that suite; the comment there says
why.

## Item art comes from Foundry, not from this repository

Every entry points at an icon under `icons/…`, which is core Foundry art —
around 5,000 Rexard icons that ship inside the application itself. The system
carries the *path*, never the file.

That is the whole reason to do it this way. The core icon licence
(`resources/app/public/icons/LICENSE`) forbids redistributing that art outside
Foundry, and referencing it costs the release zip nothing, since every install
already has the files.

The mapping keeps three lines apart on purpose, because the compendium list is
read as a grid of thumbnails:

| Group | Drawn from |
| --- | --- |
| Werkzeuge als Waffen | `icons/tools/hand/**` where core has the tool — the table calls them tools, so they look like tools. Entries core has no tool for (Axt, Hippe, Lasso, Messer) fall back to the nearest painted `icons/weapons/**` or `icons/sundries/**` art |
| Hartgummipanzerung | the `riot-*` set across `icons/equipment/**`, which has no head or hand piece — helmet and combined gloves borrow the `helmet-motorcycle-*` / `gloves-motorcycle-*` art instead |
| Stahlpanzerung | the plate set — `breastplate-*`, `gauntlet-armored-*`, `boots-armored-*` |
| Unterkleidung | `icons/equipment/body/**`, which is where all four suits live |

`tests/packs/gear-source.test.js` asserts every path is a distinct
`icons/**.webp`. It cannot check that the file exists — the art is not in this
repository — so a typo surfaces as a broken image in Foundry, not as a failing
test.

If an item ever needs art core does not have, put the file in `assets/items/`
and point at `systems/tno/assets/items/…`. That ships in the zip, so it needs
to be art the project is allowed to redistribute.

## Where it is built

- **Release** — `.github/workflows/release.yml` runs `npm run build:packs`
  before zipping, and `packs` was already in the zip's file list.
- **E2E** — `.github/workflows/e2e.yml` builds it too, since Foundry logs an
  error for a registered pack whose path does not exist.
- **Locally** — run it once before `npm run serve`. The dev server serves the
  working tree, so an unbuilt `packs/gear` is a missing compendium.
- **`npm run release:verify`** does *not* run it — it runs `packs:check`, which
  compiles these same sources into a temporary directory and discards the
  result. A broken source still fails before a tag is cut, but the check takes
  no lock, so a release can be cut without shutting the world down. See
  [build-test-release.md](build-test-release.md).

## What the GM gets, and what an update does to it

The compendium is read-only in play until unlocked. A GM drags an entry onto a
sheet, or right-clicks the pack and imports all of it into the world.

Both of those **copy**. A system update replaces `packs/gear` wholesale, so
corrections and new items arrive with the version — but anything already
imported into a world, or dragged onto an actor, is a separate document and is
never touched. That is the intended trade: the shipped catalogue is a
starting point that stays current, not a live reference the world depends on.

The consequence to know is the other direction: fixing a stat here does not fix
the copies a GM already made. A world-data correction is a
[migration](../concepts/migrations.md), not a pack rebuild.
