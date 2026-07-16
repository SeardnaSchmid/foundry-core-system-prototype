import { dieCountFor, resolveOutcome, buildRollCardContext } from './dice.mjs';

/**
 * Register the click handlers for the "Problem lösen" actions (Idee haben,
 * Fehler finden, Neuer Versuch) rendered on Joster roll chat cards. Each
 * action spends one point from the actor's problem-solving reserve and
 * revises the roll card in place, per the "Problem lösen"-Vorrat rules:
 * - Idee haben: adds the actor's current Idee-haben value on top of the
 *   roll's threshold and re-evaluates the existing dice against it.
 * - Fehler finden: rerolls the whole check up to the actor's Fehler-finden
 *   value times, stopping at the first success.
 * - Neuer Versuch: rerolls the whole check exactly once; the new result
 *   replaces the old one outright.
 * Each of the three actions can only be used once per roll.
 */
export function registerSolveActionListeners() {
  Hooks.on('renderChatMessage', (message, html) => {
    html.find('[data-solve-action]').on('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSolveActionClick(event, message);
    });
  });
}

/**
 * @param {JQuery.ClickEvent} event
 * @param {ChatMessage} message
 */
async function onSolveActionClick(event, message) {
  const action = event.currentTarget.dataset.solveAction;
  const state = message.flags?.joster;
  if (!state) return;

  const actor = state.actorUuid ? await fromUuid(state.actorUuid) : null;
  if (!actor) return;

  if (!actor.isOwner && !game.user.isGM) {
    ui.notifications?.warn(game.i18n.localize('JOSTER.Notify.NoPermission'));
    return;
  }

  if (state.solve[usedFlagFor(action)]) return;

  const reserve = actor.system.derived?.solveReserve ?? 0;
  if (reserve <= 0) {
    ui.notifications?.warn(game.i18n.localize('JOSTER.Notify.NoReserve'));
    return;
  }

  const solve = foundry.utils.deepClone(state.solve);
  let values = [...state.values];

  if (action === 'idea') {
    const value = actor.system.derived?.solveIdea ?? 0;
    solve.ideaBonus += value;
    solve.log.push(game.i18n.format('JOSTER.Roll.SolveIdeaApplied', { value }));
  } else if (action === 'findFlaw') {
    const maxAttempts = Math.max(1, actor.system.derived?.solveFindFlaw ?? 1);
    const threshold = state.threshold + solve.ideaBonus;
    let attempt = 0;
    let succeeded = false;
    while (attempt < maxAttempts && !succeeded) {
      attempt += 1;
      values = await rollDice(dieCountFor(state.advantage));
      succeeded = resolveOutcome(values, state.advantage, threshold).success;
    }
    solve.log.push(
      game.i18n.format(succeeded ? 'JOSTER.Roll.SolveFindFlawAppliedSuccess' : 'JOSTER.Roll.SolveFindFlawAppliedFailure', {
        attempt,
        max: maxAttempts,
      })
    );
  } else if (action === 'newAttempt') {
    values = await rollDice(dieCountFor(state.advantage));
    solve.log.push(game.i18n.localize('JOSTER.Roll.SolveNewAttemptApplied'));
  } else {
    return;
  }

  solve[usedFlagFor(action)] = true;

  await actor.update({ 'system.problemSolving.spent': (actor.system.problemSolving?.spent ?? 0) + 1 });

  const content = await renderTemplate(
    'systems/joster/templates/chat/roll-card.hbs',
    buildRollCardContext({
      flavor: state.flavor,
      values,
      advantage: state.advantage,
      threshold: state.threshold + solve.ideaBonus,
      components: state.components,
      bonus: state.bonus,
      nonStandard: state.nonStandard,
      solve,
      actor,
    })
  );

  await message.update({
    content,
    'flags.joster.values': values,
    'flags.joster.solve': solve,
  });
}

/**
 * @param {string} action  'idea' | 'findFlaw' | 'newAttempt'
 * @returns {string}  The matching `solve` flag key.
 */
function usedFlagFor(action) {
  return `used${action.charAt(0).toUpperCase()}${action.slice(1)}`;
}

/**
 * Roll `count` d20 and return the raw results.
 * @param {number} count
 * @returns {Promise<number[]>}
 */
async function rollDice(count) {
  const roll = new Roll(`${count}d20`);
  await roll.evaluate();
  return roll.terms[0].results.map((r) => r.result);
}
