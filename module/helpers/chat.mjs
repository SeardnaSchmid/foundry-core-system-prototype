import { startTrialError, rerollTrialError, retry, postMortem, claimXp } from './dice.mjs';

/**
 * Wire up the post-edge ("Troubleshoot") actions on a failed roll's chat
 * card. Nothing here touches the persisted card content — everything is
 * driven off `flags.tno` and re-rendered per viewer, so every action's
 * outcome (dice results, edge spent, XP forfeited) lives on the roll's own
 * card instead of cluttering the chat log, and every reopen of the log
 * reflects the current state. Read-only result blocks are shown to all
 * viewers (they replace the standalone cards the reroll/analysis rolls used
 * to spawn), including a non-owner's read-only view of an in-progress or
 * concluded Trial & error tracker; the interactive controls (reroll, XP
 * claim, Troubleshoot menu) are owner/GM-only.
 */
export function registerChatListeners() {
  Hooks.on('renderChatMessageHTML', (message, html) => renderEdgeSection(message, html));

  // A card's edge section is gated on the actor's edge pool at render time.
  // If the pool changes afterward (a Post-mortem refund, or a point just
  // spent), re-render every visible card belonging to this actor so its
  // controls reflect the new pool.
  Hooks.on('updateActor', (actor) => refreshEdgeSectionsFor(actor));
}

/**
 * @param {Actor} actor
 */
function refreshEdgeSectionsFor(actor) {
  for (const element of document.querySelectorAll('[data-message-id]')) {
    const message = game.messages.get(element.dataset.messageId);
    if (message?.flags?.tno?.actorId !== actor.id) continue;
    renderEdgeSection(message, element);
  }
}

/**
 * After a card expands in place (troubleshoot view, armed retry), scroll it
 * back into the chat log so the whole taller card is visible. Deferred a frame
 * so the layout reflows to the new height first.
 *
 * @param {HTMLElement} card
 */
function scrollCardIntoView(card) {
  requestAnimationFrame(() => card.scrollIntoView({ behavior: 'smooth', block: 'end' }));
}

/** Localized outcome label ("Success"/"Failure"/…) for a `flags.tno` outcome. */
function outcomeLabel(outcome) {
  return game.i18n.localize(`TNO.RollOutcome.${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}`);
}

/** A row of dice (sorted, the counting die flagged), reusing the tracker die styling. */
function diceRowHtml(dice) {
  const dies = dice
    .map((d) => `<span class="tno-find-flaw-die${d.isCounted ? ' counted' : ''}">${d.value}</span>`)
    .join('');
  return `<span class="tno-edge-result-dice">${dies}</span>`;
}

/**
 * Render the failed roll's on-card edge section from `flags.tno`. Order:
 * public read-only result blocks (Retry / Post-mortem dice, XP stamp, and —
 * for non-owners — the Trial & error tracker) for every viewer, then the
 * owner/GM interactive panel (Trial-&-error tracker and the two-view guided
 * controls) for the owner only, then the activity summary — also public —
 * last.
 *
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
async function renderEdgeSection(message, html) {
  const data = message.flags?.tno;
  if (!data) return;

  const card = html.querySelector('.tno-roll-card');
  if (!card) return;

  // The "troubleshoot vs main" view is transient per-viewer UI state, never
  // persisted. Read whichever view is currently showing before wiping the
  // section, so a re-render triggered by an action (flag update) keeps the
  // player on the same screen instead of snapping back to the XP buttons.
  const view = card.querySelector('.tno-edge-actions.troubleshoot') ? 'troubleshoot' : 'main';
  card.querySelectorAll('.tno-edge-actions').forEach((el) => el.remove());

  // Base dice (and legacy pre-inline Post-mortem cards) opt out of the edge UI
  // entirely. `data.replaces` is a legacy flag on the standalone reroll cards
  // Retry produced before v2.2 (rerolls are inline now) — those historical
  // cards keep opting out too.
  if (data.edgeExempt || data.replaces) return;

  const actor = data.actorId ? game.actors.get(data.actorId) : null;
  const isOwner = actor?.isOwner ?? false;

  // Public read-only blocks — shown to everyone, since these replace the
  // standalone chat cards the reroll/analysis rolls used to post.
  if (data.edge?.newAttempt?.result) renderRetryResult(card, data);
  if (data.edge?.analyzeFlaw?.result) renderPostMortemResult(card, data);
  if (data.edge?.xpClaim?.claimed) renderXpClaimedStamp(card, data);
  if (!isOwner && data.edge?.findFlaw) await renderTrialErrorProgress(card, data);

  const isFailure = data.outcome === 'failure' || data.outcome === 'criticalFailure';
  if (isOwner && isFailure) {
    await renderOwnerPanel(message, card, actor, data, view);
  }

  // The dimmed activity summary is read-only accounting (which action was
  // taken, refund/no-refund) — public to every viewer, not just the owner.
  renderSummaryBlock(card, data);
}

/**
 * Public "the result that counts" block for a Retry (rolled in place, no
 * separate card): the reroll's dice and outcome, on the original card.
 *
 * @param {HTMLElement} card
 * @param {object} data
 */
