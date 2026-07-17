# Problem-Solving Reserve - Product Requirements Document

**Version:** 1.3
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

The Problem-Solving Reserve ("Problemlösen-Vorrat") is an edge-mechanic pool that lets a character bend the outcome of a check — at the cost of a shared, limited resource. It sits on top of the standard [Joster dice roll](dice-system-prd.md) and does not replace it.

### Design Philosophy

- **Scarcity creates weight:** A single shared pool (not per-action charges) forces players to choose which problem is worth solving.
- **Manual application, system-tracked cost:** Most actions here don't roll dice themselves — they hand the player a number to apply by hand to a check they already made, while the system tracks the point spend and posts a chat record.
- **One self-sustaining action:** "Fehler Analysieren" is the outlier — it costs nothing but XP-on-success, and is how the pool refills.

---

## The Reserve Pool

- **Storage:** `system.problemSolving.spent` — the actor stores *points spent*, not points remaining.
- **Derived values:** `system.derived.solveReserve` (current = max − spent) and `system.derived.solveReserveMax`.
- **Manual adjustment:** The reserve value is directly editable on the sheet (clamped 0..max). A manual *decrease* is treated as an off-mechanic spend and is announced in chat (`SolveReserveSpent`) — an *increase* is not, since it's typically a GM/admin correction.
- **Gate:** All four spending actions require `solveReserve > 0` before opening their confirmation dialog; otherwise a UI warning (`JOSTER.Notify.NoReserve`) is shown and nothing happens.

---

## Actions

### 1. Idee haben (Have an Idea) - Pre-Edge

- **Cost:** 1 reserve point.
- **Effect:** Flat `+solveIdea` value, applied by the player on top of the threshold of a check — the intent is to make a hard check reachable ("add your value on top of the original roll's threshold").
- **Mechanically:** No standalone sheet action anymore. Implemented as a checkbox toggle inside [`JosterRollDialog`](../../module/apps/roll-dialog.mjs) ("💡 Idee haben (+X)"), shown on every roll for `character`-type actors. Toggling it live-updates the threshold preview; submitting the dialog spends the point and rolls in the same step — point spend and roll are computed off the same pre-spend actor state so the just-spent point can't get "un-applied" by its own reserve update (see code comment in `_updateObject`). The bonus is folded into the roll's `components` breakdown (label `JOSTER.Roll.IdeaComponent`), same as an attribute or skill component.
- **Trigger:** Before a check. Strictly pre-roll — no retroactive application after the dice have fallen (see Open Question 2 for the rationale). If the reserve is 0, the checkbox is disabled and greyed out (title shows `JOSTER.Notify.NoReserve`) — the player sees the option and its unavailability up front, so there's no "I forgot" case to adjudicate.

### 2. Fehler finden (Find the Flaw) - Post-Edge

- **Cost:** 1 reserve point.
- **Effect:** Grants up to `solveFindFlaw` rerolls of a failed check, stopping at the first success.
- **Mechanically:** Lives on the failed roll's own chat card, not the sheet ("Reroll-Tracker auf der Wurf-Karte", the chosen variant from the [implementation brainstorm](#open-questions--variants-to-explore)). A `🔍 Fehler finden` button is injected client-side (via `renderChatMessageHTML`, see [chat.mjs](../../module/helpers/chat.mjs)) on any failed roll the viewer owns, as long as no edge action has touched that roll yet and the reserve is above 0. Clicking it spends the point and swaps the button for a pip tracker (`○○○` for `solveFindFlaw = 3`); each further click on `Nochmal würfeln` rolls the same die count against the same threshold/advantage, appends the attempt, and fills a pip. The tracker locks — reroll button replaced by a result banner — on the first success or once all pips are used.
- **Data model:** All state lives in `flags.joster` on the triggering message (`threshold`, `advantage`, `outcome`, `edge.consumed`, `edge.findFlaw.{max,used,active,attempts}`); the persisted card `content` itself is never rewritten. This keeps the trigger/tracker exclusive to owners/GMs per viewer and keeps a roll from being "double-spent" by more than one edge action.
- **Trigger:** After a failed check, from that check's own chat card.

### 3. Neuer Versuch (New Attempt) - Post-Edge

- **Cost:** 1 reserve point.
- **Effect:** Reroll the failed check exactly once; the second result replaces the first outright, better or worse.
- **Trade-off:** Forfeits the XP the original check would have earned.
- **Mechanically:** No dice rolled by the system — spends the point and posts a chat announcement; the player carries out the reroll by hand.
- **Trigger:** After a failed check.

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
| Neuer Versuch | 1 point | No | No | Yes |
| Fehler Analysieren | 0 (XP only) | Yes (3d20 vs. value) | Yes, on success | Yes |

---

## Implementation Notes

