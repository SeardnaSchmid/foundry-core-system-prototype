import { TNO_ODDS } from './dice-odds-table.mjs';

/**
 * The success chance of the Tno dice mechanic is a constant per (threshold,
 * advantage) pair, so it is enumerated once at build time by
 * `scripts/dice-odds.mjs` and shipped as `dice-odds-table.mjs`. This module is
 * the read side: a table lookup plus the tooltip markup the roll dialog and
 * chat card hang off their threshold display.
 *
 * Deliberately imports no `dice.mjs`: that module is the leaf of the helper
 * graph and calls into *this* one to put the odds on a roll card, so anything
 * needed from it (the state's name, its die count) is carried by the generated
 * table instead of imported back.
 */

/** The standard roll, used when handed an advantage level that has no entry. */
const DEFAULT_ADVANTAGE = 0;

/** Thresholds are only meaningful across a d20's face values. */
const MIN_THRESHOLD = 0;
const MAX_THRESHOLD = 20;

/**
 * Look up the odds for a threshold under an advantage state.
 *
 * Thresholds outside 0–20 clamp rather than being rejected: a character can
 * easily reach a threshold of 24, and the honest answer there is the same as
 * at 20 — a 20 on the counting die never passes, so the extra points buy
 * nothing. Same at the bottom, where a 1 is already a critical.
 *
 * @param {number} threshold   The value the counting die must land at or under.
 * @param {number} advantage   One of the TNO_ADVANTAGE values.
 * @returns {{success: number, crit: number, fumble: number, capped: boolean, key: string}}
 *   Probabilities in 0–1. `capped` marks a threshold outside the band where it
 *   still changes the outcome; `key` is the advantage state's name.
 */
export function successChanceFor(threshold, advantage) {
  const odds = TNO_ODDS[advantage] ?? TNO_ODDS[DEFAULT_ADVANTAGE];
  const value = Number(threshold) || 0;
  const index = Math.min(Math.max(Math.trunc(value), MIN_THRESHOLD), MAX_THRESHOLD);
  return {
    key: odds.key,
    success: odds.success[index],
    crit: odds.crit,
    fumble: odds.fumble,
    // 0 and 1 are the same cell, as are 19 and 20 — see the doc's notes.
    capped: value <= 1 || value >= MAX_THRESHOLD - 1,
  };
}

/**
 * Format a probability for display. Rounds to one decimal, but never rounds a
 * real chance down to a flat "0.0%" — the rarest outcome in the system (a
 * fumble under strong advantage, 1 in 8,000) has to read as unlikely-but-
 * possible, not impossible.
 * @param {number} p  Probability in 0–1.
 * @returns {string}
 */
export function formatChance(p) {
  const percent = p * 100;
  if (percent > 0 && percent < 0.1) return '<0.1%';
  return `${Number(percent.toFixed(1))}%`;
}

/**
 * Escape a value for interpolation into the tooltip's markup. Not paranoia
 * about the inputs — they are our own localized strings — but `formatChance`
 * can legitimately return "<0.1%", and an unescaped `<` in an HTML string is
 * a parse error waiting to happen.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build the `data-tooltip-html` content for a threshold's odds readout: the
 * overall success chance, the two critical rates, and what they were computed
 * against. Uses the same `<dl class="tno-tooltip">` row scheme as the sheet's
 * other rich tooltips (see `_tooltip.scss`).
 *
 * @param {number} threshold   The value the counting die must land at or under.
 * @param {number} advantage   One of the TNO_ADVANTAGE values.
 * @returns {string}  HTML, for `data-tooltip-html`.
 */
export function oddsTooltipHtml(threshold, advantage) {
  const { success, crit, fumble, capped, key } = successChanceFor(threshold, advantage);
  const row = (label, value, hint) =>
    `<div class="tno-tooltip-row"><dt>${escapeHtml(label)} <span class="tno-tooltip-value">${escapeHtml(value)}</span></dt>${hint ? `<dd>${escapeHtml(hint)}</dd>` : ''}</div>`;

  const basis = game.i18n.format('TNO.Roll.Odds.Basis', {
    effect: game.i18n.localize(`TNO.Roll.AdvantageEffect.${key.charAt(0).toUpperCase()}${key.slice(1)}`),
    threshold,
  });

  const rows = [
    row(game.i18n.localize('TNO.Roll.Odds.Chance'), formatChance(success), `${basis} ${game.i18n.localize('TNO.Roll.Odds.CritsIncluded')}`),
    row(game.i18n.localize('TNO.RollOutcome.CriticalSuccess'), formatChance(crit)),
    row(game.i18n.localize('TNO.RollOutcome.CriticalFailure'), formatChance(fumble)),
  ];
  if (capped) rows.push(`<div class="tno-tooltip-row"><dd>${escapeHtml(game.i18n.localize('TNO.Roll.Odds.Capped'))}</dd></div>`);

  return `<dl class="tno-tooltip">${rows.join('')}</dl>`;
}
