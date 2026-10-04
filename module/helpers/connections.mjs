/**
 * The Beziehungen tab's data: the people a character has come to know in play.
 *
 * Stored as one array on the actor (`system.connections`), one entry per
 * person, each with a stable `id`. The table edits it as a whole — every
 * change writes the array back — so these helpers return new arrays and never
 * mutate. No Foundry globals here; the sheet supplies fresh ids.
 *
 * The shape is meant to outlive the table. A relationship graph is the same
 * data drawn differently: the character is the centre node, each entry a node
 * joined to it, its `relations` the edge's labels and its `factions` clusters.
 * `actorUuid` is set when the entry was made by dropping an Actor, and is what
 * lets two characters' graphs meet on the same person later.
 */

/** The free-text columns of an entry. */
export const CONNECTION_FIELDS = ['name', 'notes'];

/**
 * The label columns, 0..N labels each, keyed by the field that holds the list
 * and the single free-text field early entries kept instead (`null`: none).
 * `relations` is how the character stands to the person ("Kontakt",
 * "Rivale"); `knows` names the other people this person knows, which is what
 * joins people to each other in the graph.
 */
export const LABEL_FIELDS = {
  relations: 'relation',
  knows: null,
  factions: 'faction',
  origins: 'origin',
};

/**
 * The yes/no columns. `neuralink`: the person is in the character's
 * phone book — Neuralink is the phone, so a ticked person can be reached
 * through it. Bookkeeping only; nothing reads it as a rule.
 */
export const CONNECTION_FLAGS = ['neuralink'];

/**
 * Read a label list from anything stored for it. Early entries kept each
 * label column as one free-text string, which splits at commas — "Kontakt,
 * Rivale" was always meant as two. Blank and repeated labels (ignoring case)
 * are dropped; the first spelling wins.
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeLabels(value) {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const label = String(item ?? '').trim();
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/**
 * Read the stored list into a canonical array of complete entries. Anything
 * that is not an object is dropped; a missing id is replaced by a positional
 * one so the row still has an address until the next write.
 *
 * @param {unknown} stored  `system.connections` as found on the actor.
 * @returns {Array<{id: string, name: string, notes: string, relations: string[], factions: string[], origins: string[], neuralink: boolean, actorUuid: string|null}>}
 */
export function normalizeConnections(stored) {
  const values = Array.isArray(stored)
    ? stored
    : stored && typeof stored === 'object'
      ? Object.values(stored)
      : [];

  return values
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry, index) => {
      const out = { id: String(entry.id ?? '').trim() || `legacy-${index}` };
      for (const field of CONNECTION_FIELDS) out[field] = String(entry[field] ?? '');
      for (const [field, legacy] of Object.entries(LABEL_FIELDS)) {
        out[field] = normalizeLabels(entry[field] ?? (legacy ? entry[legacy] : undefined));
      }
      for (const flag of CONNECTION_FLAGS) out[flag] = entry[flag] === true;
      out.actorUuid = entry.actorUuid ? String(entry.actorUuid) : null;
      return out;
    });
}

/**
 * Append an entry.
 * @param {unknown} stored
 * @param {string} id  A fresh id for the new entry.
 * @param {object} [init]  Initial field values, e.g. `{name, actorUuid}` from a dropped Actor.
 */
export function addConnection(stored, id, init = {}) {
  return [...normalizeConnections(stored), ...normalizeConnections([{ ...init, id }])];
}

/**
 * Set one field of one entry: text for a CONNECTION_FIELDS column, a boolean
 * for a CONNECTION_FLAGS one. An unknown field or id leaves the list as it was.
 */
export function editConnection(stored, id, field, value) {
  const list = normalizeConnections(stored);
  const flag = CONNECTION_FLAGS.includes(field);
  if (!flag && !CONNECTION_FIELDS.includes(field)) return list;
  const next = flag ? value === true : String(value ?? '');
  return list.map((entry) => (entry.id === id ? { ...entry, [field]: next } : entry));
}

/**
 * Give one entry another label in a label column; one it already has is not
 * repeated. An unknown column leaves the list as it was.
 */
export function addLabel(stored, id, field, label) {
  const list = normalizeConnections(stored);
  if (!(field in LABEL_FIELDS)) return list;
  return list.map((entry) =>
    entry.id === id ? { ...entry, [field]: normalizeLabels([...entry[field], label]) } : entry
  );
}

/** Take the label at `index` of a label column off one entry. */
export function removeLabel(stored, id, field, index) {
  const list = normalizeConnections(stored);
  if (!(field in LABEL_FIELDS)) return list;
  return list.map((entry) =>
    entry.id === id ? { ...entry, [field]: entry[field].filter((_, i) => i !== index) } : entry
  );
}

/**
 * The labels to offer while a label column is typed in: every label used in
 * that column across the table, most used first and alphabetical among
 * equals, without those the row already has. A typed text narrows them to
 * labels containing it, those starting with it ahead of the rest.
 *
 * `shared` adds the entries of the other characters the user may see, so a
 * group spells "T.H.V." one way. Their labels come after the table's own
 * within each match rank; a label in both counts as the table's.
 *
 * Whom a person knows (`knows`) is a person, so that column also offers the
 * names of the rows — the table's own as its own, the other characters' and
 * the `people` passed in after them.
 *
 * @param {unknown} stored
 * @param {string} field   A key of LABEL_FIELDS.
 * @param {string} typed   The text in the label field so far.
 * @param {string} ownId   The row being edited.
 * @param {object} [options]
 * @param {unknown[]} [options.shared]  Other characters' `system.connections`.
 * @param {string[]} [options.people]   More names to offer in `knows`, e.g. Actors'.
 * @returns {string[]}
 */