- Two actions (`solveNewAttempt`, `analyzeFlaw`) live in `_onRoll` in [actor-sheet.mjs](../../module/sheets/actor-sheet.mjs), dispatched via `dataset.rollType`. Each shows a `DialogV2.confirm` before committing, with dedicated title/content localization keys.
- `Idee haben` is a sheet-adjacent exception — it's not a sheet action at all. It lives entirely inside [`JosterRollDialog`](../../module/apps/roll-dialog.mjs) as a toggle, since it's the only pre-edge action (see [Pre-Edge vs. Post-Edge](#pre-edge-vs-post-edge)).
- `Fehler finden` is the other exception — it has no sheet entry point at all. Its trigger button and reroll tracker are injected into a failed roll's chat card by a `renderChatMessageHTML` hook in [chat.mjs](../../module/helpers/chat.mjs), reading/writing `flags.joster` on that message; `startFindFlaw`/`rerollFindFlaw` in [dice.mjs](../../module/helpers/dice.mjs) hold the actual point-spend and reroll logic.
- Point spend is always written as `system.problemSolving.spent` += 1 (or −= 1 for the refund), never a direct write to the derived reserve value.
- `Fehler Analysieren` reuses `rollJoster` — the same roll engine as standard ability/skill checks — with `advantage: JOSTER_ADVANTAGE.none`.
- `rollJoster` now returns `{roll, success, message}` (previously `{roll, success}`) and stamps every created message with `flags.joster` (`threshold`, `advantage`, `outcome`, `edge`), which `Fehler finden` depends on to reroll under identical parameters.
- `rerollFindFlaw` doesn't create a new chat message (it only patches the tracker's flags), so it doesn't get Dice So Nice's animation for free the way `ChatMessage.create({rolls: [...]})` does. It calls `game.dice3d.showForRoll(roll, game.user, true)` directly when the module is active, falling back to the plain dice sound otherwise.

---

## Localization

Existing keys, present in both `lang/de.json` and `lang/en.json`:

- `JOSTER.Derived.SolveIdea` / `SolveFindFlaw` / `SolveReserve` / `SolveAnalyzeFlaw` / `SolveNewAttempt` — also doubles as the chat-card trigger button label for `Fehler finden`.
- `JOSTER.Roll.IdeaToggle` / `IdeaComponent` — the dialog checkbox label and the roll-card component label for "Idee haben".
- `JOSTER.Roll.FindFlawReroll` — the tracker's reroll button, formatted with `{remaining}`.
- `JOSTER.Roll.FindFlawSucceeded` / `FindFlawExhausted` — the tracker's locked end state, once it stops accepting rerolls.
- `JOSTER.Dialog.SolveFindFlawTitle` / `SolveFindFlawContent`
- `JOSTER.Dialog.SolveAnalyzeFlawTitle` / `SolveAnalyzeFlawContent`
- `JOSTER.Dialog.SolveNewAttemptTitle` / `SolveNewAttemptContent`
- `JOSTER.Chat.SolveFindFlawSuccess` / `SolveNewAttemptSuccess` / `SolveAnalyzeFlawAttempt` / `SolveAnalyzeFlawSuccess` / `SolveReserveSpent`
- `JOSTER.Notify.NoReserve` — also reused as the disabled-checkbox tooltip in the roll dialog.

Retired: `JOSTER.Dialog.SolveIdeaTitle` / `SolveIdeaContent` and `JOSTER.Chat.SolveIdeaSuccess` — these belonged to the old standalone sheet-button/chat-announcement flow for Idee haben, removed in favor of the roll-dialog toggle.

---

## Open Questions / Variants to Explore

This document is the baseline (v1, all four actions confirmed working per [TODO.md](../../TODO.md)). Candidates for iteration:

1. **Fehler finden mechanic redesign** — ~~currently informational-only~~ **Decided and implemented (v1.3):** each reroll is still a deliberate click ("at the discretion of the player"), but the system now executes it — a `🔍 Fehler finden` button on the failed roll's chat card starts a pip tracker, and each further click rerolls under identical parameters (see [Fehler finden](#2-fehler-finden-find-the-flaw---post-edge) and [chat.mjs](../../module/helpers/chat.mjs)). The tracker stops itself at the first success or once the reroll budget is spent, so the "up to X times" cap from the rules text is enforced rather than trusted.
2. **Automating the manual actions** — Idee haben / Fehler finden / Neuer Versuch all hand a number to the player instead of applying it to a tracked "pending" roll. Could bind them to a specific prior roll (e.g. last chat message) instead.
   1. Needs decision for workflows
      1. Pre-Edge -> **Decided and implemented (v1.2):** Toggle inside `JosterRollDialog` ("💡 Idee haben (+X)"), applied as a threshold component of the roll. Spending the point and rolling happen atomically. **Retroactive application is forbidden** — allowing it would make waiting strictly optimal (only pay when it flips the outcome) and collapse the pre-edge into a de-facto post-edge. The visible toggle in the dialog also removes the "I forgot" excuse: the player saw the option and chose not to use it. The old standalone sheet button/chat-announcement flow was removed since it contradicted this decision.
      2. Post-Edge -> **Decided and implemented for Fehler finden (v1.3):** the trigger/tracker is bound to the specific failed roll's chat message via `flags.joster`, exactly the "interaction buttons on failed rolls" pattern floated here. Neuer Versuch still uses the older manual/announcement flow — same pattern is the natural next candidate if it gets automated too.
3. **GM gating for Fehler Analysieren** — currently just a text hint in the confirm dialog; consider a permission/flag-based gate instead of trusting table talk.
4. **Pool sizing & refill rate** — is one point per successful analysis the right refill rate relative to how fast points are spent?
   1. => yes, points are a limited resource
5. **XP trade-off framing** — Neuer Versuch and Fehler Analysieren both forfeit XP; worth checking whether this is legible enough to players without re-reading the dialog text each time.

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-07-17 | Initial PRD creation, documenting existing implementation | System |
| 1.2 | 2026-07-17 | Implemented Idee haben as a pre-roll toggle in `JosterRollDialog`; removed the superseded standalone sheet action | System |
| 1.3 | 2026-07-17 | Implemented Fehler finden as a reroll tracker on the failed roll's chat card (Variante A from the implementation brainstorm); removed the superseded standalone sheet action | System |

---

**End of Document**
