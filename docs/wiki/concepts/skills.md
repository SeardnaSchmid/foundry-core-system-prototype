---
type: concept
title: Skills
description: Built-in skill catalog, custom actor-defined skills, and the unified lookup helper both go through.
tags: [skills, custom-skills, config]
resource: [module/helpers/config.mjs, module/helpers/skills.mjs]
related: [concepts/advancement, concepts/attributes]
---

# Skills

## Built-in catalog

`CONFIG.TNO.skills` in
[`module/helpers/config.mjs`](../../../module/helpers/config.mjs) is the
full catalog (~70 entries) grouped by `CONFIG.TNO.skillCategories`
(`combat`, `maneuvers`, `general`, `milieus`, `biomes`, `technology`,
`knowledge`). Each entry: `{ label, category, attribute, starter?, subgroup? }`.

`attribute` is only the **suggested** pairing preselected in the roll
dialog — any attribute can be swapped in via the dialog's chip picker, a
skill is never bound to one fixed attribute.

`subgroup` (`CONFIG.TNO.skillSubgroups`: `med`, `pilot`, `sci`, `hum`,
`cult`) adds a small badge for skills that live inside a bundling category
(`technology` holds Tech/Medicine/Pilot side by side; `knowledge` holds
Science/Humanities/Culture). Only the ambiguous domains get a badge — plain
`technology` skills go unbadged.

`starter: true` flags entry-level skills shown during character creation.

**Note:** `template.json`'s `character.skills` only pre-seeds the 14
`starter` combat/general skills with `{value: 0, xp: 0}`. Every other
built-in skill, and any custom skill, is added to `system.skills` lazily —
the first time it's rolled or advanced — not present on a freshly-created
actor until then.

## Custom skills

Live entirely inside the actor's own data:
`system.skills[key] = { value, xp, custom: {label, category, attribute}, lastAttribute }`.
[`module/helpers/skills.mjs`](../../../module/helpers/skills.mjs) owns key
generation and lookup:

- `slugifySkillName(name)` — NFD-normalize, strip diacritics, lowercase,
  collapse non-`a-z0-9` to `-`, trim. Never produces a `.` (would be
  read as a path separator by `actor.update()`).
- `generateCustomSkillKey(existingKeys, name)` — `custom-${slug}`,
  disambiguated with `-2`, `-3`, … on collision. The `custom-` prefix
  guarantees no collision with a built-in (camelCase) key, now or after
  future catalog additions.

## Unified lookup

**Every consumer** (sheet prep, roll/advance handlers) should read skill
definitions through `getSkillDefinitions(actor)` /
`getSkillDefinition(actor, key)`, never `CONFIG.TNO.skills` directly — this
is what makes custom skills behave identically to built-in ones everywhere
(filtering, rolling, advancing). Built-in skills always win a key collision
(a safety net; not reachable in practice given the `custom-` prefix).

Consumers: `actor-sheet.mjs` (skill list rendering, filtering),
`custom-skill-dialog.mjs` (add/edit form), `custom-skills-overview.mjs`
(world-wide GM listing).
