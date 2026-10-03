---
type: concept
title: Combat turn order
description: Slowest-first activation, the round's activation history, the interrupt, and the one socket this system opens for it.
tags: [combat, initiative, turn-order, tracker, socket]
resource: [module/documents/combat.mjs, module/helpers/round-state.mjs, module/helpers/combat-socket.mjs, module/apps/combat-tracker.mjs, module/helpers/stances.mjs, templates/sidebar/combat-tracker.hbs, src/scss/components/_combat-tracker.scss]
spec: docs/design/workflows/combat-workflow-prd.md
related: [concepts/combat-roll-workflows, architecture/bootstrap, architecture/hooks-and-settings, reference/ui-surfaces]
---

# Combat turn order

The mechanics of record are in
[`docs/design/workflows/combat-workflow-prd.md`](../../design/workflows/combat-workflow-prd.md).
This page maps them to their implementation.

**The slowest combatant acts first.** Everything below follows from that one
sentence, and almost none of it needed new machinery — which is the point worth
carrying away before reading the detail.

## Why the order is not reversed anywhere

[`documents/combat.mjs`](../../../module/documents/combat.mjs) sorts
**ascending** in `_sortCombatants`, so `turns[0]` is the slowest combatant and
Foundry's own turn cursor already walks slow → fast. There is no reversed array,
no `length - 1` first turn, and no forced order list: the activation order *is*
the standard turn order, and the only thing this system adds on top is the
history described below.

`_sortCombatants` has two constraints that are easy to break:

* It is an **instance method that never reads `this`**. Core calls it unbound
  (`this.combatants.contents.sort(this._sortCombatants)` in `Combat#setupTurns`),
  so `this` is `undefined` inside it — and making it `static` would take it off
  the prototype entirely, leaving `sort()` with `undefined` and a lexicographic
  fallback that silently looks almost right.
* Its tiebreak is **locale-independent**. Turn indices are shared state, so a
  `localeCompare` that ordered two names differently on two clients would have
  them disagree about who is activating. Name comparison is a plain `<`/`>`,
  with `id` closing the tie the way core's own does.

Consequence worth knowing: a module that assumes "high initiative = early" reads
this tracker backwards. `combatant.turnNumber` and `combat.current` stay correct,
because they are derived from the same sorted list — but their *meaning* is
inverted relative to a stock system. A system is the right layer to make that
decision at; a module is not, which is why this used to be one and no longer is.

## The round as a history, not a queue

[`helpers/round-state.mjs`](../../../module/helpers/round-state.mjs) is the whole
rule, and it is pure — no Foundry globals, nothing imported, nothing importing it
except the combat document. A round is:

```
{ round, activationHistory: [combatantId, …], activationIndex, previousRoundState? }
```

An ordered record of **who has already gone**, plus a cursor into it. That shape
is what makes "Vorheriger Zug" honest. A queue would recompute the order on the
way back and hand you the person the initiative list says should have gone; a
history hands you the person who actually did, even when somebody interrupted.

Everything past the cursor is a future the round already walked and then stepped
back out of. `advanceActivation` replays it while it still matches the combat,
and `activateEarly` throws it away — because the round has just taken a different
turn than the one it took last time.

| Export | Does |
| --- | --- |
| `createRoundState(round, firstId, previous?)` | Open a round on its first activation |
| `normalizeRoundState(state, round)` | Read the flag; a state belonging to another round reads as empty |
| `getActivatedIds(state)` | Who has gone this round — the history up to the cursor |
| `advanceActivation(state, orderIds)` | Next activation, or `undefined` when the round owes none |
| `rewindActivation(state)` | One step back, keeping the future replayable |
| `activateEarly(state, id)` | Pull an activation forward, discarding the rewound future |
| `startNextRound(state, round, firstId)` | Close the round, keeping it for a rewind across the boundary |

## What the Combat document does with it

`TnoCombat extends Combat` keeps the state in `flags.tno.roundState` and the
initiative snapshot in `flags.tno.baseInitiatives`.