function renderRetryResult(card, data) {
  const r = data.edge.newAttempt.result;
  const container = document.createElement('div');
  container.className = 'tno-edge-actions';
  container.innerHTML = `
    <div class="tno-edge-result ${r.outcome}">
      <span class="tno-edge-result-caption"><i class="fa-solid fa-arrow-rotate-right"></i> ${game.i18n.localize('TNO.Roll.NewAttemptCounts')}</span>
      ${diceRowHtml(r.dice)}
      <span class="tno-edge-result-outcome">${outcomeLabel(r.outcome)}</span>
    </div>`;
  card.appendChild(container);
}

/**
 * Public result block for a Post-mortem analysis roll (rolled in place): its
 * 3d20 against the analyze value, pass or fail.
 *
 * @param {HTMLElement} card
 * @param {object} data
 */
function renderPostMortemResult(card, data) {
  const r = data.edge.analyzeFlaw.result;
  const caption = game.i18n.localize('TNO.Derived.PostMortem');
  const container = document.createElement('div');
  container.className = 'tno-edge-actions';
  container.innerHTML = `
    <div class="tno-edge-result ${r.outcome}">
      <span class="tno-edge-result-caption"><i class="fa-solid fa-magnifying-glass-chart"></i> ${caption} (&le; ${r.threshold})</span>
      ${diceRowHtml(r.dice)}
      <span class="tno-edge-result-outcome">${outcomeLabel(r.outcome)}</span>
    </div>`;
  card.appendChild(container);
}

/**
 * Public read-only Trial & error tracker for non-owner viewers: the same
 * pips/attempts markup the owner sees, without the reroll control.
 *
 * @param {HTMLElement} card
 * @param {object} data
 */
async function renderTrialErrorProgress(card, data) {
  const tracker = buildTracker(data, null);
  const container = document.createElement('div');
  container.className = 'tno-edge-actions';
  container.innerHTML = await renderTemplate('systems/tno/templates/chat/parts/trial-error-tracker.hbs', {
    tracker,
    showReroll: false,
  });
  card.appendChild(container);
}

/**
 * The dimmed activity summary lines, public to every viewer: the
 * edge-economy events that happened to this roll (spent points, XP
 * forfeited, refunds, the no-time-pressure claim), derived from
 * `flags.tno.edge` — no separate log is persisted. This is where the GM (and
 * everyone else at the table) sees the "no time pressure" claim, instead of
 * a chat message.
 *
 * @param {object} data
 * @returns {string[]}
 */
function buildSummary(data) {
  const lines = [];
  const edge = data.edge ?? {};

  if (edge.consumed === 'findFlaw') {
    lines.push(game.i18n.localize('TNO.Edge.SummaryTrialError'));
  }
  if (edge.analyzeFlaw?.used) {
    lines.push(
      game.i18n.localize(edge.analyzeFlaw.success ? 'TNO.Edge.SummaryPostMortemRefund' : 'TNO.Edge.SummaryPostMortemNoRefund')
    );
  }
  if (edge.consumed === 'newAttempt') {
    lines.push(game.i18n.localize('TNO.Edge.SummaryRetry'));
  }

  return lines;
}

/**
 * Public summary block: the dimmed activity lines from {@link buildSummary},
 * shown to every viewer (owner and non-owner alike). A no-op when there's
 * nothing to report yet.
 *
 * @param {HTMLElement} card
 * @param {object} data
 */
