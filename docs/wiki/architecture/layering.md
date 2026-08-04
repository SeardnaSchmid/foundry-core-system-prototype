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
├── sheets/     actor-sheet.mjs, item-sheet.mjs, item-gear-sheet.mjs
│                 → helpers/{effects,heatmap,dice,skills,inventory,items}.mjs
│                 → apps/{roll-dialog,advance-dialog,heatmap-lab,custom-skill-dialog}.mjs
├── helpers/    config, dice, chat, heatmap, skills, effects, inventory, items,
│               item-presentation, migrations, templates
│                 → items.mjs is the base of the helper graph: it imports
│                   nothing, and inventory.mjs and config.mjs import it
│                 → inventory.mjs → items.mjs,
│                   item-presentation.mjs → {inventory,items}.mjs,
│                   config.mjs → {inventory,items}.mjs,
│                   migrations.mjs → items.mjs,
│                   chat.mjs → dice.mjs
└── apps/       roll-dialog, base-roll-dialog, roll-dialog-shared,
                advance-dialog, heatmap-lab, custom-skill-dialog,
                custom-skills-overview
                  → roll-dialog.mjs and base-roll-dialog.mjs both import
                    roll-dialog-shared.mjs (the advantage picker UI) and
                    helpers/dice.mjs
```

**Rule of thumb when adding code:** `documents/` reaches no further than
`helpers/` (it's what `getRollData()` and `prepareDerivedData()` need, and
other layers call *into* it, not the reverse). `helpers/` may depend on each
other sparingly, but never on `sheets/` or `apps/` — and `inventory.mjs` and
`items.mjs` additionally hold themselves free of Foundry globals so they can
be unit-tested without a game world, which is why `items.mjs` sits at the
bottom and may never import back up. `apps/` and `sheets/` may both depend on `helpers/`; `sheets/` may
additionally depend on `apps/` (a sheet opens dialogs), but `apps/` never
depends back on `sheets/`.

For the full file-by-file responsibility list, see
[reference/module-map.md](../reference/module-map.md).
