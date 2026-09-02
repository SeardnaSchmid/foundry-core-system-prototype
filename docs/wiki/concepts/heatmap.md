---
type: concept
title: Attribute heatmap
description: The tunable 3-stop color gradient used to color-grade attribute cells on the sheet.
tags: [heatmap, color, gradient, settings]
resource: [module/helpers/heatmap.mjs, module/apps/heatmap-lab.mjs]
related: [concepts/attributes]
---

# Attribute heatmap

Grades each attribute cell against the rulebook's fixed 1–10 scale (not the
character's own min/max), so a given value always reads the same color.
Logic in
[`module/helpers/heatmap.mjs`](../../../module/helpers/heatmap.mjs), a
dependency-free module; live editor UI in
[`module/apps/heatmap-lab.mjs`](../../../module/apps/heatmap-lab.mjs).

## Config shape

Three color stops (`low`, `mid`, `high`, each `#rrggbb`), `midValue`
(1.5–9.5, where `mid` sits on the 1–10 scale — moving it reallocates how
much of the range each side of the gradient covers), independent
`lowCurve`/`highCurve` exponents per segment (1 = linear; >1 holds close to
the segment's start color before swinging hard near the pivot, for a sharp
"this is bad" cutoff; <1 the reverse).

## Presets

`HEATMAP_QUICK_PRESETS`: 8 are 3-stop approximations of established,
perceptually-uniform scientific colormaps (`viridis`, `plasma`, `inferno`,
`magma`, `cividis`, `turbo`, `coolwarm`, `greys` — chosen so relative
brightness tracks relative magnitude accurately, several colorblind-safe by
design), plus one hand-tuned `banded` preset (the system default) that
demonstrates the curve controls with a sharp low-segment cutoff. Full color
values: see source.

## Where it's stored and applied

Persisted as 6 **client-scoped** settings (each player sees their own
gradient) — see
[hooks-and-settings.md](../architecture/hooks-and-settings.md). `init`
seeds the module-level `activeConfig` from those settings via
`setActiveHeatmapConfig()`; `colorForValue(value, min, max, config?)` reads
from it by default. The `TnoHeatmapLab`
dialog is reachable from the `heatmapLabMenu` settings menu and from a
sheet button; on change it writes back to settings, which broadcasts to all
open sheets via Foundry's socket layer. The colour helper chooses whichever of
the palette's dark and light text colours has the stronger WCAG contrast against
the computed background; the roll dialog can therefore mute unselected heatmap
chips without losing the 3:1 text contrast floor. Those two tones are exported
as `INK_DARK` / `INK_LIGHT` so callers that layer further chrome on a graded
tile can wash it in the tile's own ink — the attribute matrix's value badge and
tile hairline are derived that way in `TnoActorSheet._prepareCharacterData()`.