function renderSummaryBlock(card, data) {
  const summary = buildSummary(data);
  if (summary.length === 0) return;

  const container = document.createElement('div');
  container.className = 'tno-edge-actions';
  container.innerHTML = `
    <div class="tno-edge-summary">
      ${summary.map((line) => `<span class="tno-edge-summary-line">${line}</span>`).join('')}
    </div>`;
  card.appendChild(container);
}

/**
 * View model for the Trial-&-error pip tracker (display + reroll control):
 * the attempts so far, the pip row, and the per-reroll Insight toggle state.
 *
 * @param {object} data
 * @param {Actor} actor
 * @returns {object}
 */
function buildTracker(data, actor) {
  const tracker = data.edge.findFlaw;
  const attempts = tracker.attempts.map((attempt, index) => {
    const base = outcomeLabel(attempt.outcome);
    return {
      index: index + 1,
      dice: attempt.dice
        .map((value, dieIndex) => ({ value, isCounted: dieIndex === attempt.countingIndex }))
        .sort((a, b) => a.value - b.value),
      outcome: attempt.outcome,
      outcomeLabel: attempt.ideaBonus > 0 ? `${base} (+${attempt.ideaBonus})` : base,
    };
  });
  const pips = Array.from({ length: tracker.max }, (_, index) => {
    const attempt = tracker.attempts[index];
    return { filled: Boolean(attempt), success: attempt?.success ?? false };
  });
  const succeeded = tracker.attempts.some((attempt) => attempt.success);
  const reserve = actor?.system.derived?.edgePool ?? 0;

  return {
    attempts,
    pips,
    active: tracker.active,
    succeeded,
    // "Insight" on a reroll is its own independent choice per attempt, gated
    // the same as the roll dialog's toggle (character actors, pool > 0).
    hasIdea: tracker.active && actor?.type === 'character',
    ideaDisabled: reserve <= 0,
    ideaLabel: game.i18n.format('TNO.Edge.TrialIdeaLabel', { value: actor?.system.derived?.insight ?? 0 }),
    statusLabel: game.i18n.format('TNO.Roll.FindFlawRemaining', { remaining: tracker.max - tracker.used, max: tracker.max }),
    rerollLabel: game.i18n.format('TNO.Roll.FindFlawReroll', { remaining: tracker.max - tracker.used }),
    doneLabel: game.i18n.localize(succeeded ? 'TNO.Roll.FindFlawSucceeded' : 'TNO.Roll.FindFlawExhausted'),
  };
}

/**
 * Whether the once-per-failure-chain XP claim is still available on a
 * failed roll: only for a skill+attribute check, not yet claimed, and no
 * problem-solving action taken. Every edge action forfeits the XP — Retry and
 * Trial & error (both set `edge.consumed`) and Post-mortem — regardless of how
 * the action itself turns out.
 *
 * @param {object} data  The message's flags.tno.
 * @returns {boolean}
 */
function xpClaimEligible(data) {
  if (!data.skillKey) return false;
  if (data.edge?.xpClaim?.claimed) return false;
  if (data.edge?.consumed) return false;
  if (data.edge?.analyzeFlaw?.used) return false;
  return true;
}

/**
 * The two "Lesson learned" XP-claim buttons (the golden path). Empty once the
 * claim window has closed (see xpClaimEligible).
 *
 * @param {object} data
 * @returns {Array<{action: string, label: string}>}
 */
function buildXpOptions(data) {
  if (!xpClaimEligible(data)) return [];
  return [
    { action: 'xpSkill', label: game.i18n.format('TNO.Edge.LessonButton', { label: data.skillLabel }) },
    { action: 'xpAttribute', label: game.i18n.format('TNO.Edge.LessonButton', { label: data.attributeLabel }) },
  ];
}

/**
 * The grouped "Troubleshoot" action rows: Post-mortem (until used), then the
 * guided "Try again — got time?" pair (Trial & error / Retry), offered only
 * before either reroll has claimed this roll.
 *
 * @param {object} data
 * @param {Actor} actor
 * @returns {Array<{label: string|null, options: Array<object>}>}
 */
