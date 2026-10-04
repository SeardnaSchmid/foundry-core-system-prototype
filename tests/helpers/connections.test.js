import { describe, it, expect } from 'vitest';
import {
  addConnection,
  connectionSearchText,
  editConnection,
  hasConnectionTo,
  normalizeConnections,
  addLabel,
  labelSuggestions,
  normalizeLabels,
  removeConnection,
  removeLabel,
  personSuggestions,
  adoptPerson,
} from '../../module/helpers/connections.mjs';

const stored = [
  { id: 'a', name: 'Mara', relation: 'Kontakt', faction: 'Kartell', origin: 'Triton', notes: '' },
  { id: 'b', name: 'Oskar', actorUuid: 'Actor.x' },
];

describe('normalizeConnections', () => {
  it('fills every field of a partial entry', () => {
    expect(normalizeConnections(stored)[1]).toEqual({
      id: 'b', name: 'Oskar', notes: '', relations: [], knows: [], factions: [], origins: [], neuralink: false, actorUuid: 'Actor.x',
    });
  });

  it('reads an object-shaped list and drops junk', () => {
    const list = normalizeConnections({ 0: { id: 'a', name: 'X' }, 1: 'nope', 2: null });
    expect(list.map((e) => e.id)).toEqual(['a']);
  });

  it('gives an entry without id a positional one', () => {
    expect(normalizeConnections([{ name: 'X' }])[0].id).toBe('legacy-0');
  });

  it('treats anything else as empty', () => {
    expect(normalizeConnections(undefined)).toEqual([]);
  });
});

describe('editing', () => {
  it('appends with the given id and initial values', () => {
    const list = addConnection(stored, 'c', { name: 'Neu', actorUuid: 'Actor.y' });
    expect(list).toHaveLength(3);
    expect(list[2]).toMatchObject({ id: 'c', name: 'Neu', actorUuid: 'Actor.y', notes: '' });
  });

  it('sets one field of one entry without touching the input', () => {
    const list = editConnection(stored, 'a', 'notes', 'Schuldet mir was');
    expect(list[0].notes).toBe('Schuldet mir was');
    expect(stored[0].notes).toBe('');
  });

  it('stores the Neuralink box as a strict boolean', () => {
    expect(editConnection(stored, 'a', 'neuralink', true)[0].neuralink).toBe(true);
    expect(editConnection(stored, 'a', 'neuralink', 'on')[0].neuralink).toBe(false);
  });

  it('ignores an unknown field', () => {
    expect(editConnection(stored, 'a', 'actorUuid', 'Actor.z')[0].actorUuid).toBeNull();
  });

  it('removes by id', () => {
    expect(removeConnection(stored, 'a').map((e) => e.id)).toEqual(['b']);
  });
});

describe('lookups', () => {
  it('finds an entry made from the same actor', () => {
    expect(hasConnectionTo(stored, 'Actor.x')).toBe(true);
    expect(hasConnectionTo(stored, 'Actor.q')).toBe(false);
    expect(hasConnectionTo(stored, null)).toBe(false);
  });

  it('joins the text columns for search', () => {
    expect(connectionSearchText(normalizeConnections(stored)[0])).toBe('Mara Kontakt Kartell Triton');
  });

  it('makes a ticked Neuralink box searchable', () => {
    expect(connectionSearchText({ name: 'Mara', relations: [], factions: [], origins: [], neuralink: true })).toBe('Mara Neuralink');
  });
});

describe('personSuggestions', () => {
  const shared = [
    [{ id: 'a', name: 'Marla Voss', factions: ['T.H.V.'], origins: ['Hel'] }, { id: 'b', name: 'Bruder Ivo' }],
    [{ id: 'c', name: 'marla voss', factions: ['Kartell'] }],
  ];
  const actors = [{ name: 'Joh', uuid: 'Actor.joh' }, { name: 'Marla Voss', uuid: 'Actor.marla' }];

  it('merges one person from every source, labels and link together', () => {
    expect(personSuggestions([], 'marla', 'x', { shared, actors })).toEqual([
      { name: 'Marla Voss', factions: ['T.H.V.', 'Kartell'], origins: ['Hel'], actorUuid: 'Actor.marla', connectionId: null },
    ]);
  });

  it('offers the table\'s own rows first, with their row, never the row itself', () => {
    const own = [{ id: '1', name: 'Joh' }, { id: '2', name: 'Ivona' }];
    expect(personSuggestions(own, 'o', '9', { shared, actors }).map((p) => [p.name, p.connectionId])).toEqual([
      ['Joh', '1'], ['Ivona', '2'], ['Marla Voss', null], ['Bruder Ivo', null],
    ]);
    expect(personSuggestions(own, 'jo', '1', { shared, actors })[0].connectionId).toBeNull();
  });

  it('offers nothing before anything is typed', () => {
    expect(personSuggestions([], ' ', 'x', { shared, actors })).toEqual([]);
  });
});

