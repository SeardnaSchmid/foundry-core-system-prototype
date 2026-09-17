import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { GEAR_TYPES, itemRoles, missingRequired } from '../../module/helpers/items.mjs';

// The shipped gear compendium is authored as YAML and compiled to LevelDB by
// `npm run build:packs`, so nothing between the source and a GM's world reads
// it against the schema. This suite is that reader: it runs the sheet's own
// `missingRequired` over every entry, which is the same list the item card
// shows a player. A catalogue we ship should not arrive with warnings on it.
const SOURCE = 'src/packs/gear';

const files = readdirSync(SOURCE).filter((name) => name.endsWith('.yml'));
const documents = files.map((name) => ({ name, doc: load(readFileSync(join(SOURCE, name), 'utf8')) }));
const folders = documents.filter(({ doc }) => doc._key.startsWith('!folders!'));
const items = documents.filter(({ doc }) => doc._key.startsWith('!items!'));

describe('gear pack source', () => {
  it('has entries', () => {
    expect(items.length).toBeGreaterThan(0);
    expect(folders.length).toBeGreaterThan(0);
  });

  it('gives every document a unique id its key agrees with', () => {
    const ids = documents.map(({ doc }) => doc._id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { name, doc } of documents) {
      expect(doc._id, name).toMatch(/^[a-zA-Z0-9]{16}$/);
      expect(doc._key, name).toMatch(new RegExp(`!${doc._id}$`));
    }
  });

  it('files every item and nested folder in a folder the pack defines', () => {
    const known = new Set(folders.map(({ doc }) => doc._id));
    for (const { name, doc } of items) expect(known, name).toContain(doc.folder);
    for (const { name, doc } of folders.filter(({ doc }) => doc.folder)) {
      expect(known, name).toContain(doc.folder);
      expect(doc.folder, name).not.toBe(doc._id);
    }
  });

  it('creates every item as a registered gear type', () => {
    for (const { name, doc } of items) expect(GEAR_TYPES, name).toContain(doc.type);
  });

  it('gives every item at most one role', () => {
    for (const { name, doc } of items) {
      const roles = itemRoles(doc);
      expect(Object.values(roles).filter(Boolean).length, name).toBeLessThanOrEqual(1);
    }
  });

  // Every item points at an icon Foundry itself ships under `icons/`. Nothing
  // here can check the file exists — the core art is not in this repository,
  // by licence — but a duplicated path is almost always a copy-paste, and the
  // placeholder trio the pack was generated with would show up as three.
  it('gives every item its own core icon', () => {
    const images = items.map(({ doc }) => doc.img);
    for (const { name, doc } of items) expect(doc.img, name).toMatch(/^icons\/.+\.webp$/);
    expect(new Set(images).size).toBe(images.length);
  });

  // The Waffentabelle authors SS 0 twice on purpose: the Lasso does no damage
  // at all and unarmed does only Wucht. `missingRequired` reads a zero sharp
  // value as unauthored, so those two arrive with a warning the catalogue
  // cannot author its way out of. They are named here rather than excluded, so
  // that settling the question in the model shows up as a failing expectation.
  const SHARP_ZERO = new Set(['Unbewaffnet', 'Lasso']);

  it('leaves no required value blank', () => {
    for (const { name, doc } of items) {
      const expected = SHARP_ZERO.has(doc.name) ? ['ss'] : [];
      expect(missingRequired(doc), name).toEqual(expected);
    }
  });
});