function buildEdgeGroups(data, actor) {
  const groups = [];
  const reserve = actor.system.derived?.edgePool ?? 0;
  const reserveMax = actor.system.derived?.edgePoolMax ?? 0;

  if (!data.edge?.consumed) {
    const trialErrorValue = actor.system.derived?.trialErrorMax ?? 0;
    groups.push({
      label: game.i18n.localize('TNO.Edge.TryAgainQuestion'),
      chooser: true,
      options: [
        {
          action: 'trialError',
          icon: 'fa-clock',
          big: true,
          title: game.i18n.localize('TNO.Edge.OptionTrialError'),
          hint: game.i18n.format('TNO.Edge.TrialErrorHint', { value: trialErrorValue }),
          disabled: false,
        },
        {
          action: 'retry',
          icon: 'fa-arrow-rotate-right',
          big: true,
          title: game.i18n.localize('TNO.Edge.OptionRetry'),
          hint: game.i18n.localize('TNO.Edge.RetryHint'),
          disabled: reserve <= 0,
        },
      ],
    });
  }

  // Post-mortem is off once any reroll has touched this roll: starting Trial &
  // error or a Retry (both set `consumed`) forfeits the chance to analyze it.
  if (!data.edge?.analyzeFlaw?.used && !data.edge?.consumed) {
    const disabled = reserve >= reserveMax;
    groups.push({
      label: game.i18n.localize('TNO.Edge.RefillSection'),
      section: true,
      options: [
        {
          action: 'postMortem',
          icon: 'fa-magnifying-glass',
          title: game.i18n.localize('TNO.Edge.OptionPostMortem'),
          hint: disabled ? game.i18n.localize('TNO.Notify.ReserveFull') : game.i18n.localize('TNO.Edge.PostMortemHint'),
          disabled,
        },
      ],
    });
  }

  return groups;
}

/**
 * The owner/GM interactive panel: Trial-&-error tracker display (always
 * shown) plus a two-view guided switch. The "main" view shows the XP-claim
 * buttons + a Troubleshoot button; clicking Troubleshoot hides the XP
 * buttons and reveals the edge actions (Post-mortem / Trial & error / Retry,
 * and the reroll control mid-chain) plus a Back button. The view is a pure
 * CSS toggle on the container (no flag write, no re-render). The XP buttons
 * only ever show on a still-clean failure — any problem-solving action
 * forfeits the claim (see xpClaimEligible), so once one is taken the main
 * view carries just the Troubleshoot toggle. The activity summary is public
 * (see {@link renderSummaryBlock}) and rendered separately, not here.
 *
 * @param {ChatMessage} message
 * @param {HTMLElement} card
 * @param {Actor} actor
 * @param {object} data
 * @param {'main'|'troubleshoot'} view  The view to restore after a rebuild.
 */
