/**
 * Advantage/disadvantage levels for the Edgefall 3d20 roll mechanic.
 * @type {Object<string, number>}
 */
export const EDGEFALL_ADVANTAGE = {
  strongDisadvantage: -2,
  disadvantage: -1,
  none: 0,
  advantage: 1,
  strongAdvantage: 2,
};

/**
 * Short badge labels for each advantage level, used anywhere the roll type
 * needs to be shown at a glance (chat card badge, roll dialog picker).
 * @type {Object<number, string>}
 */
export const EDGEFALL_ADVANTAGE_ABBR = {
  [EDGEFALL_ADVANTAGE.strongDisadvantage]: 'DIS+',
  [EDGEFALL_ADVANTAGE.disadvantage]: 'DIS',
  [EDGEFALL_ADVANTAGE.none]: 'STD',
  [EDGEFALL_ADVANTAGE.advantage]: 'ADV',
  [EDGEFALL_ADVANTAGE.strongAdvantage]: 'ADV+',
};

/**
 * How many d20 are rolled for a given advantage level. Simple advantage/
 * disadvantage only ever look at 2 dice; everything else rolls the full 3d20.
 * @param {number} advantage  One of the EDGEFALL_ADVANTAGE values.
 * @returns {number}
 */
export function dieCountFor(advantage) {
  return Math.abs(advantage) === 1 ? 2 : 3;
}

/**
 * Pick which rolled die counts ("geltender Würfel") for a given advantage
 * level, per the "Würfelmechanik" rules:
 * - none (3d20): the middle value counts.
 * - simple advantage/disadvantage (2d20): the lower/higher value counts.
 * - strong advantage/disadvantage (3d20): the lowest/highest value counts.
 * Lower is always better, since success means the counting die is <= the
 * threshold.
 *
 * @param {number[]} values     Raw die results, in roll order.
 * @param {number} advantage    One of the EDGEFALL_ADVANTAGE values.
 * @returns {{value: number, index: number}}  The counting die's value and
 *   its index into `values`.
 */
export function pickCountingDie(values, advantage) {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);

  switch (advantage) {
    case EDGEFALL_ADVANTAGE.strongDisadvantage:
      return order[order.length - 1];
    case EDGEFALL_ADVANTAGE.disadvantage:
      return order[order.length - 1];
    case EDGEFALL_ADVANTAGE.advantage:
      return order[0];
    case EDGEFALL_ADVANTAGE.strongAdvantage:
      return order[0];
    case EDGEFALL_ADVANTAGE.none:
    default:
      return order[Math.floor(order.length / 2)];
  }
}

/**
 * Determine whether the roll is a critical success/failure, independent of
 * the threshold. See the "Kritische Erfolge und Misserfolge" rules:
 * - none: 2+ of 3 dice show 1 -> critical success; 2+ show 20 -> critical failure.
 * - simple advantage: 1+ die shows 1 -> critical success; 2 dice show 20 -> critical failure.
 * - simple disadvantage: 1+ die shows 20 -> critical failure; 2 dice show 1 -> critical success.
 * - strong advantage: 1+ die shows 1 -> critical success; all 3 dice show 20 -> critical failure.
 * - strong disadvantage: 1+ die shows 20 -> critical failure; all 3 dice show 1 -> critical success.
 *
 * @param {number[]} values    Raw die results.
 * @param {number} advantage   One of the EDGEFALL_ADVANTAGE values.
 * @returns {'criticalSuccess'|'criticalFailure'|null}
 */
export function criticalResultFor(values, advantage) {
  const ones = values.filter((v) => v === 1).length;
  const twenties = values.filter((v) => v === 20).length;

  switch (advantage) {
    case EDGEFALL_ADVANTAGE.advantage:
      if (ones >= 1) return 'criticalSuccess';
      if (twenties >= 2) return 'criticalFailure';
      return null;
    case EDGEFALL_ADVANTAGE.disadvantage:
      if (twenties >= 1) return 'criticalFailure';
      if (ones >= 2) return 'criticalSuccess';
      return null;
    case EDGEFALL_ADVANTAGE.strongAdvantage:
      if (ones >= 1) return 'criticalSuccess';
      if (twenties === 3) return 'criticalFailure';
      return null;
    case EDGEFALL_ADVANTAGE.strongDisadvantage:
      if (twenties >= 1) return 'criticalFailure';
      if (ones === 3) return 'criticalSuccess';
      return null;
    case EDGEFALL_ADVANTAGE.none:
    default:
      if (ones >= 2) return 'criticalSuccess';
      if (twenties >= 2) return 'criticalFailure';
      return null;
  }
}

