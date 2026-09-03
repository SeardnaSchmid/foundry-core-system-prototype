# Header Banner - Product Requirements Document

**Version:** 1.1
**Last Updated:** 2026-09-02
**Status:** Implemented, following wireframes 4b/5a for the band and 5b for the
derived strip

---

## Table of Contents

1. [Overview](#overview)
2. [What is wrong today](#what-is-wrong-today)
3. [Principles](#principles)
4. [Target layout](#target-layout)
5. [Lane 1: Identity](#lane-1-identity)
6. [Lane 2: Vitals](#lane-2-vitals)
7. [Lane 3: State](#lane-3-state)
8. [The condition panel](#the-condition-panel)
9. [What leaves the header](#what-leaves-the-header)
10. [Responsive behaviour](#responsive-behaviour)
11. [Accessibility](#accessibility)
12. [Implementation notes](#implementation-notes)
13. [Localization](#localization)
14. [Acceptance criteria](#acceptance-criteria)
15. [Open questions](#open-questions)
16. [Document History](#document-history)

---

## Overview

`.sheet-banner` is the band above the tab body of the character sheet — portrait,
identity and the meta read-outs a player checks without switching tabs. This
document is the spec of record for that band and for every feature in it. It
supersedes the Banner section of
[character-sheet-prd.md](character-sheet-prd.md), which now points here.

The rest of the sheet is unchanged and stays in that document; the mechanics
behind each value stay in [combat-workflow-prd.md](workflows/combat-workflow-prd.md),
[problem-solving-prd.md](workflows/problem-solving-prd.md) and
[dice-system-prd.md](dice-system-prd.md). This document decides **which meta
features exist in the header, what each one is for, and where the ones that
leave it go.**

---

## What is wrong today

The band carries thirteen elements in three stacked rows of the right-hand lane,
and every one of them is rendered as a pill of the same visual weight. Nothing
in it reads as primary, and the grouping the markup declares — permanent state
above, combat state below — does not survive contact with the contents.

| # | Element | Kind | Read when | Interaction |
|---|---|---|---|---|
| 1 | Portrait | identity | — | edit image |
| 2 | Name | identity | — | text field |
| 3 | Role | identity, flavour | — | text field |
| 4 | XP spent / acquired | progression | between sessions | read-out |
| 5 | Bewegung, three tiers | derived from Beweglichkeit | in combat | none |
| 6 | Edge-Pool | resource | mid-roll | number field |
| 7 | Zustände chip | condition collection | in combat | expander |
| 8 | Haltung | combat state | every round | picker |
| 9 | 6. Sinn | roll | occasional | rolls |
| 10 | Initiative | roll | once per fight | rolls |
| 11 | Wucht / Schaden tracks | state | in combat | steppers |
| 12 | Malus | derived, said out loud | every roll | read-out |
| 13 | Condition raster, 3×2 | condition editor | in combat | cycles a light |

Four concrete defects follow from that table.

**One model, two equal surfaces.** The Zustände chip's condition summary (#7) and
the 3×2 raster (#13) render the same conditions twice, at the same size, one row
apart. The raster carries six of the nine and can be edited; the chip carries all
nine and cannot. Neither is a summary of the other — they are two peers, and a
reader has to learn which is which.

**One number, three renderings.** The Edge chip (#6) draws the reserve as pips,
as a number field, and as `/max`. Only the field sets it: the pips are read-only
display ([actor-sheet.mjs:2081](../../module/sheets/actor-sheet.mjs)), although
the template comment beside them still claims a click sets the pool. The pill is
the widest in the lane and says one thing.

**Rolls in a state band.** 6. Sinn (#9) and Initiative (#10) are the only two
elements in the header that roll dice. They sit among eleven read-outs, styled
identically to them, in the row the markup labels "der Kampfzustand" — but a roll
is not a state.

**The grouping cuts across the questions.** Row one holds a movement read-out, a
problem-solving resource and a combat-condition collection; row two holds a
combat state and two rolls; the damage block holds a read-out, an editor and a
second condition surface. There is no question a player asks that is answered by
exactly one row.

Two statements in the current PRD are also stale and are not carried forward: the
Haltung bullet describes "the adjacent repeat action", which the picker replaced
when every option became a button
([combat-workflow-prd.md](workflows/combat-workflow-prd.md#haltung)), and the
Problem-Solving bullet implies the pips are interactive.

---

## Principles

**P1 — The identity lane holds what is true about the character; the meta lane
holds what is true right now.** This is the cut the current two-row split was
reaching for and missed. The shipped layout applies it to *what leaves the
band*, not to which lane a survivor lands in: the vitals stay with the identity
(see [Target layout](#target-layout)) while the meta lane narrows to controls
only. Damage, conditions, Haltung and the remaining reserve
pass it. The movement tiers, the 6. Sinn value, the Initiative value and the XP
totals do not: they are properties, and a property that changed since last
session is not news.

**P2 — One fact, one surface.** A read-out and its editor may be two surfaces —
that is a summary and a detail. Two surfaces of the same weight, both showing the
same model, are a defect.

**P3 — The consequence belongs on the figure it takes away.** Carried over
unchanged from the current design, where it is why a lost movement tier is struck
through at the number rather than badged elsewhere. It is also why the derived
conditions still name what they cost.

**P4 — Naming an effect is not enforcing it.** Carried over unchanged. The header
states the character's condition; the table applies it. Only the three derived
conditions describe something the system already did on its own.

**P5 — The band's height is the portrait's height.** The portrait is 150–170px
and sets a floor the band cannot go below. Any lane that makes the band taller
than that floor is spending height it did not have to.

---

## Target layout

Three lanes, as today, but the right-hand lane now carries nothing but the three
state pills, and the vitals it used to hold join the identity lane.

```
┌──────────┬──────────────────────────────┬───────────────────────────┐
│          │  Name                  ┌──┐  │  ( Haltung   Sprint ▾ )   │
│ portrait │                        │−4│  │  ( Zustände       ●●◐ )   │
│          │  Rolle       840/907 xp└──┘  │  ( Edge        ◆◆◆◇◇ )    │
│          │  WU ▪▪▪▪▫▫▫▫  SC ▪▪▪▪▪▪▫▫    │                           │
└──────────┴──────────────────────────────┴───────────────────────────┘
```

- **Identity lane** — the name with the malus on its baseline, the role and XP
  subtitle, the two damage tracks beneath, and the Zustände row under those. The
  malus, the tracks and that row are all read-only doors onto the condition
  panel. The conditions sit here rather than in the meta lane because they are
  derived from the tracks directly above them: the track is the cause, the
  condition the consequence, and a lane that separated them would make the
  reader carry the connection across the band.
- **State lane** — two pills stacked as a list: Haltung and Edge. Both are
  things the player *chooses*, not things that happened, and their labels align
  down the lane's left edge.

Nothing else is in the band. The malus is typographically dominant, the tracks
and the state pills are secondary, and the subtitle is quietest — three levels
where there is currently one.

**The vitals sit in the identity lane, not the meta lane** (wireframe 4b). This
is the one place the layout departs from **P1**, deliberately: the malus is
announced together with the character's name, so it is read on that baseline,
and the tracks hang under the sentence they belong to. What **P1** buys in
exchange is a right-hand lane that holds nothing but controls — every element in
it opens something, which is a stronger rule than the one it gives up.

---

## Lane 1: Identity

Unchanged from the current implementation. Restated here because this document is
now the spec of record for the whole band.

- **Portrait:** `actor.img` in a responsive 150–170px square, `object-fit: cover`
  with a face-friendly `center 20%` focus, overhanging the band's bottom edge in
  normal grid flow. Owners activate it by pointer or keyboard for Foundry's image
  picker and get a quiet edit pill on hover/focus; read-only viewers get an
  ordinary image with no false affordance.
- **Backdrop:** one `aria-hidden` decorative copy of `actor.img` at `center 38%`,
  desaturated and darkened, under a single angled charcoal-to-transparent
  gradient. No blur on the image, no second accent colour, no separate actor
  data, no interaction.
- **Name:** the editable character name, the band's headline, in a 280px lane
  protected until the sheet is narrower than 520px.
- **Subtitle:** the free-text `system.role` — flavour with no mechanical weight,
  read by no roll or gate — followed by the computed spent/acquired XP read-out.

XP stays here rather than moving out with the other properties: it is part of the
identity line's sentence, not a meta chip, and it costs no lane of its own.

---

## Lane 2: Vitals

The one thing in the band that changes minute to minute and is said out loud.
It shares the identity lane rather than owning one of its own: the malus stands
on the name's baseline, the tracks on the line below the subtitle.

**The malus is the headline.** `−(Schaden + Wuchtschaden)`, the largest figure in
the band, on the name's own baseline. Every roll in the system announces it,
which is the whole argument for its size.

**It is drawn only when it is a figure** — from `−1` down, or from `+1` up should
anything ever add to a roll rather than take from it — and carries its sign
explicitly. At zero the cell is left out entirely. The dimmed `0` this replaces
was there to stop a vitals *row* from changing shape when damage cleared; in the
shipped layout the malus sits inline after the name, so nothing collapses when
it goes, and the tracks beneath it already say the character is unhurt.

**Kampfunfähig** gives the malus cell the warning-red fill and a warning glyph
before the figure — a state, not a second read-out, and still enforcing nothing.

**Two counted box rows**, Wuchtschaden above Schaden, against one shared capacity
mark at trained Stärke. Boxes rather than a proportional bar, and the mark stays
put while damage grows past it rather than the track rescaling: at this capacity
counting is faster than reading a length. What a box means is unchanged — filled
blue is Wucht still on its track, filled red is the raw Schaden pool, and a box
past the Schaden row's mark *is* Kampfunfähig rather than a second announcement
of it.

**The rows are read-only here**, and they always stack — Wucht on the upper
line, Schaden on the lower — at every lane width. Side by side, the two runs of
boxes read as one long strip with a divider in it; stacked, the fixed-width tags
align both runs into a column that can be compared straight down. Steppers, the
clear-both action and the condition raster all move into the panel. This is the one duplication the design
accepts, and it is a summary/detail pair under **P2**: the band answers *how hurt
am I* and *am I down*, the panel answers *by how much and from what*. Damage is
read far more often than it is entered — it is entered once per resistance roll —
so the editor is the half that earns a click.

**Naming.** Two rows of unlabelled boxes do not explain themselves and the full
German words do not fit, so each row keeps its two-letter tag. The row tooltip
carries the pool name, raw value, free remainder, capacity and converted count,
as today; the panel spells all of it out in words.

---

## Lane 3: State

Three pills stacked as a list, all controls, all answering *what may I do right
now*. Stacked rather than laid out in a row so their labels align down one edge
and the lane reads as what it is — a short column of things that open. Below
980px the lane moves under the identity and the pills wrap into a row.

### Haltung

A persisted combat-stance picker, unchanged in behaviour. Opening it shows all
nine Haltungen at once, grouped into Grundhaltung / Bewegung / Kampf / Erholung,
with a panel naming the pointed-at Haltung's effect and the defences it permits.
Every option is a button, so retaking the Haltung already in force — the act that
clears both repeated-defence counters — needs no separate control.

It leads the state row because it is the element changed most often during a
fight and the one that decides whether a defence exists at all. The actions it
unlocks stay where they are met: Ausweichen at the paper doll, Parade at the
weapon.

Not `disabled` when read-only — a disabled button fires no pointer events, and
the tooltip is exactly what someone reading another player's sheet is after. The
click is gated on `editable`.

### Zustände

The one collection of every active condition on the character: the six damage
warnings and the three the rules apply on their own — a Haltung without
Ausweichen, the carry load at its two severities, and armour whose summed
Stärkevoraussetzung is not met.

The row names each active condition in full, severity-sorted, severe before
mild. Nine at once is the arithmetic maximum, not the case worth designing for:
a character normally carries none, one or two, so the row is usually empty and
occasionally short. A code — pictogram or abbreviation — only pays off when the
strip is habitually crowded, and buying the rare case costs the common one its
legibility. The crowded case is handled by truncation instead: the worst three
are named and the remainder becomes a `+n` counter, with the panel behind the
row carrying the complete list. That is also what finally makes the row a
summary of the panel rather than its peer, which is the defect this document
opened with.

With nothing active the row is not drawn at all. An empty placeholder would hold
a line to say nothing, and the panel stays reachable through the tracks and the
malus cell, which are already doors to it.

A manually forced damage condition carries a small blue corner point. The row
keeps the band's neutral glass treatment at all times — only the
boxes inside the panel take the classification fill (negative warning red,
positive ready green, neutral item-action blue). Activating it opens
[the panel](#the-condition-panel).

**Why the collection is the surface and the raster is not.** Under **P2** one of
the two has to become the detail. The collection wins because completeness is
what a *what shape am I in* surface owes and it is the only one of the two that
holds all nine; the raster is a damage-specific editor with a fixed anatomical
geometry, which is exactly what belongs beside the tracks it edits, one click
away.

### Edge

The remaining Edge-Pool, as pips only: one pip per point of
`derived.edgePoolMax`, filled to `derived.edgePool`. The number field and the
`/max` suffix are dropped — five pips with three filled already says `3/5`, and
under **P2** the pill was drawing one number three ways.

It stays in the band, and in the state row rather than the vitals row, because
the reserve passes **P1** — it is spent during play and gates a decision made
mid-roll — but it is not a combat vital and does not belong beside the malus.
Neither of its thresholds nor any of its actions live here: Geistesblitz is a
toggle in the roll dialog, Fehler finden and Fehleranalyse are buttons on a
failed roll's chat card. The derived thresholds stay in the pill's tooltip.

**Setting the reserve.** The band loses the number field, so the manual
correction — an off-mechanic spend, announced in chat on a decrease and silent on
an increase — moves into the pill's own popover along with the thresholds. It is
a GM/admin correction and does not need a permanently visible input.

---

## The condition panel

One panel, opened from the Zustände row or from the vitals row. It is the single
surface on which the character's condition is edited, and it holds in one place
everything the band used to spread across a raster, four steppers and a clear
button.

**Section 1 — Schaden.** The two tracks again, now with their stepper pair per
row behind the mark, the clear-both action while there is damage to clear, and
the figures the band could only fit in a tooltip written out: pool name, raw
value, free remainder, capacity, converted count. Each stepper writes its raw
pool, unclamped upward and clamped at zero.

**Section 2 — Zustände.** The 3×2 raster with all six fixed positions visible —
Wuchtschaden over Schaden, core / legs / arms left to right — directly under the
tracks that drive it, so a stepper and the light it lit are finally adjacent.
Owners cycle a light automatic → manually set → manually negated → automatic; a
manual choice carries the hand badge, a negated light is dashed and struck
through. Read-only viewers get the same tooltips on non-interactive elements.

**Section 3 — the rows.** Every active condition, severity-sorted, each reading
**condition → effect → threshold** in that order: the effect is what the row is
for and the comparison that switched it on is the footnote. The effect line takes
the panel's own ink rather than the warning red — nine red paragraphs would be a
wall where the filled glyph box already says the entry is negative. A neutral
empty state when there are none.

The three derived conditions appear in section 3 only, never in the raster. The
raster's geometry is the six damage positions, and none of the three takes an
override: they are arithmetic on the slot budget, on the summed
Stärkevoraussetzung and on the Haltung's defence list, and forcing one would only
be forcing a wrong number. The six damage warnings are readings an owner may
disagree with, which is why only they are clickable.

**Chrome.** The panel is an anchored popover sharing the Haltung picker's
chrome, not an inline `<details>`. That is what retires
`.sheet-banner:has(.status-component[open]) { z-index: 30 }` — lifting the
banner's whole stacking context so a panel can escape it is a workaround for
painting the panel inside the band in the first place. A pointer click outside
closes it; Escape closes it.

---

## What leaves the header

### Bewegung, 6. Sinn and Initiative → a derived-values strip in the Basics tab

All three fail **P1**, and they have a stronger thing in common than the band
ever gave them: each is a pure function of base attributes.

| Value | Formula |
|---|---|
| Initiative | `ceil((2 · Beweglichkeit + Wahrnehmung) / 3)` |
| 6. Sinn | `round((Wahrnehmung + Empathie + Auffassung) / 3)` |
| Kriechen · Gehen · Sprinten | `ceil(Beweglichkeit / 3)` · `Beweglichkeit` · `3 × Beweglichkeit` |

They go to a compact strip directly under the attribute matrix, in the Basics
tab's leftmost column — beside the values that produce them, in the tab that
opens by default, so they stay above the fold. Its shape is wireframe **5b**: Initiative
and 6. Sinn as two roll buttons sharing one row half and half, each with its name
on its own line above the value and the dice notation it rolls (`1d10+4`,
`3d20`), then the three Bewegung tiers on a second, full-width dashed read-only
line. That costs about 40px more height than 5a's single
three-cell row and buys both the spelled-out formula and a line that says
without a word that nothing on it is to be clicked. Initiative and 6. Sinn keep their
behaviour exactly: `1d10 + @derived.initiative` through the generic `data-roll`
path, and a plain 3d20 against `derived.sixthSense` with no modifiers, no
advantage and no pre-edge (`edgeExempt: true`) because an instinctive reaction is
not a deliberate check.

**Bewegung keeps its strike-through with it.** A tier the load has taken away is
struck through in the warning red — sprint once the load reaches half the carry
budget, walk as well once the load is `crawlOnly`. Under **P3** the consequence
stays on the figure it removes wherever that figure lives; only its address
changes. The load itself remains a Zustände entry in the band, so the *loss* is
still visible without leaving the header.

### The raster, the steppers, the clear action, the Edge field → the panels

Covered above. None of them is deleted; all four move behind one click each.

### Nothing else

The header does not gain any feature it does not have today. Candidates that were
considered and rejected: the carry budget (its surface is the slot grid, and the
band already carries its consequence as a Zustände entry), unspent XP (a
between-sessions number that fails **P1**), and money (bookkeeping, and already
has a column).

---

## Responsive behaviour

`.window-content` remains the named `character-sheet` inline-size container; the
breakpoints follow the resizable sheet, not the viewport.

- **≥ 980px** — the three lanes side by side as drawn above; the Zustände row
  wraps inside the identity lane rather than widening it. The band's height is
  the portrait's, per **P5**.
- **< 980px** — the meta lane moves beneath the identity while the portrait stays
  left, as today. The vitals row stays above the state row.
- **< 520px** — the portrait scales to 132–150px and the protected 280px name
  lane finally yields; the headline scales with it.

The state pills wrap within their row before they may squeeze the name lane. The
vitals row does not wrap: the tracks shorten by dropping to a narrower box before
the malus figure gives up any size, because the malus is the one figure that is
read across the table.

---

## Accessibility

Every control in the band is a native `<button>` — the Haltung pill already is,
and the Zustände and Edge pills become one when they stop being an `<a>` and a
`<details>` summary. With both rollables gone from the header, **nothing in the
band depends on `_makeKeyboardAccessible()` except the portrait image**, which
keeps its action-specific accessible label; its visible edit pill stays
decorative and hidden from assistive technology.

The panels are dialogs: `aria-haspopup="dialog"` and `aria-expanded` on the pill
that opens them, focus moved into the panel on open and returned to the pill on
close, Escape to close.

The Zustände row's accessible name carries the count, and the panel's rows carry
the wording. Colour is never the only carrier of a condition's severity — each
chip is the condition's own name, so a dim fill costs nothing, and the state is
written out in each panel row.

---

## Implementation notes

- Sheet class: [`TnoActorSheet`](../../module/sheets/actor-sheet.mjs). Band
  markup: [actor-character-sheet.hbs](../../templates/actor/actor-character-sheet.hbs),
  with one partial per element:
  [actor-malus.hbs](../../templates/actor/parts/actor-malus.hbs),
  [actor-damage.hbs](../../templates/actor/parts/actor-damage.hbs) (the tracks,
  now read-only), [actor-status.hbs](../../templates/actor/parts/actor-status.hbs)
  (a `<button>` instead of a `<details>`, in the identity lane) and
  [actor-edge.hbs](../../templates/actor/parts/actor-edge.hbs). The two panels are
  [condition-panel.hbs](../../templates/actor/parts/condition-panel.hbs) and
  [edge-popover.hbs](../../templates/actor/parts/edge-popover.hbs); what leaves
  the band is [actor-derived.hbs](../../templates/actor/parts/actor-derived.hbs)
  (Initiative and 6. Sinn, under the attribute matrix) and
  [actor-movement.hbs](../../templates/actor/parts/actor-movement.hbs) (the
  tiers, closing the worn-gear column under the SV total that strikes one
  through).
- Both panels are body-level `popover="auto"` elements built in `_onFirstRender`
  beside the four the sheet already owns, and their controls are bound on the
  popover rather than through the sheet's delegation: a popover is a child of the
  host document's body and never of `this.element`. A stepper press re-renders
  the sheet, so `_onRender` redraws an open panel and puts the keyboard back on
  the control it was on, found by `data-focus-key`.
- Layout: [`_forms.scss`](../../src/scss/components/_forms.scss), `.sheet-banner`
  onward. The grid areas go from `portrait identity chips` to
  `portrait identity state`; the panels' own frames are `condition-popover` and
  `edge-popover` variants in
  [`_item-popover.scss`](../../src/scss/components/_item-popover.scss).
- No data model changes. `system.combat.stance`, `system.damage.{sharp,blunt}`,
  `system.conditionOverrides` and `system.problemSolving.spent` are untouched, so
  there is no migration.
- The condition model is unchanged:
  [`resolveConditions()`](../../module/helpers/conditions.mjs) already returns
  `items`, `rows`, `active` and `hasActive`, which is exactly the split the pill
  (`active`), the raster (`rows`) and the panel (`items`) need.
- [`damageTrackRows()`](../../module/helpers/damage.mjs) is unchanged and is read
  by both the band's read-only tracks and the panel's editable ones.
- The stale comment in `actor-character-sheet.hbs` claiming a click on an Edge
  pip sets the reserve goes with the pill's rewrite.

---

## Localization

The redesign is close to key-neutral: it moves surfaces, not wording.

**Reused unchanged:** `TNO.Damage.*` for the tracks, malus, steppers and clear
action — `TNO.Damage.Sharp` / `Blunt` become *visible* labels in the panel where
there is width for them, rather than tooltip-only text. `TNO.Status.*` for the
nine condition names, effects, states, the raster label and the cycle hint.
`TNO.Combat.Stance*` for the picker. `TNO.Derived.*` / `DerivedShort.*` /
`DerivedHint.*` for the strip that leaves the header, including
`DerivedHint.NoSprint` and `CrawlOnly` on a struck-through tier.

**New keys:**

| Key | For |
|---|---|
| `TNO.DerivedTitle` | the Basics-tab strip's heading |
| `TNO.Damage.PanelTitle` | the condition panel's Schaden section |
| `TNO.Status.PanelDamageHint` | the panel's one line on what a raster light is |
| `TNO.EdgeAdjustLabel` | the reserve correction in the Edge popover |
| `TNO.DerivedShort.Movement` | the strip's Bewegung line label — the existing `Derived.Movement*` keys all name one tier |

**Dropped:** `TNO.EdgeValueHint` — the title on the band's number field, which no
longer exists.

---

## Acceptance criteria

Each is a statement about the shipped band, checkable by looking at it. All are
unproven until a test names them.

| # | Criterion | Proof |
|---|---|---|
| 1 | At 1270px the band's height equals the portrait's height plus its padding — no lane makes it taller | — |
| 2 | The band contains at most seven elements: portrait, name, malus (only when non-zero), subtitle, tracks, three state pills | — |
| 3 | No condition is drawn on two surfaces of the band at once | — |
| 4 | No value in the band is drawn more than once | — |
| 5 | Nothing in the band rolls dice | [sheet-derived.spec.mjs](../../tests/e2e/specs/sheet-derived.spec.mjs) asserts `.sheet-banner .rollable` has no matches |
| 6 | Every control in the band is a native `<button>` or form control before `_makeKeyboardAccessible()` runs | — |
| 7 | A read-only viewer sees the same band with no steppers, no clear action and no editable raster | — |
| 8 | Both panels close on outside click and on Escape, and return focus to their pill | — |
| 9 | `.sheet-banner` carries no `z-index` override for an open panel | — |
| 10 | The malus figure is legible at the sheet's 1270px default from normal table distance | — |
| 11 | Initiative, 6. Sinn and the three Bewegung tiers render on the Basics tab's derived strip | [sheet-derived.spec.mjs](../../tests/e2e/specs/sheet-derived.spec.mjs) |
| 12 | The strip's Initiative cell and the combat tracker roll one and the same formula | [combat-initiative.spec.mjs](../../tests/e2e/specs/combat-initiative.spec.mjs) |

---

## Open questions

1. **Does Bewegung really survive leaving the band?** It is a property by **P1**
   and a combat question in practice. The strip under the attribute matrix is on
   the default tab, so it is one glance rather than one click — but if playtest
   says the three tiers are read mid-round, the honest fix is a fourth state pill
   showing only the *current* best tier, not a return of the three-figure chip.
2. **Should the Edge pips stay in the band at all?** They pass **P1**, but every
   action that spends the reserve lives in the roll dialog or a chat card, and
   the band's copy is pure read-out. The alternative is the Basics tab beside the
   skills, which would leave the state row with two pills.
3. **One panel or two?** This document opens the condition panel from either the
   Zustände row or the vitals row, which is one surface with two doors. If that
   reads as ambiguous, the split is Schaden from the vitals row and Zustände from
   the pill — at the cost of separating a stepper from the light it lights again.
4. **NPCs.** `actor-npc-sheet.hbs` has none of this. Whether NPCs ever want a
   condition surface of their own is undecided and out of scope here.
5. **The malus at high damage.** Boxes stop counting at twelve per row
   (`DAMAGE_TRACK_MAX_BOXES`) while the pools are unbounded. The band is correct
   because the malus figure is exact, but the tracks silently stop being a true
   picture past that point — worth deciding whether the panel says so out loud.

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-09-02 | Initial PRD: extracts the banner from character-sheet-prd.md and specifies the redesign | System |
| 1.1 | 2026-09-02 | Implemented. Target layout follows wireframe 4b — vitals in the identity lane, state pills stacked in the meta lane — and the derived strip follows 5b rather than 5a | System |
| 1.2 | 2026-09-02 | The malus is drawn only when non-zero and carries its sign; the condition panel's raster became six named pills | System |

---
