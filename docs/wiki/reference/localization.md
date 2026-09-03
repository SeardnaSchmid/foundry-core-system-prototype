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

`TNO.Damage.*` is shared by the banner's tracks and malus, the condition
panel that edits them (`PanelTitle`, and `Sharp`/`Blunt` as visible labels
rather than tooltip-only text), the Stelle captions and the roll dialog's
always-on damage component. Keep those labels aligned in both files so the same
mechanic is named consistently at entry, preview and roll time.

`TNO.Derived.*` / `DerivedShort.*` / `DerivedHint.*` name the values the banner
handed to the Basics tab's derived strip, under the `TNO.DerivedTitle` heading.
The split is by surface, not by mere length: `DerivedShort.*` is what a tile or
line is *labelled*, `Derived.*` what the value is *called* in a tooltip title or
on a roll card, where there is room for the precise name. German is where the
two diverge — "Initiativegrundwert" is the value's name and truncates as a
label, so the tile reads `DerivedShort.Initiative`.
`TNO.EdgeAdjustLabel` is the reserve correction in the Edge popover; the
`TNO.EdgeValueHint` that titled the banner's old number field is gone with the
field.

`TNO.Status.*` belongs to the character header's condition surfaces: fixed
condition names and comparison/state text, the Zustände row's active-only
collection, and the condition panel's raster affordances — including the
collection's zero-condition state and `PanelDamageHint`, the panel's one line on
what a raster light is. The
`Tag.*` holds the two-letter abbreviation each condition is shown by inside the
panel, where the raster light and the panel row want a fixed mark column beside
the spelled-out name; it is localized rather than sliced off the label because
the German and English names abbreviate differently. The band itself names
conditions in full. The
three derived conditions add their names (`Loaded` / `Overloaded`,
`ArmorTooHeavy`, `NoDodge`), one read-out each (`CarryLoad`, `ArmorSvShort`,
`StanceBlocksDodge`) and their consequences (`OverloadEffect.*` keyed by
`carryState`, `ArmorEffect`, `DodgeEffect.*` keyed by whether a parry remains).
The resolver names the key and the sheet only localizes it, which is what keeps
`game.i18n` out of the condition rules.

## Adding a new config entry (skill, ability, category)

Adding an entry to `CONFIG.TNO.*` in
[`config.mjs`](../../../module/helpers/config.mjs) means adding its
`label`/`hint` key to **both** language files — the config object only
ever stores the key string, never the display text.