| Override | Does |
| --- | --- |
| `_sortCombatants` | Ascending — see above |
| `startCombat()` | `super` first (its own `{round: 1, turn: 0}` already names the slowest), then snapshot the initiatives and open the round state on whoever it made current |
| `nextTurn()` | `advanceActivation`; no next activation means `nextRound()` |
| `previousTurn()` | `rewindActivation`; at the round's first activation, step back into `previousRoundState` |
| `nextRound()` | Restore the snapshotted initiatives (growing the snapshot, see below), read the finished round, `super`, then `startNextRound` onto whoever core opened on |
| `activateEarly(id)` | The interrupt; public, GM-side |
| `get activatedIds()` | The only thing the tracker reads |

`nextTurn`, `previousTurn` and `activateEarly` write the turn cursor and the
round state in **one** update, and fire the same `combatTurn` / `combatRound`
hook with the same world-time delta core fires. Two writes would leave a render
between them showing a round nobody had activated in.

`startCombat` and `nextRound` do delegate to `super`, so they cannot share its
write — and they therefore write the round state **after** it rather than
before. The ordering is what makes the failure mode benign: the stored state
always describes a round that exists, and a handler that cancels core's update
leaves the previous round's history intact instead of wiping it.

`skipDefeated` is honoured: a defeated combatant is dropped from the activation
order, so the setting means the same thing here as it does everywhere else in
Foundry. (The module this came from did not do that — a gap rather than a
regression.)

### The initiative snapshot only ever holds numbers

`baseInitiatives` records a combatant **only once it has an initiative**, and the
restore adopts a baseline for anyone who still has none. Both halves matter, and
getting them wrong is not a cosmetic failure:

Foundry lets a combat be started before anybody rolls. Snapshotting that state
verbatim stored a `null` per combatant, and the next round change faithfully
restored those nulls — so everything rolled during round 1 was wiped at round 2,
and the tracker fell back to sorting by name. The same held for a combatant who
joined mid-fight and was absent from the snapshot.

So the rule is: a combatant's **first** initiative is their baseline, whenever it
arrives. `#snapshotInitiatives` filters to finite values, and
`#restoreBaseInitiatives` learns the missing ones on the way past and returns the
grown snapshot for `nextRound` to store alongside the round state.
Pinned by `tests/documents/combat-turn-order.test.js › never restores a
combatant to no initiative at all` and `› adopts a baseline for a combatant who
joined mid-fight`.

**Not covered:** the round *controls* — "Previous Round" and a direct
`Combat#update` — keep Foundry's plain semantics. A round the state machine did
not open reads as empty through `normalizeRoundState`, so the tracker shows
nobody as spent rather than showing something wrong.

**No migration.** Combat state is transient and these flags have never existed
in this system, so the only thing a migration could rescue is a combat running
across the version bump. Deliberately skipped.

## The tracker

[`apps/combat-tracker.mjs`](../../../module/apps/combat-tracker.mjs) is
`TnoCombatTracker`, registered as `CONFIG.ui.combat`. It adds three things to
each row and settles one question.

* **The Haltung**, read through
  [`helpers/stances.mjs`](../../../module/helpers/stances.mjs) — icon plus the
  short localized name, with the full effect in the tooltip. The icon alone is
  not nameable across nine Haltungen and the name alone is not scannable down a
  list, so it is both. This is the reason the whole feature belongs in the system
  rather than in a module: a Haltung is only interpretable through `CONFIG.TNO`.

  Coloured by **band**, not by Haltung — `stanceEntry` carries `group` for
  exactly this. Nine names down a narrow sidebar are read one at a time; four
  colours are read at a glance. The `base` band (Offen) is drawn as plain muted
  text rather than as a pill: it is the Haltung for "nothing declared", so out of
  combat every row carries it, and ten grey pills read as ten decisions. A framed
  chip therefore always means this combatant has committed to something.

  The icons themselves are in `CONFIG.TNO.stances` and nowhere else. They are
  chosen so that no two within a band share a silhouette — colour separates the
  bands, but nothing separates two stick figures at 11px, which is what the
  first pass got wrong. They are **Font Awesome 7** names, served from the copy
  Foundry bundles; `fa-person-meditating` does not exist in the v13 build, which
  is why `system.json` declares `compatibility.minimum: "14"`. Check a
  replacement icon against `public/fonts/fontawesome` before using it.