/**
 * Roll the Edgefall dice mechanic against a threshold and post the result to
 * chat.
 *
 * @param {object} options
 * @param {number} [options.threshold]         The threshold to roll against. Omit for a "base"
 *   roll with no success/failure evaluation (just the dice and, if it lands, a critical) —
 *   see rollEdgefallBase.
 * @param {number} [options.advantage]         One of the EDGEFALL_ADVANTAGE values.
 * @param {string} [options.flavor]            Label shown above the roll (e.g. the ability name).
 * @param {Actor} [options.actor]              The rolling actor, used for the chat speaker.
 * @param {string} [options.rollMode]          Chat roll mode; defaults to the current core setting.
 * @param {{label: string, value: number}[]} [options.components]  Threshold components
 *   (e.g. attribute and skill) shown in the expanded roll breakdown.
 * @param {number} [options.bonus]             Situational modifier shown in the breakdown.
 * @param {object} [options.extraFlags]        Extra properties merged into the message's
 *   `flags.edgefall`, e.g. `{ replaces: <messageId> }` for a "Neuer Versuch" reroll.
 * @returns {Promise<{roll: Roll, success: boolean|null, message: ChatMessage}>}
 */
export async function rollEdgefall({
  threshold = null,
  advantage = EDGEFALL_ADVANTAGE.none,
  flavor = '',
  actor = null,
  rollMode = null,
  components = [],
  bonus = 0,
  extraFlags = {},
} = {}) {
  const dieCount = dieCountFor(advantage);
  const roll = new Roll(`${dieCount}d20`);
  await roll.evaluate();

  const values = roll.terms[0].results.map((r) => r.result);
  const counting = pickCountingDie(values, advantage);
  const critical = criticalResultFor(values, advantage);

  // A base roll (no threshold) has nothing to evaluate success/failure
  // against — only a landed critical still counts as an outcome.
  const hasThreshold = threshold !== null;
  const success = critical ? critical === 'criticalSuccess' : hasThreshold ? counting.value <= threshold : null;
  const outcome = critical ?? (hasThreshold ? (success ? 'success' : 'failure') : null);

  const dice = values
    .map((value, index) => ({
      value,
      isCounted: index === counting.index,
    }))
    .sort((a, b) => a.value - b.value);

  const advantageKey = Object.keys(EDGEFALL_ADVANTAGE).find((key) => EDGEFALL_ADVANTAGE[key] === advantage);

  const content = await renderTemplate('systems/edgefall/templates/chat/roll-card.hbs', {
    flavor,
    hasThreshold,
    threshold,
    dice,
    countingValue: counting.value,
    success,
    outcome,
    outcomeLabel: outcome ? game.i18n.localize(`EDGEFALL.RollOutcome.${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}`) : '',
    advantageLabel: game.i18n.localize(`EDGEFALL.Advantage.${advantageKey.charAt(0).toUpperCase()}${advantageKey.slice(1)}`),
    advantageAbbr: EDGEFALL_ADVANTAGE_ABBR[advantage],
    components,
    showBonus: bonus !== 0,
    bonusDisplay: bonus > 0 ? `+${bonus}` : `${bonus}`,
  });

  // Failed rolls carry enough context in flags.edgefall for the post-edge
  // actions (see chat.mjs) to be offered and, once activated, to replay
  // this roll's parameters exactly: "Fehler finden" rerolls in place on
  // this same message, "Neuer Versuch" spins up a brand-new message via
  // this same rollEdgefall() call, fed straight from these flags. The
  // original card content is never touched by either.
  const message = await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
    flavor,
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    rollMode: rollMode ?? game.settings.get('core', 'rollMode'),
    flags: {
      edgefall: {
        actorId: actor?.id ?? null,
        threshold,
        advantage,
        flavor,
        components,
        bonus,
        outcome,
        edge: { consumed: null, findFlaw: null, newAttempt: null },
        ...extraFlags,
      },
    },
  });

  return { roll, success, message };
}

/**
 * Roll the bare Edgefall dice mechanic ("Basiswürfel"): advantage/disadvantage
 * picks the die count as usual, but there's no threshold to check against —
 * only a landed critical (2+/all dice on 1 or 20, per advantage level) shows
 * as an outcome. Meant for rolls made outside any actor/skill context (e.g.
 * a GM calling for a plain 3d20), so it takes no actor by default.
 *
 * @param {object} [options]
 * @param {number} [options.advantage]  One of the EDGEFALL_ADVANTAGE values.
 * @param {string} [options.flavor]     Label shown above the roll.
 * @param {Actor} [options.actor]       Optional rolling actor, used for the chat speaker.
 * @returns {Promise<{roll: Roll, success: boolean|null, message: ChatMessage}>}
 */
export async function rollEdgefallBase({ advantage = EDGEFALL_ADVANTAGE.none, flavor = '', actor = null } = {}) {
  return rollEdgefall({
    threshold: null,
    advantage,
    flavor: flavor || game.i18n.localize('EDGEFALL.Roll.BaseDiceFlavor'),
    actor,
    // Not a skill+attribute check — a landed critical failure here must not
    // offer the "Problem lösen" edge pool (see problem-solving-prd.md).
    extraFlags: { edgeExempt: true },
  });
}

