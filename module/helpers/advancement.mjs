/**
 * XP and rank arithmetic for attributes and skills — the one place the level
 * cost table is turned into numbers. The rules are on the wiki page
 * *Charakterentwicklung*; the sheet's XP bars, its spent/banked totals and the
 * advancement dialog all read them from here.
 *
 * Imports nothing and reads no Foundry globals.
 */

export const RANK_MAX = 10;

/** @typedef {'attribute'|'skill'} RankKind */

/**
 * XP to advance from `rank` to `rank + 1`.
 * @param {RankKind} kind
 * @param {number} rank
 * @returns {number}
 */
export function nextRankXpCost(kind, rank) {
  const next = rank + 1;
  return kind === 'attribute' ? next ** 2 : 3 * next;
}

/**
 * XP it took to reach `rank` from zero: every step up to it, summed.
 * @param {RankKind} kind
 * @param {number} rank
 * @returns {number}
 */
export function rankXpTotal(kind, rank) {
  return kind === 'attribute'
    ? (rank * (rank + 1) * (2 * rank + 1)) / 6
    : (3 * rank * (rank + 1)) / 2;
}

/**
 * How far the banked XP has come toward the next rank, as the XP bars draw it.
 * @param {RankKind} kind
 * @param {number} rank
 * @param {number} xp      XP banked toward the next rank
 * @returns {{xpCost: number, xpAtMax: boolean, xpReady: boolean, xpPercent: number}}
 */
export function xpProgress(kind, rank, xp) {
  const xpCost = nextRankXpCost(kind, rank);
  const xpAtMax = rank >= RANK_MAX;
  return {
    xpCost,
    xpAtMax,
    xpReady: !xpAtMax && xp >= xpCost,
    xpPercent: xpAtMax ? 100 : Math.min(100, Math.round((xp / xpCost) * 100)),
  };
}

/**
 * What a character has put into ranks (spent), what still sits banked toward
 * the next ones, and both together (acquired). Banked XP is earned but not yet
 * converted, so a rank-0 skill holding 2 XP counts 0 spent but 2 acquired — and
 * acquired only ever rises, since buying a rank moves XP from one side to the
 * other.
 * @param {{rank: number, xp: number}[]} attributes
 * @param {{rank: number, xp: number}[]} skills
 */
export function xpSummary(attributes, skills) {
  const sum = (list, fn) => list.reduce((total, entry) => total + fn(entry), 0);
  const attributeXpSpent = sum(attributes, ({ rank }) => rankXpTotal('attribute', rank));
  const skillXpSpent = sum(skills, ({ rank }) => rankXpTotal('skill', rank));
  const attributeXpBanked = sum(attributes, ({ xp }) => xp ?? 0);
  const skillXpBanked = sum(skills, ({ xp }) => xp ?? 0);
  const spent = attributeXpSpent + skillXpSpent;
  const unspent = attributeXpBanked + skillXpBanked;
  return {
    attributeXpSpent,
    skillXpSpent,
    attributeXpBanked,
    skillXpBanked,
    spent,
    unspent,
    acquired: spent + unspent,
  };
}
