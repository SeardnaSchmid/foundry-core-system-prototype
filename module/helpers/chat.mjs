import { startFindFlaw, rerollFindFlaw } from './dice.mjs';

/**
 * Wire up the "Fehler finden" reroll tracker: a trigger button injected
 * into failed roll cards, and the tracker widget it turns into once
 * activated. Nothing here touches the persisted card content — everything
 * is driven off `flags.joster` and re-rendered per viewer, so only the
 * rolling actor's owner (or a GM) ever sees the controls.
 */
export function registerChatListeners() {
  Hooks.on('renderChatMessageHTML', (message, html) => {
    renderFindFlawSection(message, html);
  });
}

/**
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
async function renderFindFlawSection(message, html) {
  const data = message.flags?.joster;
  if (!data) return;

  const card = html.querySelector('.joster-roll-card');
  if (!card) return;

  const actor = data.actorId ? game.actors.get(data.actorId) : null;
  const isOwner = actor?.isOwner ?? false;
  const isFailure = data.outcome === 'failure' || data.outcome === 'criticalFailure';

  const container = document.createElement('div');
  container.className = 'joster-edge-actions';

  if (!data.edge?.findFlaw) {
    if (!isOwner || !isFailure || data.edge?.consumed) return;
    if ((actor.system.derived?.solveReserve ?? 0) <= 0) return;

    const trigger = document.createElement('a');
    trigger.className = 'joster-edge-action joster-find-flaw-trigger';
    trigger.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> ${game.i18n.localize('JOSTER.Derived.SolveFindFlaw')}`;
    trigger.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if ((actor.system.derived?.solveReserve ?? 0) <= 0) {
        ui.notifications.warn(game.i18n.localize('JOSTER.Notify.NoReserve'));
        return;
      }
      const value = actor.system.derived?.solveFindFlaw ?? 0;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize('JOSTER.Dialog.SolveFindFlawTitle') },
        content: game.i18n.format('JOSTER.Dialog.SolveFindFlawContent', { value }),
      });
      if (!confirmed) return;
      await startFindFlaw(message, actor);
    });

    container.appendChild(trigger);
    card.appendChild(container);
    return;
  }

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