/**
 * Start the "Fehler finden" reroll tracker on a failed roll's chat message:
 * spends one reserve point and attaches an empty tracker to the message's
 * flags, which the renderChatMessageHTML hook (see chat.mjs) then renders
 * as a pip tracker with a reroll button in place of the trigger button.
 *
 * @param {ChatMessage} message  The failed roll's chat message.
 * @param {Actor} actor          The rolling actor, spending the reserve point.
 * @returns {Promise<void>}
 */
export async function startFindFlaw(message, actor) {
  const value = actor.system.derived?.solveFindFlaw ?? 0;
  const spent = actor.system.problemSolving?.spent ?? 0;
  await actor.update({ 'system.problemSolving.spent': spent + 1 });

  await message.update({
    'flags.edgefall.edge.consumed': 'findFlaw',
    'flags.edgefall.edge.findFlaw': { max: value, used: 0, active: value > 0, attempts: [] },
  });

  const reserveMax = actor.system.derived?.solveReserveMax ?? 0;
  const reserve = actor.system.derived?.solveReserve ?? 0;

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: game.i18n.format('EDGEFALL.Chat.SolveFindFlawSuccess', { name: actor.name, value, current: reserve, max: reserveMax }),
  });
}

/**
 * Reroll a check under the "Fehler finden" tracker: rolls the same die
 * count against the same threshold/advantage as the original check,
 * appends the attempt to the tracker, and stops the tracker at the first
 * success or once the max reroll count is used up.
 *
 * @param {ChatMessage} message  The chat message carrying the active tracker.
 * @returns {Promise<void>}
 */
export async function rerollFindFlaw(message) {
  const data = message.flags?.edgefall;
  const tracker = data?.edge?.findFlaw;
  if (!tracker?.active) return;

  const dieCount = dieCountFor(data.advantage);
  const roll = new Roll(`${dieCount}d20`);
  await roll.evaluate();

  // The original roll's animation/sound comes for free from ChatMessage.create
  // seeing `rolls: [roll]` (Dice So Nice hooks createChatMessage). This
  // reroll never creates a new message — it only patches flags on the
  // existing tracker — so it has to trigger Dice So Nice itself. Without
  // the module, fall back to the plain roll sound so a reroll is still felt.
  if (game.dice3d) {
    await game.dice3d.showForRoll(roll, game.user, true);
  } else {
    foundry.audio.AudioHelper.play({ src: CONFIG.sounds.dice, volume: 0.8, autoplay: true, loop: false }, true);
  }

  const values = roll.terms[0].results.map((r) => r.result);
  const counting = pickCountingDie(values, data.advantage);
  const critical = criticalResultFor(values, data.advantage);
  const success = critical ? critical === 'criticalSuccess' : counting.value <= data.threshold;
  const outcome = critical ?? (success ? 'success' : 'failure');

  const used = tracker.used + 1;
  const active = !success && used < tracker.max;

  await message.update({
    'flags.edgefall.edge.findFlaw.used': used,
    'flags.edgefall.edge.findFlaw.active': active,
    'flags.edgefall.edge.findFlaw.attempts': [
      ...tracker.attempts,
      { dice: values, countingIndex: counting.index, success, outcome },
    ],
  });
}

/**
 * Trigger "Neuer Versuch" on a failed roll's chat message: spends one
 * reserve point, forfeits the XP the original check would have earned, and
 * has the system reroll the check itself, once, under identical
 * parameters. Unlike "Fehler finden" there's no player choice left once
 * triggered — the second result replaces the first outright — so the
 * reroll isn't handed to the player as a number to act on; it's carried out
 * here as a brand-new chat message, and the original is stamped (via
 * `flags.edgefall.edge.newAttempt`) as replaced, linking forward to it.
 *
 * @param {ChatMessage} message  The failed roll's chat message.
 * @param {Actor} actor          The rolling actor, spending the reserve point.
 * @returns {Promise<void>}
 */
export async function startNewAttempt(message, actor) {
  const data = message.flags?.edgefall;
  if (!data) return;

  const spent = actor.system.problemSolving?.spent ?? 0;
  await actor.update({ 'system.problemSolving.spent': spent + 1 });

  await message.update({
    'flags.edgefall.edge.consumed': 'newAttempt',
    'flags.edgefall.edge.newAttempt': { replacedBy: null },
  });

  const reserveMax = actor.system.derived?.solveReserveMax ?? 0;
  const reserve = actor.system.derived?.solveReserve ?? 0;

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: game.i18n.format('EDGEFALL.Chat.SolveNewAttemptSuccess', { name: actor.name, current: reserve, max: reserveMax }),
  });

  const { message: rerollMessage } = await rollEdgefall({
    threshold: data.threshold,
    advantage: data.advantage,
    flavor: data.flavor,
    actor,
    components: data.components ?? [],
    bonus: data.bonus ?? 0,
    extraFlags: { replaces: message.id },
  });

  await message.update({ 'flags.edgefall.edge.newAttempt.replacedBy': rerollMessage.id });
}
