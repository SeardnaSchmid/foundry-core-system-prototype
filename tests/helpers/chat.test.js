// What a failed roll's card still offers. The card itself is rendered per
// viewer in the chat hook; these are the two decisions underneath it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildEdgeGroups, xpClaimEligible } from '../../module/helpers/chat.mjs';

const priorGame = globalThis.game;
beforeAll(() => {
  globalThis.game = { i18n: { localize: (key) => key, format: (key) => key } };
});
afterAll(() => {
  globalThis.game = priorGame;
});

const fresh = { skillKey: 'athletics', edge: { consumed: null, xpClaim: null, analyzeFlaw: null } };
const actor = (edgePool, edgePoolMax = 3) => ({ system: { derived: { edgePool, edgePoolMax, trialErrorMax: 2 } } });
const actions = (groups) => groups.flatMap((group) => group.options.map((option) => [option.action, option.disabled]));

describe('xpClaimEligible', () => {
  it('is open on a clean failed skill check', () => {
    expect(xpClaimEligible(fresh)).toBe(true);
  });

  it('closes once claimed, once any edge action is taken, and never opens without a skill', () => {
    expect(xpClaimEligible({ ...fresh, edge: { xpClaim: { claimed: true } } })).toBe(false);
    expect(xpClaimEligible({ ...fresh, edge: { consumed: 'newAttempt' } })).toBe(false);
    expect(xpClaimEligible({ ...fresh, edge: { analyzeFlaw: { used: true } } })).toBe(false);
    expect(xpClaimEligible({ ...fresh, skillKey: null })).toBe(false);
  });
});

describe('buildEdgeGroups', () => {
  it('offers both rerolls and the post-mortem on a fresh failure', () => {
    expect(actions(buildEdgeGroups(fresh, actor(1)))).toEqual([
      ['trialError', false],
      ['retry', false],
      ['postMortem', false],
    ]);
  });

  it('disables Retry on an empty pool and the post-mortem on a full one', () => {
    expect(actions(buildEdgeGroups(fresh, actor(0)))).toContainEqual(['retry', true]);
    expect(actions(buildEdgeGroups(fresh, actor(3, 3)))).toContainEqual(['postMortem', true]);
  });

  it('offers nothing once a reroll has claimed the roll, and no second post-mortem', () => {
    expect(buildEdgeGroups({ ...fresh, edge: { consumed: 'findFlaw' } }, actor(1))).toEqual([]);
    expect(actions(buildEdgeGroups({ ...fresh, edge: { analyzeFlaw: { used: true } } }, actor(1)))).toEqual([
      ['trialError', false],
      ['retry', false],
    ]);
  });
});
