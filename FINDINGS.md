# Findings — Inventory redesign (branch `feat/inventory-carry-slots`)

Review of the uncommitted working tree: the TODO Phase 1 + §2.1 implementation
plus today's paper-doll 75/25 split and movement-chip recolour. Nothing here is
fixed; this is the list.

Evidence was gathered live against the working-tree world on `:30000`, mostly
against a scratch actor loaded to straddle the capacity boundary
(cap 12, used 14 — items of 1, 3, 6 and 4 slots, four-column sidebar raster).

---

## A. Correctness

### A1 — A straddling item shows no overflow warning at all

`#slotCells` (actor-sheet.mjs) sets `over = index >= inside`, and the template
renders the warning triangle only inside `{{#if cell.first}}`. For a block that
*straddles* the boundary, cell 0 is inside the budget, so `cell.over` is false
and the icon never renders.

Measured on the scratch actor: `over-capacity` cells = 2, `.slot-overflow-icon`
elements = **0**. The item responsible for the overload is drawn entirely green,
carrying its icon and name; the only red in the grid is two blank continuation
cells with no indication of what they belong to.

This is the case TODO §1.3 exists for. The whole point of allowing a straddle
(§1) was that the overload should read as *part of that item* — right now it
reads as two anonymous red rectangles.

### A2 — One item, two contradictory tooltips

Same block: its green cells carry `TNO.Inventory.CellHint`, its red cells carry
`TNO.Inventory.OverflowHint`. Both live strings, on one item:

```
<strong>Ein sehr langer Gegenstandsname…</strong><br>… <br>Klicken zum Öffnen · ziehen zum Sortieren …
<strong>Ein sehr langer Gegenstandsname…</strong><br>… <br>Passt nicht mehr in die Inventarslots — kostet Bewegung.
```

Hovering the left half of an object and the right half of the same object gives
opposite answers to "does this fit". The stat block should say the item is cut
by the boundary, once, in one wording.

### A3 — The tooltip double-reports quantity

`itemSlotCost()` is already `max(slots, floor) × quantity`
([inventory.mjs:140](module/helpers/inventory.mjs:140)), and `#slotStats` then
appends `×{quantity}` next to that number. A 1-slot item at ×3 renders:

```
Gegenstand · Inventarslots 3 · ×3
```

which reads as "3 slots each, three of them" — i.e. 9. Either show the per-unit
cost next to the multiplier, or the total without one.

### A4 — A wrapped multi-slot label is hard-clipped mid-glyph, not ellipsised

`.slot-cell.slot-first.slot-joined` sets `overflow: visible` so the label can
run across its own run, bounded by
`max-width: calc(var(--slot-run) * (100% + gap) - gap)`. But `--slot-run` is the
*full* span, and the run may wrap — the cells it is being allowed to reach are
on the next row. With `overflow: visible` on the cell, `text-overflow: ellipsis`
cannot fire, so `.slot-grid { overflow: hidden }` cuts the text at the raster
edge instead.

Measured: 4-slot item starting in column 3, label right edge **1302.6px**, grid
right edge **1300.5px** — cut mid-character, no ellipsis.

The `max-width` needs to be the *remaining columns in this row*, not the span.

### A5 — Dark label text over the warning fill

`.slot-name` has no colour of its own; `over-capacity` sets `color: $c-white` on
the **cell**. The label lives in cell 0 and spills across the run. So a straddle
whose first cell is inside the budget paints `rgb(34,34,34)` text across
`rgb(122,32,40)` cells — roughly 2:1 contrast.

In the measured case the wrap happened to hide it. A straddle that does not wrap
(common in the five-column Inventar-tab raster) will show it.

### A6 — Keyboard focus ring is clipped by the grid

`[tabindex]:focus-visible` draws `outline: 2px solid` at `outline-offset: 1px`
([_resource.scss:10](src/scss/components/_resource.scss:10)), and `.slot-grid`
gained `overflow: hidden` for the weld bleed and the label spill. Cells sit
flush against the grid box — measured first-cell top **671.2** vs. grid top
**671.2**, last column right edge within a pixel of the grid's.

