// The one import this module makes. `dice-odds.mjs` is a pure read side over a
// generated constant table and deliberately imports nothing back from here, so
// this module stays the base of the roll graph.
import { oddsTooltipHtml } from './dice-odds.mjs';

/**
 * Advantage/disadvantage levels for the Tno 3d20 roll mechanic.
 * @type {Object<string, number>}
 */
export const TNO_ADVANTAGE = {
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
export const TNO_ADVANTAGE_ABBR = {
  [TNO_ADVANTAGE.strongDisadvantage]: 'DIS-',
  [TNO_ADVANTAGE.disadvantage]: 'DIS',
  [TNO_ADVANTAGE.none]: 'STD',
  [TNO_ADVANTAGE.advantage]: 'ADV',
  [TNO_ADVANTAGE.strongAdvantage]: 'ADV+',
};

/**
 * Language-neutral symbols for each advantage level, shown as the prominent
 * glyph on the roll dialog's picker buttons above the label, so the roll type
 * reads at a glance.
 * @type {Object<number, string>}
 */
export const TNO_ADVANTAGE_GLYPH = {
  [TNO_ADVANTAGE.strongDisadvantage]: '−−',
  [TNO_ADVANTAGE.disadvantage]: '−',
  [TNO_ADVANTAGE.none]: '●',
  [TNO_ADVANTAGE.advantage]: '+',
  [TNO_ADVANTAGE.strongAdvantage]: '++',
};

/**
 * A short, localized description of what an advantage level actually rolls
 * (die count and which die counts), for the roll dialog's live "roll type"
 * consequence line. Mirrors the rules encoded in {@link dieCountFor} and
 * {@link pickCountingDie}.
 * @param {number} advantage  One of the TNO_ADVANTAGE values.
 * @returns {string}
 */
export function describeAdvantage(advantage) {
  const key = Object.keys(TNO_ADVANTAGE).find((k) => TNO_ADVANTAGE[k] === advantage) ?? 'none';
  const cap = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  return game.i18n.localize(`TNO.Roll.AdvantageEffect.${cap}`);
}

/**
 * How many d20 are rolled for a given advantage level. Simple advantage/
 * disadvantage only ever look at 2 dice; everything else rolls the full 3d20.
 * @param {number} advantage  One of the TNO_ADVANTAGE values.
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
 * @param {number} advantage    One of the TNO_ADVANTAGE values.
 * @returns {{value: number, index: number}}  The counting die's value and
 *   its index into `values`.
 */
export function pickCountingDie(values, advantage) {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);

  switch (advantage) {
    case TNO_ADVANTAGE.strongDisadvantage:
      return order[order.length - 1];
    case TNO_ADVANTAGE.disadvantage:
      return order[order.length - 1];
    case TNO_ADVANTAGE.advantage:
      return order[0];
    case TNO_ADVANTAGE.strongAdvantage:
      return order[0];
    case TNO_ADVANTAGE.none:
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
 * @param {number} advantage   One of the TNO_ADVANTAGE values.
 * @returns {'criticalSuccess'|'criticalFailure'|null}
 */
export function criticalResultFor(values, advantage) {
  const ones = values.filter((v) => v === 1).length;
  const twenties = values.filter((v) => v === 20).length;

  switch (advantage) {
    case TNO_ADVANTAGE.advantage:
      if (ones >= 1) return 'criticalSuccess';
      if (twenties >= 2) return 'criticalFailure';
      return null;
    case TNO_ADVANTAGE.disadvantage:
      if (twenties >= 1) return 'criticalFailure';
      if (ones >= 2) return 'criticalSuccess';
      return null;
    case TNO_ADVANTAGE.strongAdvantage:
      if (ones >= 1) return 'criticalSuccess';
      if (twenties === 3) return 'criticalFailure';
      return null;
    case TNO_ADVANTAGE.strongDisadvantage:
      if (twenties >= 1) return 'criticalFailure';
      if (ones === 3) return 'criticalSuccess';
      return null;
    case TNO_ADVANTAGE.none:
    default:
      if (ones >= 2) return 'criticalSuccess';
      if (twenties >= 2) return 'criticalFailure';
      return null;
  }
}

/**
 * Roll the Tno dice mechanic against a threshold and post the result to
 * chat.
 *
 * @param {object} options
 * @param {number} [options.threshold]         The threshold to roll against. Omit for a "base"
 *   roll with no success/failure evaluation (just the dice and, if it lands, a critical) —
 *   see rollTnoBase.
 * @param {number} [options.advantage]         One of the TNO_ADVANTAGE values.
 * @param {string} [options.flavor]            Label shown above the roll (e.g. the ability name).
 * @param {Actor} [options.actor]              The rolling actor, used for the chat speaker.
 * @param {string} [options.rollMode]          Chat roll mode; defaults to the current core setting.
 * @param {{label: string, value: number}[]} [options.components]  Threshold components
 *   (e.g. attribute and skill) shown in the expanded roll breakdown.
 * @param {number} [options.bonus]             Situational modifier shown in the breakdown.
 * @param {object} [options.extraFlags]        Extra properties merged into the message's
 *   `flags.tno`, e.g. `{ edgeExempt: true }` for a roll that must not offer the edge panel.
 * @returns {Promise<{roll: Roll, success: boolean|null, message: ChatMessage}>}
 */
export async function rollTno({
  threshold = null,
  advantage = TNO_ADVANTAGE.none,
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

  const advantageKey = Object.keys(TNO_ADVANTAGE).find((key) => TNO_ADVANTAGE[key] === advantage);

  const content = await foundry.applications.handlebars.renderTemplate('systems/tno/templates/chat/roll-card.hbs', {
    flavor,
    hasThreshold,
    threshold,
    // Only meaningful against a threshold; a base roll has nothing to be
    // likely or unlikely against.
    oddsTooltip: hasThreshold ? oddsTooltipHtml(threshold, advantage) : '',
    dice,
    countingValue: counting.value,
    success,
    outcome,
    outcomeLabel: outcome ? game.i18n.localize(`TNO.RollOutcome.${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}`) : '',
    advantageLabel: game.i18n.localize(`TNO.Advantage.${advantageKey.charAt(0).toUpperCase()}${advantageKey.slice(1)}`),
    advantageAbbr: TNO_ADVANTAGE_ABBR[advantage],
    components,
    showBonus: bonus !== 0,
    bonusDisplay: bonus > 0 ? `+${bonus}` : `${bonus}`,
  });

  // Failed rolls carry enough context in flags.tno (threshold, advantage) for
  // the post-edge actions (see chat.mjs) to be offered and, once activated, to
  // replay this roll's parameters exactly: "Trial & error" and "Retry" both
  // reroll in place on this same message via rollInPlace, storing their result
  // back into these flags. The persisted card content is never touched.
  //
  // The `edge` sub-keys keep their original on-disk names (findFlaw,
  // newAttempt, analyzeFlaw, consumed: 'findFlaw'|'newAttempt') even though
  // the mechanics were renamed (Trial & error / Retry / Post-mortem), so
  // chat cards persisted before the rename keep rendering without migration.
  const message = await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
    flavor,
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    rollMode: rollMode ?? game.settings.get('core', 'rollMode'),
    flags: {
      tno: {
        actorId: actor?.id ?? null,
        threshold,
        advantage,
        flavor,
        components,
        bonus,
        outcome,
        edge: { consumed: null, findFlaw: null, newAttempt: null, xpClaim: null, analyzeFlaw: null },
        ...extraFlags,
      },
    },
  });

  return { roll, success, message };
}

/**
 * Roll the bare Tno dice mechanic ("Basiswürfel"): advantage/disadvantage
 * picks the die count as usual, but there's no threshold to check against —
 * only a landed critical (2+/all dice on 1 or 20, per advantage level) shows
 * as an outcome. Meant for rolls made outside any actor/skill context (e.g.
 * a GM calling for a plain 3d20), so it takes no actor by default.
 *
 * @param {object} [options]
 * @param {number} [options.advantage]  One of the TNO_ADVANTAGE values.
 * @param {string} [options.flavor]     Label shown above the roll.
 * @param {Actor} [options.actor]       Optional rolling actor, used for the chat speaker.
 * @returns {Promise<{roll: Roll, success: boolean|null, message: ChatMessage}>}
 */
export async function rollTnoBase({ advantage = TNO_ADVANTAGE.none, flavor = '', actor = null } = {}) {
  return rollTno({
    threshold: null,
    advantage,
    flavor: flavor || game.i18n.localize('TNO.Roll.BaseDiceFlavor'),
    actor,
    // Not a skill+attribute check — a landed critical failure here must not
    // offer the "Problem lösen" edge pool (see problem-solving-prd.md).
    extraFlags: { edgeExempt: true },
  });
}

/**
 * Start the "Trial & error" reroll tracker on a failed roll's chat message:
 * free of edge cost, it attaches an empty tracker to the message's
 * flags, which the renderChatMessageHTML hook (see chat.mjs) then renders
 * as a pip tracker with a reroll button in place of the trigger button. No
 * reroll happens automatically — the first attempt is triggered the same
 * manual way as every later one, so it gets the same "Insight" choice
 * before it rolls.
 *
 * Trial & error is the "no time pressure" branch of the guided panel. That
 * implicit claim is surfaced as an on-card summary line (see chat.mjs),
 * derived from `edge.consumed==='findFlaw'`, so the GM can veto at the table
 * without either a permission gate or a chat announcement (see
 * problem-solving-prd.md, Open Question 3).
 *
 * @param {ChatMessage} message  The failed roll's chat message.
 * @param {Actor} actor          The rolling actor.
 * @returns {Promise<void>}
 */
export async function startTrialError(message, actor) {
  const value = actor.system.derived?.trialErrorMax ?? 0;

  await message.update({
    'flags.tno.edge.consumed': 'findFlaw',
    'flags.tno.edge.findFlaw': { max: value, used: 0, active: value > 0, attempts: [] },
  });
}

/**
 * Roll d20s in place for an on-card edge action — no new chat message.
 * Rolls the die count for `advantage`, plays the Dice So Nice animation for
 * the current user (falling back to the plain dice sound when the module is
 * absent), evaluates success against `threshold`, and returns both the raw
 * values and a display-ready dice list (sorted, counted die flagged) matching
 * roll-card.hbs / the Trial-&-error tracker.
 *
 * The original roll's animation/sound comes for free from ChatMessage.create
 * seeing `rolls: [roll]` (Dice So Nice hooks createChatMessage). These
 * on-card actions never create a message — they only patch `flags.tno` on the
 * existing card — so they have to trigger the animation themselves.
 *
 * @param {number} advantage   One of the TNO_ADVANTAGE values.
 * @param {number} threshold   Success threshold (counting die must be <=).
 * @returns {Promise<{values: number[], counting: {value: number, index: number}, success: boolean, outcome: string, dice: {value: number, isCounted: boolean}[], countingValue: number}>}
 */
async function rollInPlace(advantage, threshold) {
  const dieCount = dieCountFor(advantage);
  const roll = new Roll(`${dieCount}d20`);
  await roll.evaluate();

  if (game.dice3d) {
    await game.dice3d.showForRoll(roll, game.user, true);
  } else {
    foundry.audio.AudioHelper.play({ src: CONFIG.sounds.dice, volume: 0.8, autoplay: true, loop: false }, true);
  }

  const values = roll.terms[0].results.map((r) => r.result);
  const counting = pickCountingDie(values, advantage);
  const critical = criticalResultFor(values, advantage);
  const success = critical ? critical === 'criticalSuccess' : counting.value <= threshold;
  const outcome = critical ?? (success ? 'success' : 'failure');
  const dice = values
    .map((value, index) => ({ value, isCounted: index === counting.index }))
    .sort((a, b) => a.value - b.value);

  return { values, counting, success, outcome, dice, countingValue: counting.value };
}

/**
 * Reroll a check under the "Trial & error" tracker: rolls the same die
 * count against the same threshold/advantage as the original check,
 * appends the attempt to the tracker, and stops the tracker at the first
 * success or once the max reroll count is used up.
 *
 * @param {ChatMessage} message  The chat message carrying the active tracker.
 * @param {boolean} [useIdea]  Whether to spend an independent "Insight"
 *   point on this specific reroll — never inherited from the original roll
 *   or from any prior reroll in the chain, each one is its own choice.
 * @returns {Promise<void>}
 */
export async function rerollTrialError(message, useIdea = false) {
  const data = message.flags?.tno;
  const tracker = data?.edge?.findFlaw;
  if (!tracker?.active) return;

  const actor = data.actorId ? game.actors.get(data.actorId) : null;
  let ideaBonus = 0;
  if (useIdea && actor && (actor.system.derived?.edgePool ?? 0) > 0) {
    ideaBonus = actor.system.derived?.insight ?? 0;
    const spent = actor.system.problemSolving?.spent ?? 0;
    await actor.update({ 'system.problemSolving.spent': spent + 1 });
  }

  const { values, counting, success, outcome } = await rollInPlace(data.advantage, data.threshold + ideaBonus);

  const used = tracker.used + 1;
  const active = !success && used < tracker.max;

  await message.update({
    'flags.tno.edge.findFlaw.used': used,
    'flags.tno.edge.findFlaw.active': active,
    'flags.tno.edge.findFlaw.attempts': [
      ...tracker.attempts,
      { dice: values, countingIndex: counting.index, success, outcome, ideaBonus },
    ],
  });
}

/**
 * Trigger "Retry" on a failed roll's chat message: spends one
 * edge point, forfeits the XP the original check would have earned, and
 * rerolls the check itself, once, under identical parameters. Unlike
 * "Trial & error" there's no player choice left once triggered — the second
 * result replaces the first outright. The reroll happens in place (no new
 * chat message): its result is stored on `flags.tno.edge.newAttempt.result`
 * and rendered inline on this same card as "the result that counts" (see
 * chat.mjs), so nothing about this action clutters the chat log.
 *
 * @param {ChatMessage} message  The failed roll's chat message.
 * @param {Actor} actor          The rolling actor, spending the edge point.
 * @returns {Promise<void>}
 */
export async function retry(message, actor, useIdea = false) {
  const data = message.flags?.tno;
  if (!data) return;

  // Insight on a Retry is optional and costs its own extra edge point on top
  // of the base one, so it's only offered when the pool can cover both.
  let ideaBonus = 0;
  let spend = 1;
  if (useIdea && (actor.system.derived?.edgePool ?? 0) >= 2) {
    ideaBonus = actor.system.derived?.insight ?? 0;
    spend = 2;
  }

  const spent = actor.system.problemSolving?.spent ?? 0;
  await actor.update({ 'system.problemSolving.spent': spent + spend });

  const { dice, countingValue, outcome, success } = await rollInPlace(data.advantage, data.threshold + ideaBonus);

  await message.update({
    'flags.tno.edge.consumed': 'newAttempt',
    'flags.tno.edge.newAttempt': { result: { dice, countingValue, outcome, success, ideaBonus } },
  });
}

/**
 * Trigger "Post-mortem" on a failed roll's chat message: a standard
 * 3d20 roll against `postMortem` (no advantage/disadvantage), which on
 * success refunds one edge point. Bound to the specific failed check it's
 * run from (unlike the old sheet-based version), since using it — win or
 * lose the analysis roll itself — forfeits that check's XP claim. The forfeit
 * is written before the roll so it applies regardless of the outcome.
 *
 * @param {ChatMessage} message  The failed roll's chat message.
 * @param {Actor} actor          The rolling actor.
 * @returns {Promise<void>}
 */
export async function postMortem(message, actor) {
  // Any reroll on this roll (Trial & error or Retry, both set `consumed`)
  // forfeits the Post-mortem — enforce it here too, not just by hiding the row.
  if (message.flags?.tno?.edge?.consumed) return;

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize('TNO.Edge.PostMortemTitle') },
    content: game.i18n.localize('TNO.Edge.PostMortemContent'),
  });
  if (!confirmed) return;

  // Rolled in place (no separate chat card): the 3d20 result is stored on
  // flags and rendered inline on this card. Using Post-mortem forfeits the
  // XP claim regardless of the analysis roll's outcome — `used: true` is
  // written with the result in one update, which is enough to lock the claim
  // (see xpClaimEligible in chat.mjs).
  const threshold = actor.system.derived?.postMortem ?? 0;
  const { dice, countingValue, outcome, success } = await rollInPlace(TNO_ADVANTAGE.none, threshold);

  await message.update({
    'flags.tno.edge.analyzeFlaw': {
      used: true,
      success,
      result: { dice, countingValue, outcome, success, threshold },
    },
  });

  if (!success) return;
  const spent = actor.system.problemSolving?.spent ?? 0;
  if (spent <= 0) return;
  await actor.update({ 'system.problemSolving.spent': spent - 1 });
}

/**
 * Claim the once-per-failure-chain XP reward on a failed roll's chat
 * message: banks 1 XP on either the skill or the attribute actually used in
 * that roll (the player's choice), and locks out any further claim on this
 * same chain.
 *
 * @param {ChatMessage} message       The failed roll's chat message.
 * @param {Actor} actor                The rolling actor.
 * @param {'skill'|'attribute'} target Which side of the roll to credit.
 * @returns {Promise<void>}
 */
export async function claimXp(message, actor, target) {
  const data = message.flags?.tno;
  if (!data || data.edge?.xpClaim?.claimed) return;

  const path = target === 'skill' ? `system.skills.${data.skillKey}.xp` : `system.abilities.${data.attributeKey}.xp`;
  const current =
    target === 'skill' ? actor.system.skills?.[data.skillKey]?.xp ?? 0 : actor.system.abilities?.[data.attributeKey]?.xp ?? 0;

  await actor.update({ [path]: current + 1 });
  await message.update({ 'flags.tno.edge.xpClaim': { claimed: true, target } });
  // No chat announcement — the on-card "Lesson learned" stamp conveys it.
}
