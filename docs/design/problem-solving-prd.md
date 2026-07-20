# Problem-Solving Reserve - Product Requirements Document

**Version:** 1.6
**Last Updated:** 2026-07-17
**Status:** Implementation Complete (v1) — open for iteration

---

## Table of Contents

1. [Overview](#overview)
2. [The Reserve Pool](#the-reserve-pool)
3. [Actions](#actions)
4. [Implementation Notes](#implementation-notes)
5. [Localization](#localization)
6. [Open Questions / Variants to Explore](#open-questions--variants-to-explore)

---

## Overview

The Problem-Solving Reserve ("Problemlösen-Vorrat") is an edge-mechanic pool that lets a character bend the outcome of a check — at the cost of a shared, limited resource. It sits on top of the standard [Edgefall dice roll](dice-system-prd.md) and does not replace it.

### Design Philosophy

- **Scarcity creates weight:** A single shared pool (not per-action charges) forces players to choose which problem is worth solving.
- **Manual application, system-tracked cost:** Most actions here don't roll dice themselves — they hand the player a number to apply by hand to a check they already made, while the system tracks the point spend and posts a chat record.
- **One self-sustaining action:** "Fehler Analysieren" is the outlier — it costs nothing but XP-on-success, and is how the pool refills.

---

## The Reserve Pool

- **Storage:** `system.problemSolving.spent` — the actor stores *points spent*, not points remaining.
- **Derived values:** `system.derived.solveReserve` (current = max − spent) and `system.derived.solveReserveMax`.
- **Manual adjustment:** The reserve value is directly editable on the sheet (clamped 0..max). A manual *decrease* is treated as an off-mechanic spend and is announced in chat (`SolveReserveSpent`) — an *increase* is not, since it's typically a GM/admin correction.
- **Gate:** All four spending actions require `solveReserve > 0` before opening their confirmation dialog; otherwise a UI warning (`EDGEFALL.Notify.NoReserve`) is shown and nothing happens.

---

## Actions

### 1. Idee haben (Have an Idea) - Pre-Edge

- **Cost:** 1 reserve point.
- **Effect:** Flat `+solveIdea` value, applied by the player on top of the threshold of a check — the intent is to make a hard check reachable ("add your value on top of the original roll's threshold").
- **Mechanically:** No standalone sheet action anymore. Implemented as a checkbox toggle inside [`EdgefallRollDialog`](../../module/apps/roll-dialog.mjs) ("💡 Idee haben (+X)"), shown on every roll for `character`-type actors. Toggling it live-updates the threshold preview; submitting the dialog spends the point and rolls in the same step — point spend and roll are computed off the same pre-spend actor state so the just-spent point can't get "un-applied" by its own reserve update (see code comment in `_updateObject`). The bonus is folded into the roll's `components` breakdown (label `EDGEFALL.Roll.IdeaComponent`), same as an attribute or skill component.
- **Trigger:** Before a check. Strictly pre-roll — no retroactive application after the dice have fallen (see Open Question 2 for the rationale). If the reserve is 0, the checkbox is disabled and greyed out (title shows `EDGEFALL.Notify.NoReserve`) — the player sees the option and its unavailability up front, so there's no "I forgot" case to adjudicate.

### 2. Fehler finden (Find the Flaw) - Post-Edge

- **Cost:** 1 reserve point.
- **Effect:** Grants up to `solveFindFlaw` rerolls of a failed check, stopping at the first success.
- **Mechanically:** Lives on the failed roll's own chat card, not the sheet ("Reroll-Tracker auf der Wurf-Karte", the chosen variant from the [implementation brainstorm](#open-questions--variants-to-explore)). Chosen from the shared `💡 Problem lösen (N)` inline panel described under [Neuer Versuch](#3-neuer-versuch-new-attempt---post-edge) below — running "Fehler finden" from that panel spends the point and swaps the whole panel for a pip tracker (`○○○` for `solveFindFlaw = 3`); each further click on `Nochmal würfeln` rolls the same die count against the same threshold/advantage, appends the attempt, and fills a pip. The tracker locks — reroll button replaced by a result banner — on the first success or once all pips are used.
- **Data model:** All state lives in `flags.edgefall` on the triggering message (`threshold`, `advantage`, `outcome`, `edge.consumed`, `edge.findFlaw.{max,used,active,attempts}`); the persisted card `content` itself is never rewritten. This keeps the trigger/tracker exclusive to owners/GMs per viewer and keeps a roll from being "double-spent" by more than one edge action.
- **Trigger:** After a failed check, from that check's own chat card.

### 3. Neuer Versuch (New Attempt) - Post-Edge

- **Cost:** 1 reserve point.
- **Effect:** Reroll the failed check exactly once; the second result replaces the first outright, better or worse.
- **Trade-off:** Forfeits the XP the original check would have earned.
- **Mechanically:** Lives on the failed roll's own chat card, behind the same trigger as `Fehler finden` ("System-Reroll mit Ersetzen", the chosen variant from the [implementation brainstorm](#open-questions--variants-to-explore)). Since v1.5, both post-edge actions are collapsed onto a single `💡 Problem lösen (N)` row, shown to the owner as long as neither edge action has claimed that roll yet and the reserve is above 0 — a single failing roll otherwise showed two buttons at once, one of which is legal much less often (Fehler finden requires the GM's time-pressure sign-off; see `EDGEFALL.Notify.ProblemSolvingGate`) and so was frequently a dead click. As of v1.6, clicking that row expands an inline panel *on the card itself* (`renderSolvePanel` in [chat.mjs](../../module/helpers/chat.mjs)) with both options and their one-line trade-off hints — no modal. Clicking an option's run button both selects and executes it immediately (the expand click is itself the deliberate first step, so no separate confirm dialog follows). This replaces the v1.5 `DialogV2.wait` choice dialog, whose own two footer buttons reproduced the same "two buttons, one often dead" problem one level down. Choosing `Neuer Versuch` spends the point and — unlike Fehler finden — leaves no further choice to the player: the system itself rerolls once, under the exact same threshold/advantage/components/bonus as the original, and posts the reroll as a brand-new chat message. That new card carries a banner ("Neuer Versuch — dieses Ergebnis zählt") linking back to the original; the original card is dimmed and stamped ("Ersetzt durch Neuen Versuch (XP verwirkt)"), linking forward to the reroll. Both banner and stamp are click-to-scroll, so the two halves of a "Neuer Versuch" are always one click apart in the log.
- **Data model:** The replay parameters (`threshold`, `advantage`, `flavor`, `components`, `bonus`, `nonStandard`) now live in `flags.edgefall` on every roll (not just failed ones), so `startNewAttempt` can feed them straight back into `rollEdgefall` for an identical reroll. The link between the two messages is `flags.edgefall.edge.newAttempt.replacedBy` (original → reroll) and `flags.edgefall.replaces` (reroll → original).
- **Trigger:** After a failed check, from that check's own chat card.

### 4. Fehler Analysieren (Analyze the Flaw) - Post-Edge-Regeneration

- **Cost:** None up front — the only action that can *refill* the pool.
- **Trigger:** After a failure with a real, felt consequence (GM sign-off recommended — not meant for every botched roll).
- **Mechanic:** A standard 3d20 roll against `solveAnalyzeFlaw` (no advantage/disadvantage, no modifiers). On success, refunds 1 reserve point (capped at max).
- **Trade-off:** Forfeits the XP the original failed check would have earned (spend happens regardless of whether the analysis roll itself succeeds).
- **Chat trail:** Posts an "attempt" message before rolling, then a "success" message (with current/max) if the roll and refund succeed.

### Summary Table

| Action | Cost | Rolls Dice? | Refills Pool? | XP Trade-off |
|---|---|---|---|---|
| Idee haben | 1 point | Yes (folded into the triggering roll) | No | No |
| Fehler finden | 1 point | Yes (up to `solveFindFlaw`x, same threshold) | No | No |
| Neuer Versuch | 1 point | Yes (one system reroll, replaces original) | No | Yes |
| Fehler Analysieren | 0 (XP only) | Yes (3d20 vs. value) | Yes, on success | Yes |

---

## Implementation Notes

- Only one action (`analyzeFlaw`) still lives in `_onRoll` in [actor-sheet.mjs](../../module/sheets/actor-sheet.mjs), dispatched via `dataset.rollType`. It shows a `DialogV2.confirm` before committing, with dedicated title/content localization keys.
- `Idee haben` is a sheet-adjacent exception — it's not a sheet action at all. It lives entirely inside [`EdgefallRollDialog`](../../module/apps/roll-dialog.mjs) as a toggle, since it's the only pre-edge action (see [Pre-Edge vs. Post-Edge](#pre-edge-vs-post-edge)).
- `Fehler finden` and `Neuer Versuch` have no sheet entry point at all. Both are injected into a failed roll's own chat card by a single `renderChatMessageHTML` hook in [chat.mjs](../../module/helpers/chat.mjs), reading/writing `flags.edgefall` on that message. As of v1.5 they share one `Problem lösen` trigger instead of two independent buttons/confirms; as of v1.6 that trigger expands an inline panel (`renderSolvePanel`, rendered from [templates/chat/edge-panel.hbs](../../templates/chat/edge-panel.hbs)) rather than opening a `DialogV2` choice dialog. `flags.edgefall.edge.consumed` (`null` / `'findFlaw'` / `'newAttempt'`) makes the two mutually exclusive per roll — whichever the player runs from the panel locks out the other for that message. `startFindFlaw`/`rerollFindFlaw`/`startNewAttempt` in [dice.mjs](../../module/helpers/dice.mjs) hold the actual point-spend and reroll logic, unchanged since v1.4.
- Point spend is always written as `system.problemSolving.spent` += 1 (or −= 1 for the refund), never a direct write to the derived reserve value.
- `Fehler Analysieren` reuses `rollEdgefall` — the same roll engine as standard ability/skill checks — with `advantage: EDGEFALL_ADVANTAGE.none`. `Neuer Versuch` also reuses `rollEdgefall` for its system-executed reroll, via a new `extraFlags` option that tags the resulting message with `{ replaces: <originalMessageId> }`.
- `rollEdgefall` now returns `{roll, success, message}` (previously `{roll, success}`) and stamps every created message with `flags.edgefall` (`threshold`, `advantage`, `flavor`, `components`, `bonus`, `nonStandard`, `outcome`, `edge`). The replay parameters (`flavor`/`components`/`bonus`/`nonStandard`) were added in v1.4 specifically so `startNewAttempt` can rebuild an identical roll for the reroll.
- `rerollFindFlaw` doesn't create a new chat message (it only patches the tracker's flags), so it doesn't get Dice So Nice's animation for free the way `ChatMessage.create({rolls: [...]})` does. It calls `game.dice3d.showForRoll(roll, game.user, true)` directly when the module is active, falling back to the plain dice sound otherwise. `startNewAttempt`, by contrast, *does* create a new message (via `rollEdgefall`), so it gets the animation for free.

---

## Localization

Existing keys, present in both `lang/de.json` and `lang/en.json`:

- `EDGEFALL.Derived.SolveIdea` / `SolveFindFlaw` / `SolveReserve` / `SolveAnalyzeFlaw` / `SolveNewAttempt` — derived-attribute labels; no longer doubles as a chat-card button label since v1.5 (see `Dialog.SolveTrigger`/`SolveOptionFindFlaw`/`SolveOptionNewAttempt` below).
- `EDGEFALL.Roll.IdeaToggle` / `IdeaComponent` — the dialog checkbox label and the roll-card component label for "Idee haben".
- `EDGEFALL.Roll.FindFlawReroll` — the tracker's reroll button, formatted with `{remaining}`.
- `EDGEFALL.Roll.FindFlawSucceeded` / `FindFlawExhausted` — the tracker's locked end state, once it stops accepting rerolls.
- `EDGEFALL.Roll.NewAttemptCounts` — the banner on the reroll card produced by `Neuer Versuch`.
- `EDGEFALL.Roll.NewAttemptReplaced` — the stamp on the original card once `Neuer Versuch` has claimed it.
- `EDGEFALL.Dialog.SolveTrigger` — the chat-card toggle row's label, formatted with `{value}` (the current reserve).
- `EDGEFALL.Dialog.SolveOptionFindFlaw` / `SolveOptionNewAttempt` — row titles and run-button tooltips inside the inline panel.
- `EDGEFALL.Dialog.SolveFindFlawHint` / `SolveNewAttemptHint` — the one-line trade-off text shown under each option's title in the panel (formatted with `{value}` for Fehler finden's reroll cap).
- `EDGEFALL.Dialog.SolveAnalyzeFlawTitle` / `SolveAnalyzeFlawContent`
- `EDGEFALL.Chat.SolveFindFlawSuccess` / `SolveNewAttemptSuccess` / `SolveAnalyzeFlawAttempt` / `SolveAnalyzeFlawSuccess` / `SolveReserveSpent`
- `EDGEFALL.Notify.NoReserve` — also reused as the disabled-checkbox tooltip in the roll dialog.

Retired: `EDGEFALL.Dialog.SolveIdeaTitle` / `SolveIdeaContent` and `EDGEFALL.Chat.SolveIdeaSuccess` — these belonged to the old standalone sheet-button/chat-announcement flow for Idee haben, removed in favor of the roll-dialog toggle. Also retired in v1.5: `EDGEFALL.Dialog.SolveFindFlawTitle` / `SolveNewAttemptTitle`, superseded by the single `SolveTrigger` control. Retired in v1.6: `EDGEFALL.Dialog.SolveTitle` and the two-paragraph `SolveFindFlawContent` / `SolveNewAttemptContent`, superseded by the short `SolveFindFlawHint` / `SolveNewAttemptHint` now that there's no dialog window to title.

---

## Open Questions / Variants to Explore

This document is the baseline (v1, all four actions confirmed working per [TODO.md](../../TODO.md)). Candidates for iteration:

1. **Fehler finden mechanic redesign** — ~~currently informational-only~~ **Decided and implemented (v1.3):** each reroll is still a deliberate click ("at the discretion of the player"), but the system now executes it — a `🔍 Fehler finden` button on the failed roll's chat card starts a pip tracker, and each further click rerolls under identical parameters (see [Fehler finden](#2-fehler-finden-find-the-flaw---post-edge) and [chat.mjs](../../module/helpers/chat.mjs)). The tracker stops itself at the first success or once the reroll budget is spent, so the "up to X times" cap from the rules text is enforced rather than trusted.
2. **Automating the manual actions** — Idee haben / Fehler finden / Neuer Versuch all hand a number to the player instead of applying it to a tracked "pending" roll. Could bind them to a specific prior roll (e.g. last chat message) instead.
   1. Needs decision for workflows
      1. Pre-Edge -> **Decided and implemented (v1.2):** Toggle inside `EdgefallRollDialog` ("💡 Idee haben (+X)"), applied as a threshold component of the roll. Spending the point and rolling happen atomically. **Retroactive application is forbidden** — allowing it would make waiting strictly optimal (only pay when it flips the outcome) and collapse the pre-edge into a de-facto post-edge. The visible toggle in the dialog also removes the "I forgot" excuse: the player saw the option and chose not to use it. The old standalone sheet button/chat-announcement flow was removed since it contradicted this decision.
      2. Post-Edge -> **Decided and implemented for both Fehler finden and Neuer Versuch (v1.3/v1.4):** both triggers are bound to the specific failed roll's chat message via `flags.edgefall`, exactly the "interaction buttons on failed rolls" pattern floated here. `Neuer Versuch` specifically implements "Variante A — System-Reroll mit Ersetzen" from the [implementation brainstorm](#open-questions--variants-to-explore): the system performs the reroll itself (no manual step left to the player) and visually replaces the original card rather than just tracking a count, since "the second result counts regardless" is a hard rule with no room for player discretion, unlike Fehler finden's discretionary rerolls.
3. **GM gating for Fehler Analysieren** — currently just a text hint in the confirm dialog; consider a permission/flag-based gate instead of trusting table talk.
4. **Pool sizing & refill rate** — is one point per successful analysis the right refill rate relative to how fast points are spent?
   1. => yes, points are a limited resource
5. **XP trade-off framing** — Neuer Versuch and Fehler Analysieren both forfeit XP; worth checking whether this is legible enough to players without re-reading the dialog text each time.

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-07-17 | Initial PRD creation, documenting existing implementation | System |
| 1.2 | 2026-07-17 | Implemented Idee haben as a pre-roll toggle in `EdgefallRollDialog`; removed the superseded standalone sheet action | System |
| 1.3 | 2026-07-17 | Implemented Fehler finden as a reroll tracker on the failed roll's chat card (Variante A from the implementation brainstorm); removed the superseded standalone sheet action | System |
| 1.4 | 2026-07-17 | Implemented Neuer Versuch as a system-executed reroll that replaces the original chat card (Variante A — System-Reroll mit Ersetzen); removed the superseded standalone sheet action | System |
| 1.5 | 2026-07-17 | Collapsed the two post-edge chat-card buttons into a single `Problem lösen` trigger opening one choice dialog (both options with trade-offs, pick = confirm); addresses the two-buttons-one-often-dead UX issue reported for Fehler finden vs. Neuer Versuch | System |
| 1.6 | 2026-07-17 | Replaced the v1.5 choice dialog with an inline expanding panel on the card itself (no modal): the `Problem lösen` row expands into both options with one-line trade-off hints and a per-option run button that executes immediately. Addresses the same two-buttons-one-often-dead problem resurfacing one level down, inside the dialog's own footer buttons | System |

---

**End of Document**