So cells on the top row and in the last column lose part of their focus ring.
That ring is the only thing making the new tab stops traceable, and the grid is
now the only mouse-free route to a carried item's sheet.

### A7 — Drag state survives a mid-drag re-render

[actor-sheet.mjs `_onDragStart`](module/sheets/actor-sheet.mjs:1320) hangs all
cleanup off a `dragend` listener attached to the grabbed cell. Any re-render
during the drag (another client updating the actor, an effect ticking, a
`system.carried` write) replaces that node, so `dragend` never fires:

- `#dragging` keeps a stale `Item` reference,
- `.dragging-item` stays on `this.element`, which *is* persistent across
  renders — so every free cell keeps its "drop here" highlight indefinitely.

Cheap fix: bind the cleanup to the persistent root as well, or clear the state
at the top of `_onDragStart`/`_onRender`.

### A8 — 70% of the zero-slot column is an inert drop target

The column stretches to the card height (`align-items: stretch`). Measured:
198px tall, **142px of it empty**. A drop on that empty part hits neither
branch — `_onDrop` looks for `[data-zone]` or `.slot-empty`, and core's
`_onSortItem` path needs `closest('[data-item-id]')`, which finds nothing above
a bare `.slot-trinkets`. The drop silently does nothing on a surface that is
bordered, tinted, and sitting next to live drop targets.

### A9 — Sort siblings are scoped to one container, but `sort` is global

`_onSortItem` collects siblings from `dropTarget.parentElement.children`.
`item.sort` is global across the actor's items, so `performIntegerSort` is
reindexing against a partial view of the list. This pre-dates today, but moving
the zero-slot items into a *different card* makes a grid→trinket-column drag
look like a deliberate gesture rather than an accident, and it now resolves
against a sibling set that excludes everything in the grid.

---

## B. Layout and visual

### B1 — The 3fr/1fr split has no floor

Measured `grid-template-columns` on `.paperdoll.has-loose` as the sheet narrows:

| Sheet width | Zones | Zero-slot column | Names ellipsised |
|---|---|---|---|
| 1090px | 396.8px | 132.3px | 0 of 3 |
| 900px | 244.9px | 81.7px | 2 of 3 |
| 760px | 187.5px | 62.5px | 3 of 3 |
| 660px | 146.4px | 48.8px | 3 of 3 |

At 660px the column is 48.8px: minus 16px padding, a 14px icon and a 4px gap
leaves roughly 23px for the name — two characters. The armour rows lose too
(146px, still owing room to three RH/RW/RA read-outs). A `minmax(<floor>, 1fr)`
or a container query that drops `has-loose` below some width would hold this.

### B2 — The card's own heading is now wrong

`aside-title` is `TNO.Armor.WornTitle` ("Worn"/"Inventar & Ausrüstung" heading
above the doll), and the card underneath it now also contains *carried,
unworn* gear. The heading asserts something false about a third of its content.

### B3 — An almost-empty tinted box

Consequence of the stretch: with one or two loose items you get a ~200px
bordered recess holding two lines. Either let the column size to its content
(`align-self: start`) or make the emptiness mean something.

### B4 — The strike-through no longer contrasts with what it strikes

`.chip-move.move-blocked` now paints `color: $c-white` with
`text-decoration-color: rgba($c-white, 0.8)` — the line and the glyph are the
same colour. Previously the strike was red ink over dark ink and did its own
work. A darker strike, or dropping the line now that the fill carries the
meaning, would both be more honest.

### B5 — The recolour asserts an equivalence that isn't always true

The chip's own tooltip says the sprint tier is lost when *either* half the slots
are used *or* Beweglichkeit is damaged. Painting the chip identically to an
over-capacity carry cell says "this is the load" even when it is the injury. The
comment I wrote hedges with "usually", which is a smell — the paint should
either distinguish the two causes or the comment shouldn't need the hedge.

---

## C. Scale

### C1 — Quantity drives DOM node count, uncapped

