import { startFindFlaw, rerollFindFlaw, startNewAttempt } from './dice.mjs';

/**
 * Wire up the post-edge actions on a failed roll's chat card ("Fehler
 * finden" and "Neuer Versuch") plus the "Neuer Versuch" replacement banner
 * on the reroll card it produces. Nothing here touches the persisted card
 * content — everything is driven off `flags.joster` and re-rendered per
 * viewer, so only the rolling actor's owner (or a GM) ever sees the
 * controls, and every reopen of the chat log reflects the current state.
 */
export function registerChatListeners() {
  Hooks.on('renderChatMessageHTML', (message, html) => {
    renderReplacementBanner(message, html);
    renderEdgeSection(message, html);
  });

  // A card's edge section is only ever computed at its first render, gated
  // on the actor's reserve at that moment. If the reserve changes afterward
  // (a "Fehler Analysieren" refund, or the point "Neuer Versuch"/"Fehler
  // finden" themselves just spent), already-displayed cards would otherwise
  // stay frozen in their earlier state — e.g. a card that first rendered
  // with reserve 0 never regains its "Problem lösen" trigger once the
  // reserve refills. Re-run the render for every currently-visible card
  // belonging to this actor whenever it updates.
  Hooks.on('updateActor', (actor) => refreshEdgeSectionsFor(actor));
}

/**
 * @param {Actor} actor
 */
function refreshEdgeSectionsFor(actor) {
  for (const element of document.querySelectorAll('[data-message-id]')) {
    const message = game.messages.get(element.dataset.messageId);
    if (message?.flags?.joster?.actorId !== actor.id) continue;
    renderEdgeSection(message, element);
  }
}

