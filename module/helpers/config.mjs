export const JOSTER = {};

/**
 * The three groups primary attributes are organized into.
 * @type {Object}
 */
JOSTER.attributeCategories = {
  physical: 'JOSTER.AttributeCategory.Physical',
  social: 'JOSTER.AttributeCategory.Social',
  mental: 'JOSTER.AttributeCategory.Mental',
};

/**
 * The set of primary Attributes used within the system.
 * @type {Object}
 */
JOSTER.abilities = {
  str: 'JOSTER.Ability.Str.long',
  dex: 'JOSTER.Ability.Dex.long',
  fin: 'JOSTER.Ability.Fin.long',
  per: 'JOSTER.Ability.Per.long',
  aut: 'JOSTER.Ability.Aut.long',
  cha: 'JOSTER.Ability.Cha.long',
  man: 'JOSTER.Ability.Man.long',
  emp: 'JOSTER.Ability.Emp.long',
  wil: 'JOSTER.Ability.Wil.long',
  int: 'JOSTER.Ability.Int.long',
  wis: 'JOSTER.Ability.Wis.long',
  inv: 'JOSTER.Ability.Inv.long',
};

/**
 * Which category (physical / social / mental) each attribute belongs to.
 * Drives the 3-column layout of the attribute block on the character sheet.
 * @type {Object}
 */
JOSTER.abilityCategory = {
  str: 'physical',
  dex: 'physical',
  fin: 'physical',
  per: 'physical',
  aut: 'social',
  cha: 'social',
  man: 'social',
  emp: 'social',
  wil: 'mental',
  int: 'mental',
  wis: 'mental',
  inv: 'mental',
};

/**
 * Row order for the primary attribute table, one [physical, social, mental]
 * triple per row, mirroring the layout of the rulebook's "Attribute" table.
 * @type {Array<[string, string, string]>}
 */
JOSTER.attributeRows = [
  ['str', 'aut', 'wil'],
  ['dex', 'cha', 'int'],
  ['fin', 'man', 'wis'],
  ['per', 'emp', 'inv'],
];

/**
 * Localization keys for the label of each row in JOSTER.attributeRows,
 * describing the shared theme of that row's three attributes.
 * @type {Array<string>}
 */
JOSTER.attributeRowLabels = [
  'JOSTER.AttributeRow.Assert',
  'JOSTER.AttributeRow.Adapt',
  'JOSTER.AttributeRow.Influence',
  'JOSTER.AttributeRow.Perceive',
];

/**
 * Row order for the "Abgeleitete Attribute" table. Each entry's `key` is
 * where the computed value lives on `system.derived`, and `i18n` is the
 * shared suffix used for both the JOSTER.Derived (label) and
 * JOSTER.DerivedHint (calculation) localization keys.
 * @type {Array<{key: string, i18n: string}>}
 */
JOSTER.derivedAttributes = [
  { key: 'initiative', i18n: 'Initiative' },
  { key: 'movementWalk', i18n: 'MovementWalk' },
  { key: 'movementSprint', i18n: 'MovementSprint' },
  { key: 'movementCrawl', i18n: 'MovementCrawl' },
  { key: 'carrySlots', i18n: 'CarrySlots' },
  { key: 'sixthSense', i18n: 'SixthSense' },
  { key: 'solveIdea', i18n: 'SolveIdea' },
  { key: 'solveFindFlaw', i18n: 'SolveFindFlaw' },
  { key: 'solveReserve', i18n: 'SolveReserve' },
  { key: 'solveAnalyzeFlaw', i18n: 'SolveAnalyzeFlaw' },
];
