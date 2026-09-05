import { describe, expect, it } from 'vitest';
import {
  CATALOGUE_PACK,
  auditTally,
  compendiumPackOf,
  itemOrigin,
} from '../../module/helpers/item-audit.mjs';

/** Just the `_stats` the audit reads; everything else is the item table's job. */
const stats = (source) => (source === null ? {} : { compendiumSource: source });

const CATALOGUE = 'Compendium.tno.gear.Item.9FK77c45DmJgTtUV';

describe('compendiumPackOf', () => {
  it('reads the pack out of a compendium UUID and nothing else', () => {
    expect(compendiumPackOf(CATALOGUE)).toBe('tno.gear');
    expect(compendiumPackOf('Compendium.some-module.loot.Item.abc')).toBe('some-module.loot');
    // A world document's UUID names no pack, and neither does a missing one.
    expect(compendiumPackOf('Item.abc')).toBeNull();
    expect(compendiumPackOf('Actor.a1.Item.b2')).toBeNull();
    expect(compendiumPackOf(null)).toBeNull();
    expect(compendiumPackOf(undefined)).toBeNull();
    // Truncated enough that there is no document half: not a source we can name.
    expect(compendiumPackOf('Compendium.tno.gear')).toBeNull();
  });
});

describe('itemOrigin', () => {
  it('separates the shipped catalogue from other packs and from local work', () => {
    expect(itemOrigin({ compendiumSource: CATALOGUE })).toMatchObject({
      kind: 'catalogue',
      pack: CATALOGUE_PACK,
    });
    expect(itemOrigin({ compendiumSource: 'Compendium.some-module.loot.Item.abc' })).toMatchObject({
      kind: 'foreign',
      pack: 'some-module.loot',
    });
    // No source at all is the case the window exists for: typed in by hand, or
    // duplicated from something that was.
    expect(itemOrigin({})).toMatchObject({ kind: 'homebrew', pack: null });
    expect(itemOrigin(undefined)).toMatchObject({ kind: 'homebrew', pack: null });
  });

  // The pack is parsed, not looked up, so an item outlives the module it came
  // from: saying "other pack: some-module.loot" beats calling it homebrew.
  it('still names the pack of an item whose module is no longer installed', () => {
    expect(itemOrigin({ compendiumSource: 'Compendium.long-gone.stuff.Item.x' })).toMatchObject({
      kind: 'foreign',
      pack: 'long-gone.stuff',
    });
  });
});

describe('auditTally', () => {
  it('counts each origin and the whole', () => {
    expect(auditTally([
      stats(CATALOGUE),
      stats(CATALOGUE),
      stats(null),
      stats('Compendium.m.p.Item.x'),
    ])).toEqual({ total: 4, homebrew: 1, foreign: 1, catalogue: 2 });
  });

  it('counts nothing without throwing', () => {
    expect(auditTally([])).toEqual({ total: 0, homebrew: 0, foreign: 0, catalogue: 0 });
    expect(auditTally(undefined)).toEqual({ total: 0, homebrew: 0, foreign: 0, catalogue: 0 });
  });
});