`itemSlotCost` is slots × quantity and `#slotCells` emits one `<div>` per slot,
each with its own `data-item-id` and `data-tooltip-html`. A 1-slot item at ×99
emits 99 cells. Before this change it was one element with `--slot-span` clamped
by a CSS `min()`.

Capping the cells would hide load, which §1.3 forbids — but "99 divs" is not the
only alternative to "hide it". A run could be collapsed past some length with
the count shown on the block.

### C2 — `#clearDropMarkers` runs on every `dragover` tick

A full-sheet `querySelectorAll('.drop-before, .drop-after, .drop-into')` plus
classList writes, at pointer-move frequency. Almost certainly fine at this sheet
size; noted because it is trivially avoidable by tracking the last marked node.

---

## D. Tests and process

### D1 — The subtlest change has no test

`_onSortItem`, `#slotCells` and `#slotStats` are members of the sheet class; the
vitest suite is deliberately Foundry-free and cannot reach them. The duplicate-
sibling sort corruption that *motivated* the `_onSortItem` override therefore
has no regression test — the exact bug most likely to silently return.

`buildSlotGrid` is well covered (4 new tests, 125 passing). Everything above the
helper is not.

### D2 — `npm run test:e2e` has not been run against any of this

The only assertion touching this area is
[sheet-derived.spec.mjs:64](tests/e2e/specs/sheet-derived.spec.mjs:64)
(`.slot-grid-count` reads `0/17`). Nothing covers the cell grid, the zero-slot
column, the drag indicator, or the delete dialog.

### D3 — Docs are stale (deferred on purpose, listed so it isn't lost)

Per `CLAUDE.md` these come last, once the code is final. Currently wrong:

- `docs/wiki/concepts/inventory.md:198` — "A block only stays inside the budget
  if it fits there **whole**". Inverted by §1.
- `docs/wiki/concepts/inventory.md:161` — "Core's `ActorSheetV2#_onSortItem`
  does the whole job". It is now overridden, and why matters.
- `docs/wiki/concepts/inventory.md:60` — `buildSlotGrid` return shape; `blocks`
  entries now carry `inside`/`outside`.
- `docs/wiki/concepts/inventory.md:163,182` — "the zero-slot band"; it is a
  column in the paper-doll card now, not a band under the grid.
- `docs/wiki/reference/ui-surfaces.md:19` — `item/parts/item-delete.hbs` is not
  registered in the template table; the paper-doll row's description predates
  the third column.
- `docs/design/character-sheet-prd.md:103` — the Trageslots bullet restates both
  the whole-block rule and the band-under-the-grid layout.
- `docs/design/character-sheet-prd.md:138` — the Localization list has no
  `TNO.Item.*` entry for the new delete strings.
- `TODO.md` — delivered sections not struck.

`npm run docs:check` passes regardless: it validates `resource:` pointers, not
prose, so none of the above fails CI.

### D4 — Scratch actor still in the world

`ZZ Slot Test` on `:30000`, repopulated during this review with four items
chosen to force a straddle and a wrap (1, 3, 6 and 4 slots). Useful for
reproducing A1/A4/A5; delete it before the branch is done.

---

## E. Deviations from the plan, recorded

Not defects — decisions taken during implementation that the plan did not
specify.

1. **`data-tooltip-html` instead of `data-tooltip`.** v14's `data-tooltip` runs
   `game.i18n.has(text)` first and can localize a stat block by accident.
   `data-tooltip-html` is the documented HTML attribute and shares the same
   hover-timer path.
2. **The gap test in `tests/helpers/inventory.test.js` had to change**, contrary
   to the plan's claim that it "must keep passing" — under the new rule the
   middle item straddles and stays in `blocks`. Intent preserved, assertions
   rewritten.
3. **The overflow note was keyed off `overflow.length`** and vanished for a
   straddle. Now keyed off `slotGrid.over`.
4. **Two `title=` attributes left unconverted** — the `Keine Tasche` badge and
   the `+` add button in the grid header. The plan scoped the tooltip swap to
   `.slot-cell` and `.slot-trinket`.