describe('adoptPerson', () => {
  it('takes the name, adds the labels and links the Actor once', () => {
    const own = [{ id: '1', name: 'Mar', factions: ['Kartell'], actorUuid: null }];
    const [entry] = adoptPerson(own, '1', { name: 'Marla Voss', factions: ['kartell', 'T.H.V.'], origins: ['Hel'], actorUuid: 'Actor.m' });
    expect(entry).toMatchObject({ name: 'Marla Voss', factions: ['Kartell', 'T.H.V.'], origins: ['Hel'], actorUuid: 'Actor.m' });
    const [kept] = adoptPerson([{ id: '1', actorUuid: 'Actor.x' }], '1', { name: 'Y', actorUuid: 'Actor.m' });
    expect(kept.actorUuid).toBe('Actor.x');
  });
});

describe('label columns', () => {
  it('splits an old free-text column at commas', () => {
    const [entry] = normalizeConnections([{ id: 'a', relation: 'Kontakt, Rivale,', faction: 'Kartell', origin: '' }]);
    expect(entry.relations).toEqual(['Kontakt', 'Rivale']);
    expect(entry.factions).toEqual(['Kartell']);
    expect(entry.origins).toEqual([]);
  });

  it('prefers the label list over the old field', () => {
    expect(normalizeConnections([{ id: 'a', relation: 'Alt', relations: ['Neu'] }])[0].relations).toEqual(['Neu']);
  });

  it('drops blanks and repeats, keeping the first spelling', () => {
    expect(normalizeLabels(['Kontakt', ' kontakt ', '', 'Rivale'])).toEqual(['Kontakt', 'Rivale']);
  });

  it('adds a label once and removes by position', () => {
    let list = addLabel(stored, 'a', 'relations', 'Rivale');
    list = addLabel(list, 'a', 'relations', 'rivale');
    expect(list[0].relations).toEqual(['Kontakt', 'Rivale']);
    expect(removeLabel(list, 'a', 'relations', 0)[0].relations).toEqual(['Rivale']);
    expect(addLabel(stored, 'a', 'relations', '   ')[0].relations).toEqual(['Kontakt']);
    expect(addLabel(stored, 'a', 'factions', 'Polizei')[0].factions).toEqual(['Kartell', 'Polizei']);
    expect(addLabel(stored, 'a', 'notes', 'x')[0].notes).toBe('');
  });

  const rows = [
    { id: '1', relations: ['Kontakt', 'Freund'] },
    { id: '2', relations: ['Kontakt'] },
    { id: '3', relations: ['Rivale', 'Ex-Kollege'] },
  ];

  it('offers every label in use, most used first, without the row\'s own', () => {
    expect(labelSuggestions(rows, 'relations', '', '3')).toEqual(['Kontakt', 'Freund']);
  });

  it('narrows by the typed text, prefix matches first', () => {
    expect(labelSuggestions(rows, 'relations', 'e', 'x')).toEqual(['Ex-Kollege', 'Freund', 'Rivale']);
    expect(labelSuggestions(rows, 'relations', 'kon', 'x')).toEqual(['Kontakt']);
  });

  it('adds the other characters\' labels after the table\'s own', () => {
    const shared = [[{ id: 'a', factions: ['T.H.V.', 'Tempel', 'tempel'] }], [{ id: 'b', factions: ['T.H.V.'] }]];
    const own = [{ id: '1', factions: ['Tempel'] }, { id: '2', factions: [] }];
    expect(labelSuggestions(own, 'factions', 't', '2', { shared })).toEqual(['Tempel', 'T.H.V.']);
    expect(labelSuggestions(own, 'factions', '', '1', { shared })).toEqual(['T.H.V.']);
  });

  it('offers people by name in the knows column, own rows first', () => {
    const own = [{ id: '1', name: 'Marla' }, { id: '2', name: 'Ivo', knows: ['Selm'] }, { id: '3', name: 'tim' }];
    const shared = [[{ id: 'a', name: 'Mara' }]];
    expect(labelSuggestions(own, 'knows', 'ma', '3', { shared, people: ['Marek'] })).toEqual(['Marla', 'Mara', 'Marek']);
    expect(labelSuggestions(own, 'knows', '', '2')).toEqual(['Marla', 'tim']);
  });

  it('keeps each column to its own labels', () => {
    expect(labelSuggestions([{ id: '1', relations: ['Kontakt'], factions: ['Kartell'] }], 'factions', '', 'x')).toEqual(['Kartell']);
    expect(labelSuggestions(rows, 'name', '', 'x')).toEqual([]);
  });
});