/** Scroll a rendered chat message into view, if it's currently in the log. */
function scrollToMessage(messageId) {
  document.querySelector(`[data-message-id="${messageId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * If this message is itself a "Neuer Versuch" reroll of another failed
 * check (flags.joster.replaces), banner it as the result that counts, with
 * a link back to the check it replaced.
 *
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function renderReplacementBanner(message, html) {
  const data = message.flags?.joster;
  if (!data?.replaces) return;

  const card = html.querySelector('.joster-roll-card');
  if (!card) return;

  const banner = document.createElement('div');
  banner.className = 'joster-new-attempt-banner';
  banner.innerHTML = `<i class="fa-solid fa-arrow-rotate-right"></i> ${game.i18n.localize('JOSTER.Roll.NewAttemptCounts')}`;
  banner.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    scrollToMessage(data.replaces);
  });
  card.appendChild(banner);
}

/**
 * Render whichever post-edge state a failed roll's own card is in:
 * - Untouched: a single "Problem lösen" toggle that expands, inline on the
 *   card, into the two options ("Fehler finden" and "Neuer Versuch") with
 *   their trade-offs (see renderSolvePanel). Running either claims
 *   `flags.joster.edge.consumed` and locks out the other for this roll.
 * - "Fehler finden" claimed: the reroll-until-success tracker.
 * - "Neuer Versuch" claimed: a stamp marking the roll as replaced (XP
 *   forfeited), linking forward to the reroll that now counts.
 *
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
async function renderEdgeSection(message, html) {
  const data = message.flags?.joster;
  if (!data) return;

  const card = html.querySelector('.joster-roll-card');
  if (!card) return;

  // Idempotent: this can now run more than once per card (see
  // refreshEdgeSectionsFor), so clear whatever it appended last time before
  // recomputing rather than stacking a second panel/tracker/stamp on top.
  card.querySelectorAll('.joster-edge-actions').forEach((el) => el.remove());
  card.classList.remove('joster-replaced');

  // A "Neuer Versuch" reroll replaces the check it came from exactly once
  // (see problem-solving-prd.md) — it's a final result, not a new failed
  // check to chain further edge actions off of, so it never gets its own
  // Problem-lösen panel/tracker/stamp.
  if (data.replaces) return;

  const actor = data.actorId ? game.actors.get(data.actorId) : null;
  const isOwner = actor?.isOwner ?? false;
  const isFailure = data.outcome === 'failure' || data.outcome === 'criticalFailure';

  if (data.edge?.consumed === 'findFlaw') {
    await renderFindFlawTracker(message, card, data, isOwner);
    return;
  }

  if (data.edge?.consumed === 'newAttempt') {
    renderNewAttemptStamp(card, data);
    return;
  }

  if (!isOwner || !isFailure) return;
  const reserve = actor.system.derived?.solveReserve ?? 0;
  if (reserve <= 0) return;

  await renderSolvePanel(message, card, actor, reserve);
}

/**
 * Inline, no-modal picker for the two post-edge actions on a failed roll:
 * a single "Problem lösen" row that expands in place into the two options,
 * each with a one-line trade-off hint and its own run button — clicking a
 * run button both picks and executes that action immediately. Expanding
 * the panel is itself a deliberate first click, so no extra confirm step
 * is needed before the second one commits the point spend.
 *
 * @param {ChatMessage} message
 * @param {HTMLElement} card
 * @param {Actor} actor
 * @param {number} reserve
 */
async function renderSolvePanel(message, card, actor, reserve) {
  const findFlawValue = actor.system.derived?.solveFindFlaw ?? 0;

  const container = document.createElement('div');
  container.className = 'joster-edge-actions';
  container.innerHTML = await renderTemplate('systems/joster/templates/chat/edge-panel.hbs', {
    triggerLabel: game.i18n.format('JOSTER.Dialog.SolveTrigger', { value: reserve }),
    findFlawHint: game.i18n.format('JOSTER.Dialog.SolveFindFlawHint', { value: findFlawValue }),
    newAttemptHint: game.i18n.localize('JOSTER.Dialog.SolveNewAttemptHint'),
  });
  card.appendChild(container);

  const toggle = container.querySelector('.joster-solve-toggle');
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    container.classList.toggle('expanded');
  });

  container.querySelectorAll('[data-solve-action]').forEach((option) => {
    option.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if ((actor.system.derived?.solveReserve ?? 0) <= 0) {
        ui.notifications.warn(game.i18n.localize('JOSTER.Notify.NoReserve'));
        return;
      }
      if (option.dataset.solveAction === 'findFlaw') {
        await startFindFlaw(message, actor);
      } else {
        await startNewAttempt(message, actor);
      }
    });
  });
}

/**
 * @param {ChatMessage} message
 * @param {HTMLElement} card
 * @param {object} data
 * @param {boolean} isOwner
 */
async function renderFindFlawTracker(message, card, data, isOwner) {
  const tracker = data.edge.findFlaw;
  const attempts = tracker.attempts.map((attempt, index) => ({
    index: index + 1,
    dice: attempt.dice
      .map((value, dieIndex) => ({ value, isCounted: dieIndex === attempt.countingIndex }))
      .sort((a, b) => a.value - b.value),
    outcome: attempt.outcome,
    outcomeLabel: game.i18n.localize(
      `JOSTER.RollOutcome.${attempt.outcome.charAt(0).toUpperCase()}${attempt.outcome.slice(1)}`
    ),
  }));
  const pips = Array.from({ length: tracker.max }, (_, index) => {
    const attempt = tracker.attempts[index];
    return { filled: Boolean(attempt), success: attempt?.success ?? false };
  });
  const succeeded = tracker.attempts.some((attempt) => attempt.success);
  const active = tracker.active && isOwner;

  const container = document.createElement('div');
  container.className = 'joster-edge-actions';
  container.innerHTML = await renderTemplate('systems/joster/templates/chat/find-flaw-tracker.hbs', {
    attempts,
    pips,
    active,
    succeeded,
    rerollLabel: game.i18n.format('JOSTER.Roll.FindFlawReroll', { remaining: tracker.max - tracker.used }),
    doneLabel: game.i18n.localize(
      succeeded ? 'JOSTER.Roll.FindFlawSucceeded' : 'JOSTER.Roll.FindFlawExhausted'
    ),
  });
  card.appendChild(container);

  if (active) {
    container.querySelector('.joster-find-flaw-reroll')?.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await rerollFindFlaw(message);
    });
  }
}

/**
 * @param {HTMLElement} card
 * @param {object} data
 */
function renderNewAttemptStamp(card, data) {
  card.classList.add('joster-replaced');

  const replacedBy = data.edge.newAttempt?.replacedBy;

  const container = document.createElement('div');
  container.className = 'joster-edge-actions';

  const stamp = document.createElement('div');
  stamp.className = 'joster-new-attempt-stamp';
  stamp.innerHTML = `<i class="fa-solid fa-arrow-rotate-right"></i> ${game.i18n.localize('JOSTER.Roll.NewAttemptReplaced')}`;
  if (replacedBy) {
    stamp.classList.add('joster-clickable');
    stamp.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      scrollToMessage(replacedBy);
    });
  }

  container.appendChild(stamp);
  card.appendChild(container);
}
