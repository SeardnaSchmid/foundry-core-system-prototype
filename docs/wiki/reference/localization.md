---
type: reference
title: Localization
description: The lang/en.json and lang/de.json structure, key namespace, and the both-files-together rule.
tags: [localization, i18n, lang]
resource: [lang/en.json, lang/de.json]
---

# Localization

Two files, registered in [`system.json`](../../../system.json):
[`lang/en.json`](../../../lang/en.json),
[`lang/de.json`](../../../lang/de.json). All keys nest under a single
top-level `TNO` namespace (e.g. `TNO.Ability.Str.long`,
`TNO.Edge.PostMortemTitle`, `TNO.SkillCategory.Combat`).

## Rule: touch both files together

Every localization key must exist in **both** `en.json` and `de.json` in
the same commit. Foundry falls back to the raw key string (not to English)
if a key is missing from the active language file, so a German-only
addition breaks silently for English-language worlds and vice versa.

## Where keys are consumed

Static UI copy is referenced directly in `.hbs` templates via `{{localize
...}}` — see [ui-surfaces.md](ui-surfaces.md). Dynamically-built strings
(advantage descriptions, roll outcomes, skill/attribute labels) are
resolved in JS via `game.i18n.localize(...)` /
`game.i18n.format(...)`, notably in
[`dice.mjs`](../../../module/helpers/dice.mjs)`describeAdvantage()` and
[`skills.mjs`](../../../module/helpers/skills.mjs)`getSkillDefinitions()`,
which localize `CONFIG.TNO.skills[key].label` and
`CONFIG.TNO.abilities[key]` on lookup rather than storing pre-localized
text in config.

## Adding a new config entry (skill, ability, category)

Adding an entry to `CONFIG.TNO.*` in
[`config.mjs`](../../../module/helpers/config.mjs) means adding its
`label`/`hint` key to **both** language files — the config object only
ever stores the key string, never the display text.
