import { describe, expect, it } from 'vitest';

// The two decisions behind copying a posted item onto a sheet — what travels
// with the copy, and who may receive it — are both pure. Neither needs a chat
// log, a dialog or a world; the rest of item-transfer.mjs is the Foundry side
// that hangs off them.
const { postedItemFlag, receivingActors, travellingItemData } = await import(
  '../../module/helpers/item-transfer.mjs'
);

/** A stored item, as `toObject()` hands it over. */
const stored = (overrides = {}) => ({
  _id: 'abc123',
  _stats: { systemVersion: '0.38.0' },
  name: 'Bolzen',
  type: 'item',
  img: 'icons/bolt.webp',
  folder: 'folder1',
  sort: 300000,
  ownership: { default: 0, someUserId: 3 },
  system: { quantity: 20, slots: 1, roles: { weapon: false, armor: false, consumable: true } },
  effects: [],
  flags: {},
  ...overrides,
});

describe('what travels with a copied item', () => {
  it('drops the fields that describe the original rather than the thing', () => {
    const data = travellingItemData(stored());
    expect(data).not.toHaveProperty('_id');
    expect(data).not.toHaveProperty('_stats');
    expect(data).not.toHaveProperty('folder');
    expect(data).not.toHaveProperty('sort');
    expect(data).not.toHaveProperty('ownership');
  });

  it('keeps everything the item itself is', () => {
    const data = travellingItemData(stored());
    expect(data.name).toBe('Bolzen');
    expect(data.type).toBe('item');
    expect(data.img).toBe('icons/bolt.webp');
    expect(data.system.roles.consumable).toBe(true);
    expect(data.effects).toEqual([]);
  });

  // The stack is an authored property of the posted thing, not a separate
  // statement about how many are being offered.
  it('carries the whole stack', () => {
    expect(travellingItemData(stored()).system.quantity).toBe(20);
  });

  it('leaves the source object alone', () => {
    const source = stored();
    travellingItemData(source);
    expect(source._id).toBe('abc123');
  });
});

describe('which posted items can be taken', () => {
  it('offers gear', () => {
    for (const type of ['item', 'weapon', 'armor']) {
      expect(postedItemFlag({ type, toObject: () => stored({ type }) })).not.toBeNull();
    }
  });

  // A feature or a spell is not an object: it costs no slots and is created
  // from its own list, so its card stays the plain description it always was.
  it('does not offer features or spells', () => {
    for (const type of ['feature', 'spell']) {
      expect(postedItemFlag({ type, toObject: () => stored({ type }) })).toBeNull();
    }
  });
});

describe('who may receive a copy', () => {
  const actor = (id, name, isOwner = true) => ({ id, name, isOwner });

  it('offers only actors the reader owns', () => {
    const actors = [actor('a', 'Rosa'), actor('b', 'Fremder', false)];
    expect(receivingActors(actors).map((a) => a.id)).toEqual(['a']);
  });

  it('puts the reader own character first, then the rest by name', () => {
    const actors = [actor('a', 'Zenta'), actor('b', 'Adam'), actor('c', 'Rosa')];
    expect(receivingActors(actors, 'a').map((a) => a.name)).toEqual(['Zenta', 'Adam', 'Rosa']);
  });

  it('sorts by name alone when the reader has no assigned character', () => {
    const actors = [actor('a', 'Zenta'), actor('b', 'Adam'), actor('c', 'Rosa')];
    expect(receivingActors(actors, null).map((a) => a.name)).toEqual(['Adam', 'Rosa', 'Zenta']);
  });

  // An NPC holds gear the same way a character does — a GM stocking a merchant
  // is the second reason the feature exists.
  it('does not care whether the actor is a character or an NPC', () => {
    const actors = [{ id: 'n', name: 'Händler', type: 'npc', isOwner: true }];
    expect(receivingActors(actors)).toHaveLength(1);
  });

  it('offers nothing to a reader who owns no actor', () => {
    expect(receivingActors([actor('a', 'Rosa', false)])).toEqual([]);
  });
});