async function renderOwnerPanel(message, card, actor, data, view) {
  // Any problem-solving action commits the roll. Once one is taken the card
  // stops offering navigation and the other actions — no Troubleshoot toggle,
  // no Back, no cross-action rows — so each choice is final:
  //   · Trial & error → only its own reroll tracker lives on (no Back).
  //   · Retry / Lesson learned → hard-terminal (public result/stamp + summary).
  //   · Post-mortem → done; no Troubleshoot re-entry to Trial & error / Retry.
  const committed =
    Boolean(data.edge?.consumed) ||
    Boolean(data.edge?.analyzeFlaw?.used) ||
    Boolean(data.edge?.xpClaim?.claimed);
  const tracker = data.edge?.consumed === 'findFlaw' ? buildTracker(data, actor) : null;
  const xpOptions = committed ? [] : buildXpOptions(data);
  const groups = committed ? [] : buildEdgeGroups(data, actor);
  const reserve = actor.system.derived?.edgePool ?? 0;

  const hasEdgeActions = groups.length > 0 || Boolean(tracker?.active);
  const hasControls = xpOptions.length > 0 || hasEdgeActions;
  const showViews = hasControls || Boolean(tracker);

  if (!tracker && !hasControls) return;

  // "Retry" is offered only on a still-clean failure with a payable pool. When
  // available, arm a confirm step (with an optional Insight boost) instead of
  // rolling on click.
  const armedRetry =
    !committed && reserve > 0
      ? {
          title: game.i18n.localize('TNO.Edge.RetryName'),
          hint: game.i18n.localize('TNO.Edge.RetryArmedHint'),
          hasIdea: actor.type === 'character',
          ideaDisabled: reserve < 2,
          ideaLabel: game.i18n.format('TNO.Edge.RetryIdeaLabel', { value: actor.system.derived?.insight ?? 0 }),
          cancelLabel: game.i18n.localize('TNO.Edge.RetryCancel'),
          runLabel: game.i18n.localize('TNO.Edge.RetryRun'),
        }
      : null;

  const container = document.createElement('div');
  container.className = 'tno-edge-actions';
  // Land on the troubleshoot view whenever a tracker is showing (you just
  // started Trial & error, or you're mid-chain), or when restoring it after
  // an action re-render.
  if (tracker || (view === 'troubleshoot' && hasEdgeActions)) container.classList.add('troubleshoot');
  container.innerHTML = await renderTemplate('systems/tno/templates/chat/edge-panel.hbs', {
    tracker,
    xpOptions,
    xpCaption: game.i18n.localize('TNO.Edge.LessonCaption'),
    groups,
    armedRetry,
    showViews,
    committed,
    hasControls,
    hasEdgeActions,
    triggerLabel: game.i18n.format('TNO.Edge.Trigger', { value: reserve }),
    backLabel: game.i18n.localize('TNO.Edge.Back'),
  });
  card.appendChild(container);

  // View switch — pure show/hide, no re-render (see the CSS `.troubleshoot`).
  // Expanding grows the card below the fold, so pull its now-taller self back
  // into view in the chat log.
  container.querySelector('.tno-edge-toggle')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    container.classList.add('troubleshoot');
    scrollCardIntoView(card);
  });
  container.querySelector('.tno-edge-back')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    container.classList.remove('troubleshoot');
  });

  // Trial-&-error reroll control.
  container.querySelector('.tno-find-flaw-reroll')?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const useIdea = container.querySelector('.tno-find-flaw-idea-toggle')?.checked ?? false;
    await rerollTrialError(message, useIdea);
  });
  // The Insight checkbox keeps its native toggle; only stop the click from
  // bubbling into the roll card's own dice-tooltip expand handler.
  container.querySelector('.tno-find-flaw-idea')?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  // Armed-retry confirm step: the "Retry" row reveals it (a pure show/hide,
  // like the troubleshoot toggle); Cancel hides it; Roll spends the edge and
  // rerolls, optionally boosted by Insight.
  container.querySelector('.tno-edge-retry-cancel')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    container.classList.remove('retry-armed');
  });
  container.querySelector('.tno-edge-retry-run')?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if ((actor.system.derived?.edgePool ?? 0) <= 0) {
      ui.notifications.warn(game.i18n.localize('TNO.Notify.NoReserve'));
      return;
    }
    const useIdea = container.querySelector('.tno-edge-retry-idea')?.checked ?? false;
    await retry(message, actor, useIdea);
  });

  // Action rows / XP buttons.
  container.querySelectorAll('[data-edge-action]').forEach((option) => {
    option.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      switch (option.dataset.edgeAction) {
        case 'trialError':
          return startTrialError(message, actor);
        case 'retry':
          if ((actor.system.derived?.edgePool ?? 0) <= 0) {
            ui.notifications.warn(game.i18n.localize('TNO.Notify.NoReserve'));
            return;
          }
          container.classList.add('retry-armed');
          scrollCardIntoView(card);
          return;
        case 'postMortem':
          return postMortem(message, actor);
        case 'xpSkill':
          return claimXp(message, actor, 'skill');
        case 'xpAttribute':
          return claimXp(message, actor, 'attribute');
      }
    });
  });
}

/**
 * Public terminal stamp shown once the XP claim has been used on this failure.
 *
 * @param {HTMLElement} card
 * @param {object} data
 */
function renderXpClaimedStamp(card, data) {
  const label = data.edge.xpClaim.target === 'skill' ? data.skillLabel : data.attributeLabel;

  const container = document.createElement('div');
  container.className = 'tno-edge-actions';

  const stamp = document.createElement('div');
  stamp.className = 'tno-new-attempt-stamp';
  stamp.innerHTML = `<i class="fa-solid fa-star"></i> ${game.i18n.format('TNO.Roll.XpClaimed', { label })}`;

  container.appendChild(stamp);
  card.appendChild(container);
}