* **Whether the row is spent**, from `combat.activatedIds`. Lightly dimmed with a
  greyed portrait — the row still has to be readable, it just no longer owes a
  turn.
* **The interrupt button**, on an owned combatant that has not activated yet.
  Where it sits is load-bearing, and both rules are about *not moving anything
  else* as rows are spent:

  It is in `.combatant-controls`, **not** beside the initiative. Core's
  `.token-initiative` is a 32px flex column built for exactly one child; a second
  one there overflowed it and made an un-activated row 9px taller than a spent
  one, so every activation shuffled the whole list under the cursor.

  And within that row it is **last of the left-aligned buttons**, immediately
  before `.token-effects`. The hide/defeat/ping icons therefore keep their place
  when it disappears, and the effects block is pushed right by its own auto
  margin, so it does not move either.

  It takes `$c-primary`, the system's commit-to-this-action blue, rather than
  another warm grey: it is the one control in that row a player *does* something
  with instead of toggling. Far more saturated than the movement band's
  `#1f5f9e`, so a moving combatant who is also interruptible does not read as one
  colour.
* **The display order.** `combatTrackerOrder` reverses `context.turns` in
  `_prepareTrackerContext` and never touches `combat.turns`. It is presentation:
  the activation rule is identical in both directions.

Two deliberate deviations from this system's house style, both because the parent
class already made the choice:

* Clicks route through ApplicationV2's `actions` map rather than the `#delegate`
  pattern the sheets use. The parent routes its own controls that way, and a
  second dispatch mechanism beside it would mean two places to look for one
  click.
* `templates/sidebar/combat-tracker.hbs` is a **copy of a core template**
  (14.364) with four marked changes. A copy drifts; the alternative — keeping
  core's template and injecting the chip into the DOM on render — is exactly the
  reach-around this rewrite existed to remove. The mitigation is that
  `tests/e2e/specs/combat-tracker-stance.spec.mjs` asserts the *core* parts are
  still present, so drift is caught where it costs something. **Diff it against
  the core file before every Foundry upgrade.**

Nothing in core re-renders the tracker when an actor changes, so `tno.mjs`
registers an `updateActor` hook that re-renders it when `system.combat.stance`
moves on an actor in the current combat.

The SCSS partial is imported **outside** the `.tno` block, next to
`_base-roll-button`. The sidebar is painted by Foundry's own theme; putting it
inside `.tno` would drag the sheets' parchment palette and every sheet component
with it into a surface none of them were written for.

## The one socket

[`helpers/combat-socket.mjs`](../../../module/helpers/combat-socket.mjs) is this
system's first and only socket. A player may not write the Combat document, so
pressing ⚡ on their own combatant emits a request on `system.tno` and the GM's
client grants it.

This is a real exception to the decoupling
[combat-roll-workflows.md](combat-roll-workflows.md) promises, and the promise
has been narrowed rather than quietly broken. The distinction that makes it hold:
**a roll belongs to the person making it; the activation history is a single
object every participant shares.** Nothing about the roll side has changed — no
sheet reads another sheet, and no workflow checks another user's permissions.

The request carries no authority. Everything it asks for is re-derived on the
receiving client — who sent it, whether they own that combatant's actor, whether
the combat is even running — so a hand-crafted socket message can do nothing the
button could not. Only `game.users.activeGM` acts on it, or a second GM would
refuse an activation the first had just granted.

## Where the tests are

| Layer | File |
| --- | --- |
| The pure round state | `tests/helpers/round-state.test.js` |
| The document's overrides | `tests/documents/combat-turn-order.test.js` |
| The interrupt | `tests/documents/combat-interrupt.test.js` |
| The socket's refusals | `tests/helpers/combat-socket.test.js` |
| The Haltung read layer | `tests/helpers/stances.test.js` |
| Turn order in a real Foundry | `tests/e2e/specs/combat-reverse-initiative.spec.mjs` |
| The tracker's rows | `tests/e2e/specs/combat-tracker-stance.spec.mjs` |

The socket round trip itself is not covered: it needs two clients, and the suite
drives one. The two ends are tested separately instead — the handler against a
stubbed `game`, and the GM path end to end.
