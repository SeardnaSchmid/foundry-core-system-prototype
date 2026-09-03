---
type: architecture
title: Module layering
description: The import dependency graph across module/, and the layering rule it follows.
tags: [architecture, imports, dependency-graph]
resource: [module/documents, module/sheets, module/helpers, module/apps]
related: [architecture/bootstrap, reference/module-map]
---

# Module layering

`module/` has four layers. Imports only ever point downward — there are no
circular dependencies:

```
module/tno.mjs                          (entry point, imports everything below)
├── documents/  {actor,item}.mjs        — reach no further than helpers/
│                 → both import helpers/inventory.mjs
│                 → actor.mjs imports helpers/damage.mjs
│                 → both import helpers/combat-actions.mjs for the combat
│                   workflows they open; the dialog itself is reached through
│                   game.tno.TnoRollDialog, never imported from apps/
│                 → item.mjs imports helpers/item-transfer.mjs for the data its
│                   posted chat card carries
├── sheets/     actor-sheet.mjs, item-sheet.mjs, item-gear-sheet.mjs
│                 → helpers/{effects,heatmap,dice,skills,inventory,items,
│                   combat-actions}.mjs
│                 → apps/{roll-dialog,advance-dialog,heatmap-lab,custom-skill-dialog}.mjs
├── helpers/    config, dice, dice-odds, dice-odds-table, chat, heatmap, skills,
│               effects, inventory, damage, items, item-presentation, item-transfer,
│               combat-actions, maneuvers, migrations, templates
│                 → items.mjs is the base of the helper graph: it imports
│                   nothing, and inventory.mjs and config.mjs import it
│                 → maneuvers.mjs is the second global-free base: it imports
│                   nothing and holds the Stellen and the A→B envelope
│                 → damage.mjs is another global-free base: it imports nothing
│                   and resolves the two raw health counters
│                 → inventory.mjs → items.mjs,
│                   item-presentation.mjs → {inventory,items}.mjs,
│                   config.mjs → {inventory,items}.mjs,
│                   migrations.mjs → items.mjs,
│                   combat-actions.mjs → {inventory,items,maneuvers,skills}.mjs,
│                   chat.mjs → {dice,combat-actions,item-transfer}.mjs,
│                   item-transfer.mjs → items.mjs,
│                   dice.mjs → dice-odds.mjs → dice-odds-table.mjs
│                   (one-way: the odds side never imports dice.mjs back, so
│                    dice.mjs stays the base of the roll graph)
└── apps/       roll-dialog, base-roll-dialog, roll-dialog-shared,
                advance-dialog, heatmap-lab, custom-skill-dialog,
                custom-skills-overview
                  → roll-dialog.mjs and base-roll-dialog.mjs both import
                    roll-dialog-shared.mjs (the advantage picker UI) and
                    helpers/dice.mjs
                  → roll-dialog.mjs additionally imports helpers/maneuvers.mjs
                    to build the envelope it sends and to know the default Stelle
```

**Rule of thumb when adding code:** `documents/` reaches no further than
`helpers/` (it's what `getRollData()` and `prepareDerivedData()` need, and
other layers call *into* it, not the reverse). `helpers/` may depend on each
other sparingly, but never on `sheets/` or `apps/` — and `damage.mjs`,
`inventory.mjs`, `items.mjs` and `maneuvers.mjs` additionally hold themselves free of Foundry
globals so they can be unit-tested without a game world, which is why they sit
at the bottom and may never import back up. `apps/` and `sheets/` may both
depend on `helpers/`; `sheets/` may additionally depend on `apps/` (a sheet
opens dialogs), but `apps/` never depends back on `sheets/`.

For the full file-by-file responsibility list, see
[reference/module-map.md](../reference/module-map.md).
