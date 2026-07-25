---
type: concept
title: Edge pool (problem-solving)
description: The edge point resource and its four post-roll actions (Trial & error, Retry, Post-mortem, XP claim).
tags: [edge-pool, problem-solving, chat-flags]
resource: [module/helpers/dice.mjs, module/helpers/chat.mjs]
spec: docs/design/problem-solving-prd.md
related: [concepts/dice-resolution, concepts/attributes]
---

# Edge pool (problem-solving)

Full rules (state matrix, eligibility, localization):
[`docs/design/problem-solving-prd.md`](../../design/problem-solving-prd.md).
This page covers the implementation shape.

## The resource

`system.derived.edgePoolMax = ceil((base(wil) + base(wis)) / 2)`, computed
in [`module/documents/actor.mjs`](../../../module/documents/actor.mjs) (see
[data-schema.md](../architecture/data-schema.md)). The pool refills to max
on every `prepareDerivedData()` call; only `system.problemSolving.spent`
persists, tracking how many points have been used since the last refill.
**That field keeps its pre-rename name** — the mechanic was renamed from
"Problem Solving" to "Edge" but the on-disk key was left as-is so no actor
migration was needed.

## State lives on the chat message, not the actor

Every roll from `rollTno()` writes an `edge` object to
`ChatMessage.flags.tno.edge`:
`{ consumed, findFlaw, newAttempt, xpClaim, analyzeFlaw }`. All four edge
actions below just update this object in place on the *same* message — no
new chat messages are created — and the whole edge section is re-derived
from flags every time
[`chat.mjs`](../../../module/helpers/chat.mjs)'s `renderChatMessageHTML`
hook fires (see [hooks-and-settings.md](../architecture/hooks-and-settings.md)).
`updateActor` additionally re-renders every visible card for that actor so
pool changes show immediately.

**Legacy key names**: `edge.findFlaw` = Trial & error, `edge.newAttempt` =
Retry, `edge.analyzeFlaw` = Post-mortem. These on-disk names predate the
current German-to-English rename and are kept for the same
no-migration-needed reason as `problemSolving.spent`.

## The four actions (all in `dice.mjs`)

| Function | UI name | Cost | Effect |
| --- | --- | --- | --- |
| `startTrialError` / `rerollTrialError` | Trial & error | free (optional +1 edge per reroll for Insight) | Rerolls same check up to `trialErrorMax` times or until success; state is a pip tracker (`findFlaw.attempts[]`) |
| `retry` | Retry | 1 edge (2 with Insight) | Single automatic reroll, replaces the result shown on the card (`newAttempt.result`) |
| `postMortem` | Post-mortem | free; refunds 1 edge on success | Standalone 3d20 vs. `derived.postMortem`; forfeits the XP claim regardless of its own outcome |
| `claimXp` | (XP button) | — | Banks 1 XP on the skill or attribute used, once per failure chain |

Post-mortem is locked out once any reroll (`edge.consumed` set by Trial &
error or Retry) has happened — enforced both by hiding the UI and by an
early return in `postMortem()` itself, since the two-writer race between
`consumed` and `analyzeFlaw` can't be fully prevented by hiding alone.

## UI structure (`chat.mjs`)

Public read-only blocks (visible to everyone): Retry result, Post-mortem
result, XP-claimed stamp, and — for non-owners — a read-only Trial & error
tracker. Owner/GM-only interactive panel: live Trial & error tracker with
reroll button, and a two-view toggle between the main XP-claim buttons and
a "Troubleshoot" view holding Post-mortem / Retry / Trial & error triggers.
