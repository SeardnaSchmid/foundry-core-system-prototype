# Character Sheet Redesign — Plan

Based on the use-case workshop (2026-07). Core insight: combat uses the **same
loop** as free checks (roll attribute+skill, adjust attributes for damage, read
item stats) — so there is one main page, no combat mode.

## Locked design decisions

| Topic | Decision |
|---|---|
| Structure | Main page + Inventory tab + Biography tab |
| Attribute matrix | Rulebook grid, **heatmap color grading kept**, plus row/column sums |
| Damage | Steppers on the cell; show `current/base` only when damaged |
| Zero states | Cell marking only (red + icon), consequence in tooltip |
| Skill↔attribute pairing | Fixed default per skill, overridable in roll dialog |
| Skill row | `Name (ATTR current) [rank] → threshold 🎲` — rank editable, threshold computed |
| Skills container | Accordion per category + filter box; empty (WIP) groups hidden |
| Solve pool (Lösen-Vorrat) | Pip tracker in header next to Initiative |
| Automation | Rolling automated (3d20 median, adv/dis, crits); bookkeeping manual |
| XP | **Not** in the layout for now |
| Weapons/armor | Placeholder "Active items" section only — rules not stable yet |

## Target layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [img]   NAME ____________________________   Konzept ______________       │
│  80px   ┌─ INITIATIVE ──┐  ┌─ LÖSEN-VORRAT ─┐                            │
│         │  7   +1d10  🎲 │  │   ◉ ◉ ◉ ◯ ◯    │  ← Klick: ausgeben/füllen │
├─────────┴────────────────┴──────────────────┴────────────────────────────┤
│    [ Hauptseite ]        [ Inventar ]        [ Biografie ]               │
├──────────────────────────────────────────────────────────────────────────┤
│  ATTRIBUTE                                        (aktuell/Grundwert)    │
│  ───────────┬── Körperlich ──┬─── Sozial ───┬─── Geistig ───┬─── Σ ───   │
│  Behaupten  │ STÄ  − 3/4 +   │ AUT  − 4 +   │ WIL  − 4 +   │  11/12     │
│  Anpassen   │ GEW  − 4 +     │ CHA  − 2 +   │ INT  − 4 +   │  10        │
│  Einfluss   │ FIN ⚠− 0/3 +   │ MAN  − 3 +   │ WEI  − 3 +   │   6/9      │
│  Wahrnehmen │ WAH  − 4 +     │ EMP  − 2 +   │ INV  − 2 +   │   8        │
│  ───────────┼────────────────┼──────────────┼──────────────┼─────────    │
│      Σ      │     11/15      │      11      │      13      │  35/39     │
│                                                                          │
│    · Kürzel klicken → reine Attributsprobe (Dialog: ±3er, Vor-/Nachteil) │
│    · „x/y" erscheint nur bei Schaden, unbeschädigt steht da eine Zahl    │
│    · ⚠ = rote Zelle bei 0, Konsequenz im Tooltip („FIN 0: keine Hand-    │
│      aktionen"). Summen zeigen ebenfalls aktuell/Grund bei Schaden.      │
│    · Zell-/Badge-Hintergrund bleibt farblich gradiert (Heatmap, wie      │
│      bisher) — zusätzlich zur roten Null-Markierung und dem x/y-Text.   │
├────────────────────────────────────────┬─────────────────────────────────┤
│  ABGELEITET  (folgt aktuellen Werten)  │  FERTIGKEITEN                   │
│                                        │  ── Kampf ──                    │
│  Bewegung  geh 4 · sprint ⊘ · kriech 2 │  Handgemenge (STÄ 3) [2] → 5 🎲 │
│            ↑ ⊘ = gesperrt bei GEW-     │  Schwerter   (FIN 0) [3] → 3 🎲 │
│              Schaden (Sprint-Sperre)   │  Schießen    (WAH 4) [1] → 5 🎲 │
│  Traglast  ▣▣▣▣▢▢   4/6                │  …                              │
│  6. Sinn   3  🎲                       │  ── Allgemein ──                │
│  Lösen     Idee 3 · Fehler 2 · Anal. 2 │  Athletik    (GEW 4) [2] → 6 🎲 │
│            (Vorrat: siehe Header)      │  Schleichen  (GEW 4) [3] → 7 🎲 │
│                                        │  …                              │
│                                        │  (leere WIP-Kategorien:         │
│                                        │   komplett ausgeblendet)        │
└────────────────────────────────────────┴─────────────────────────────────┘

  INVENTAR-TAB:  [ Aktive Items (Trageslots) — Platzhalter ]
                 [ volle Itemliste wie bisher (actor-items.hbs) ]
  BIOGRAFIE-TAB: [ ProseMirror-Editor, unverändert ]
```

## Phases

### Phase 1 — Attribute matrix: add sums, damage display, zero markers (keep heatmap)

Additive to the existing heatmap — color grading, base/temp mode toggle,
peak detection, and steppers all stay as they are today.

- `module/sheets/actor-sheet.mjs` (`_prepareAttributeGrid` area, ~L130–170):
  - Keep: all existing color/heatmap computation, mode toggle, steppers, delta.
  - Add: row + column sums as `current/base` pairs (show base only when it
    differs), grand total, `isZero` flag per cell (independent of heatmap color).
- `templates/actor/actor-character-sheet.hbs`:
  - Keep the heatmap `<table>` (~L49–95) and mode-toggle toolbar as-is.
  - Add a sum column (Σ) per row and a sum row at the bottom, styled
    consistently with the existing heatmap badges.
  - Add `.zero` class + warning icon at 0 (layered on top of/alongside the
    heatmap background, not replacing it), consequence text in `title`.
- `lang/de.json` / `lang/en.json`: add
  `JOSTER.AttributeZero.{str,dex,fin,…}` tooltip texts (STÄ 0 = tot, GEW 0 =
  nur kriechen, FIN 0 = keine Handaktionen, …).

### Phase 2 — Skills: accordion + filter + computed threshold

Must scale to ~60 skills in 6 groups without redesign.

- `module/sheets/actor-sheet.mjs` (skill prep ~L194–215):
  - Per skill add: `attrValue` (current, damage-adjusted), `threshold`
    (= attrValue + rank).
  - Filter out categories with no skills (invert current "still render
    empty" behavior; remove `SkillCategoryEmptyHint` usage).
  - Group collapse state: per-client (e.g. `localStorage` or user flag),
    default: Kampf + Allgemein open.
- `templates/actor/actor-character-sheet.hbs`:
  - Replace 3-column grid with single-column accordion: clickable group
    header `▸ Label (count)`, skill rows inside.
  - Row: name+attr clickable to roll (existing `data-roll-type="skill"`),
    rank as number input, threshold as bold computed value.
  - Filter input above the list.
- Listeners in `actor-sheet.mjs`: group toggle; filter (substring match on
  localized name, auto-expand groups with hits, hide groups without).
- `src/scss/components/_skills.scss`: new.
- Deferred (explicitly): favorites/pinning, recency sort, "only trained"
  toggle, multi-column accordion.

### Phase 3 — Rollable attribute checks

- `templates/…sheet.hbs`: attribute abbreviation gets `rollable` +
  `data-roll-type="ability"`.
- `module/sheets/actor-sheet.mjs` `_onRoll`: handle ability-only rolls
  through the existing roll dialog (no skill rank, threshold = attr value).
- `module/apps/roll-dialog.mjs`: add attribute dropdown, pre-selected from
  the skill's default attribute, changeable ("Standard + übersteuerbar").

### Phase 4 — Header: concept + solve pool

- `src/datamodels/module/data/actor-character.mjs` (additive, no migration):
  - `concept` StringField.
  - `solvePool` NumberField (current pips; max is `derived.solveReserve`).
- `templates/…sheet.hbs`: concept input next to name; solve pool as
  clickable pips (click pip n → set value), initiative block stays.
- `lang/*`: keys for Concept, SolvePool.

### Phase 5 — Derived block: grouped instead of 10 flat tiles

- `templates/…sheet.hbs` + `actor-sheet.mjs`: group into
  **Movement** (walk / sprint / crawl, sprint shows ⊘ when
  `derived.canSprint` is false), **Carry** (slots as boxes; used-slot count
  is a placeholder until items define slot cost), **Senses** (sixth sense,
  rollable), **Solve** (Idee / Fehler finden / Analyse — Vorrat lives in
  header).
- `module/helpers/config.mjs`: restructure `JOSTER.derivedAttributes` into
  groups.

### Phase 6 — Tabs & inventory placeholder

- Rename/localize tabs: Basics → Main (Hauptseite), keep Items → Inventory,
  Description → Biography (currently hardcoded English in the template).
- Items tab: add "Active items (carry slots)" placeholder section above the
  existing `actor-items.hbs` list. No stats work until combat rules stabilize.

## Explicitly deferred

- XP tracking/display (per-attribute/skill XP, level-up flow)
- Weapon/armor stat blocks, attack/parry/dodge values, hit zones
- Stances, bindings, balance tracking
- Skill favorites, recency sorting
- Tech-debt note: `abilities` live in the DataModel but `skills` still come
  from `template.json` — worth unifying into the DataModel before the skill
  list grows to 60 (additive keys are cheap now, restructuring later is not).
