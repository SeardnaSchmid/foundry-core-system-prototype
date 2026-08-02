---
type: concept
title: Active effects
description: How Foundry ActiveEffects are managed and categorized in this system, and the legacyTransferral setting.
tags: [active-effects, config]
resource: module/helpers/effects.mjs
related: [architecture/bootstrap]
---

# Active effects

[`module/helpers/effects.mjs`](../../../module/helpers/effects.mjs) is the
small wrapper used by
[`actor-sheet.mjs`](../../../module/sheets/actor-sheet.mjs). Active Effects
are intentionally not exposed on item sheets. In particular, the freely
written effects of a consumable are rule text, not Foundry Active Effects.

Old or externally imported effects may still exist on item documents, but the
system's item sheets provide no controls to view, create, edit, toggle, or
delete them.

## `CONFIG.ActiveEffect.legacyTransferral = false`

Set once in `init` (see
[bootstrap.md](../architecture/bootstrap.md)). With this off, effects are
**never automatically copied** from an Item onto its owning Actor; an
effect on an item only applies to the actor if the effect's own `transfer`
property is `true`. Any code reasoning about "does this actor have this
effect" needs to account for effects still living on owned items, not just
`actor.effects`.

## Categorization

`prepareActiveEffectCategories(effects)` buckets effects for sheet
rendering into three groups: `temporary` (has a duration, i.e.
`effect.isTemporary`), `passive` (no duration), `inactive`
(`effect.disabled`). `disabled` takes priority — a disabled temporary
effect shows under `inactive`, not `temporary`.

## Control actions

`onManageActiveEffect(event, owner)` handles the actor sheet's
`.effect-control` button row: `create` (new effect with a default aura icon,
origin set to `owner.uuid`, seeded `duration.rounds`/`disabled` from the
clicked category), `edit` (opens the effect's own sheet), `delete`, and
`toggle` (flips `disabled`).