export function labelSuggestions(stored, field, typed, ownId, { shared = [], people = [] } = {}) {
  if (!(field in LABEL_FIELDS)) return [];
  const list = normalizeConnections(stored);
  const others = shared.map((other) => normalizeConnections(other));
  const own = new Set(
    (list.find((entry) => entry.id === ownId)?.[field] ?? []).map((label) => label.toLocaleLowerCase())
  );
  const counts = new Map();
  const tally = (labels, foreign) => {
    for (const raw of labels) {
      const label = String(raw ?? '').trim();
      const key = label.toLocaleLowerCase();
      if (!label || own.has(key)) continue;
      const known = counts.get(key);
      counts.set(key, { label: known?.label ?? label, foreign: known?.foreign ?? foreign, count: (known?.count ?? 0) + 1 });
    }
  };
  const names = (entries) => entries.filter((entry) => entry.id !== ownId).map((entry) => entry.name);

  tally(list.flatMap((entry) => entry[field]), false);
  if (field === 'knows') tally(names(list), false);
  for (const entries of others) tally(entries.flatMap((entry) => entry[field]), true);
  if (field === 'knows') {
    for (const entries of others) tally(names(entries), true);
    tally(people, true);
  }

  const query = String(typed ?? '').trim().toLocaleLowerCase();
  const rank = (label) => (label.toLocaleLowerCase().startsWith(query) ? 0 : 1);
  return [...counts.values()]
    .filter(({ label }) => label.toLocaleLowerCase().includes(query))
    .sort((a, b) =>
      rank(a.label) - rank(b.label) || a.foreign - b.foreign || b.count - a.count || a.label.localeCompare(b.label))
    .map(({ label }) => label);
}

/** Drop one entry. */
export function removeConnection(stored, id) {
  return normalizeConnections(stored).filter((entry) => entry.id !== id);
}

/**
 * Whether an entry was made from this Actor already, so dropping the same
 * Actor twice does not list the person twice.
 */
export function hasConnectionTo(stored, actorUuid) {
  return !!actorUuid && normalizeConnections(stored).some((entry) => entry.actorUuid === actorUuid);
}

/**
 * The people to offer while a Name is typed: the table's own rows, everyone
 * the other characters list and every Actor passed in, matched by name
 * ignoring case — names starting with the text ahead of the rest, the
 * table's own ahead of the others, then the most often known. A name several
 * sources share is one suggestion, carrying every Fraktion and Herkunft they
 * gave it and the first linked Actor. One the table already has carries its
 * row's `connectionId`, so picking it can go to that row instead of making a
 * second one.
 *
 * @param {unknown} stored   The table's own `system.connections`.
 * @param {string} typed     The Name typed so far.
 * @param {string} ownId     The row being typed in, never offered to itself.
 * @param {object} [options]
 * @param {unknown[]} [options.shared]  Other characters' `system.connections`.
 * @param {Array<{name: string, uuid: string}>} [options.actors]  Actors to offer by name.
 * @returns {Array<{name: string, factions: string[], origins: string[], actorUuid: string|null, connectionId: string|null}>}
 */
export function personSuggestions(stored, typed, ownId, { shared = [], actors = [] } = {}) {
  const query = String(typed ?? '').trim().toLocaleLowerCase();
  if (!query) return [];
  const people = new Map();
  const offer = (name, { factions = [], origins = [], actorUuid = null } = {}, connectionId = null) => {
    const label = String(name ?? '').trim();
    const key = label.toLocaleLowerCase();
    if (!label || !key.includes(query)) return;
    const known = people.get(key);
    people.set(key, {
      name: known?.name ?? label,
      factions: normalizeLabels([...(known?.factions ?? []), ...factions]),
      origins: normalizeLabels([...(known?.origins ?? []), ...origins]),
      actorUuid: known?.actorUuid ?? actorUuid,
      connectionId: known?.connectionId ?? connectionId,
      count: (known?.count ?? 0) + 1,
    });
  };
  for (const entry of normalizeConnections(stored)) if (entry.id !== ownId) offer(entry.name, entry, entry.id);
  for (const actor of actors) offer(actor.name, { actorUuid: actor.uuid });
  for (const other of shared) for (const entry of normalizeConnections(other)) offer(entry.name, entry);

  const rank = (person) => (person.name.toLocaleLowerCase().startsWith(query) ? 0 : 1);
  return [...people.values()]
    .sort((a, b) => rank(a) - rank(b) || !a.connectionId - !b.connectionId || b.count - a.count || a.name.localeCompare(b.name))
    .map(({ count, ...person }) => person);
}

/**
 * Make one row the person picked from `personSuggestions`: their name, the
 * Fraktion and Herkunft labels known about them added to the row's own, and
 * their Actor link if the row has none yet.
 */
export function adoptPerson(stored, id, person) {
  return normalizeConnections(stored).map((entry) =>
    entry.id === id
      ? {
          ...entry,
          name: person.name,
          factions: normalizeLabels([...entry.factions, ...(person.factions ?? [])]),
          origins: normalizeLabels([...entry.origins, ...(person.origins ?? [])]),
          actorUuid: entry.actorUuid ?? person.actorUuid ?? null,
        }
      : entry
  );
}

/**
 * All of an entry's text in one string, for the tab's search box. A ticked
 * Neuralink box adds the word, so searching for it finds those people.
 */
export function connectionSearchText(entry) {
  const words = [
    ...CONNECTION_FIELDS.map((field) => entry[field]),
    ...Object.keys(LABEL_FIELDS).flatMap((field) => entry[field]),
  ];
  if (entry.neuralink) words.push('Neuralink');
  return words.filter(Boolean).join(' ');
}
