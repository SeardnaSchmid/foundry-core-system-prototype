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
 * Skill categories, in display order. "milieus", "biomes", "technology" and
 * "knowledge" are placeholders from the WIP skill list with no skills
 * assigned yet; they render as empty groups until filled in.
 * @type {Object}
 */
JOSTER.skillCategories = {
  combat: 'JOSTER.SkillCategory.Combat',
  general: 'JOSTER.SkillCategory.General',
  milieus: 'JOSTER.SkillCategory.Milieus',
  biomes: 'JOSTER.SkillCategory.Biomes',
  technology: 'JOSTER.SkillCategory.Technology',
  knowledge: 'JOSTER.SkillCategory.Knowledge',
};

/**
 * The set of Skills used within the system. Each skill is linked to the
 * Attribute it's rolled with; `category` groups it under JOSTER.skillCategories.
 * @type {Object}
 */
JOSTER.skills = {
  brawling: { label: 'JOSTER.Skill.Brawling', category: 'combat', attribute: 'str' },
  swords: { label: 'JOSTER.Skill.Swords', category: 'combat', attribute: 'fin' },
  heavyMelee: { label: 'JOSTER.Skill.HeavyMelee', category: 'combat', attribute: 'str' },
  flexibleWeapons: { label: 'JOSTER.Skill.FlexibleWeapons', category: 'combat', attribute: 'fin' },
  shooting: { label: 'JOSTER.Skill.Shooting', category: 'combat', attribute: 'per' },
  sniper: { label: 'JOSTER.Skill.Sniper', category: 'combat', attribute: 'per' },
  heavyRanged: { label: 'JOSTER.Skill.HeavyRanged', category: 'combat', attribute: 'str' },
  electronicWeapons: { label: 'JOSTER.Skill.ElectronicWeapons', category: 'combat', attribute: 'fin' },
  throwingWeapons: { label: 'JOSTER.Skill.ThrowingWeapons', category: 'combat', attribute: 'fin' },
  exotic: { label: 'JOSTER.Skill.Exotic', category: 'combat', attribute: 'fin' },
  athletics: { label: 'JOSTER.Skill.Athletics', category: 'general', attribute: 'dex' },
  acrobatics: { label: 'JOSTER.Skill.Acrobatics', category: 'general', attribute: 'dex' },
  stealth: { label: 'JOSTER.Skill.Stealth', category: 'general', attribute: 'dex' },
  selfControl: { label: 'JOSTER.Skill.SelfControl', category: 'general', attribute: 'wil' },
};
