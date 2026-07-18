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
 * Skill categories, in display order.
 * @type {Object}
 */
JOSTER.skillCategories = {
  combat: 'JOSTER.SkillCategory.Combat',
  maneuvers: 'JOSTER.SkillCategory.Maneuvers',
  general: 'JOSTER.SkillCategory.General',
  milieus: 'JOSTER.SkillCategory.Milieus',
  biomes: 'JOSTER.SkillCategory.Biomes',
  technology: 'JOSTER.SkillCategory.Technology',
  knowledge: 'JOSTER.SkillCategory.Knowledge',
};

/**
 * The set of Skills used within the system. `attribute` is only the
 * suggested pairing preselected when rolling this skill — any attribute can
 * be swapped in via the roll dialog's chip picker, since a skill is never
 * bound to one fixed attribute. `category` groups it under JOSTER.skillCategories.
 * @type {Object}
 */
JOSTER.skills = {
  brawling: { label: 'JOSTER.Skill.Brawling', category: 'combat', attribute: 'str', starter: true },
  swords: { label: 'JOSTER.Skill.Swords', category: 'combat', attribute: 'fin', starter: true },
  heavyMelee: { label: 'JOSTER.Skill.HeavyMelee', category: 'combat', attribute: 'str', starter: true },
  flexibleWeapons: { label: 'JOSTER.Skill.FlexibleWeapons', category: 'combat', attribute: 'fin', starter: true },
  shooting: { label: 'JOSTER.Skill.Shooting', category: 'combat', attribute: 'per', starter: true },
  sniper: { label: 'JOSTER.Skill.Sniper', category: 'combat', attribute: 'per', starter: true },
  heavyRanged: { label: 'JOSTER.Skill.HeavyRanged', category: 'combat', attribute: 'str', starter: true },
  launcher: { label: 'JOSTER.Skill.Launcher', category: 'combat', attribute: 'per', starter: true },
  electronicWeapons: { label: 'JOSTER.Skill.ElectronicWeapons', category: 'combat', attribute: 'fin', starter: true },
  exotic: { label: 'JOSTER.Skill.Exotic', category: 'combat', attribute: 'fin' },
  throwingWeapons: { label: 'JOSTER.Skill.ThrowingWeapons', category: 'combat', attribute: 'fin' },

  preciseStrike: { label: 'JOSTER.Skill.PreciseStrike', category: 'maneuvers', attribute: 'fin', starter: true },
  cunningAttacks: { label: 'JOSTER.Skill.CunningAttacks', category: 'maneuvers', attribute: 'fin', starter: true },
  footwork: { label: 'JOSTER.Skill.Footwork', category: 'maneuvers', attribute: 'dex', starter: true },
  dirtyTricks: { label: 'JOSTER.Skill.DirtyTricks', category: 'maneuvers', attribute: 'fin', starter: true },
  rangeControl: { label: 'JOSTER.Skill.RangeControl', category: 'maneuvers', attribute: 'str', starter: true },
  defensiveCombat: { label: 'JOSTER.Skill.DefensiveCombat', category: 'maneuvers', attribute: 'dex', starter: true },
  calledShot: { label: 'JOSTER.Skill.CalledShot', category: 'maneuvers', attribute: 'per', starter: true },
  suppressiveFire: { label: 'JOSTER.Skill.SuppressiveFire', category: 'maneuvers', attribute: 'per', starter: true },
  gunKata: { label: 'JOSTER.Skill.GunKata', category: 'maneuvers', attribute: 'fin' },
  useCover: { label: 'JOSTER.Skill.UseCover', category: 'maneuvers', attribute: 'per', starter: true },
  groupTactics: { label: 'JOSTER.Skill.GroupTactics', category: 'maneuvers', attribute: 'aut', starter: true },
  psychWarfare: { label: 'JOSTER.Skill.PsychWarfare', category: 'maneuvers', attribute: 'aut', starter: true },
  leadership: { label: 'JOSTER.Skill.Leadership', category: 'maneuvers', attribute: 'aut', starter: true },

  athletics: { label: 'JOSTER.Skill.Athletics', category: 'general', attribute: 'dex', starter: true },
  acrobatics: { label: 'JOSTER.Skill.Acrobatics', category: 'general', attribute: 'dex', starter: true },
  stealth: { label: 'JOSTER.Skill.Stealth', category: 'general', attribute: 'dex' },
  selfControl: { label: 'JOSTER.Skill.SelfControl', category: 'general', attribute: 'wil', starter: true },
  contortionist: { label: 'JOSTER.Skill.Contortionist', category: 'general', attribute: 'dex', starter: true },
  sleightOfHand: { label: 'JOSTER.Skill.SleightOfHand', category: 'general', attribute: 'fin', starter: true },

  milieuImperialUpper: { label: 'JOSTER.Skill.MilieuImperialUpper', category: 'milieus', attribute: 'emp' },
  milieuImperialCitizen: { label: 'JOSTER.Skill.MilieuImperialCitizen', category: 'milieus', attribute: 'emp' },
  milieuImperialLower: { label: 'JOSTER.Skill.MilieuImperialLower', category: 'milieus', attribute: 'emp' },
  milieuKuiperNior: { label: 'JOSTER.Skill.MilieuKuiperNior', category: 'milieus', attribute: 'emp' },
  milieuKuiperOdur: { label: 'JOSTER.Skill.MilieuKuiperOdur', category: 'milieus', attribute: 'emp' },
  milieuKuiperBragis: { label: 'JOSTER.Skill.MilieuKuiperBragis', category: 'milieus', attribute: 'emp' },
  milieuKuiperForset: { label: 'JOSTER.Skill.MilieuKuiperForset', category: 'milieus', attribute: 'emp' },
  milieuKuiperSolani: { label: 'JOSTER.Skill.MilieuKuiperSolani', category: 'milieus', attribute: 'emp' },
  milieuKuiperErinnernde: { label: 'JOSTER.Skill.MilieuKuiperErinnernde', category: 'milieus', attribute: 'emp' },
  milieuSoViva: { label: 'JOSTER.Skill.MilieuSoViva', category: 'milieus', attribute: 'emp' },
  milieuSoPerja: { label: 'JOSTER.Skill.MilieuSoPerja', category: 'milieus', attribute: 'emp' },

  biomeShipsOrbitals: { label: 'JOSTER.Skill.BiomeShipsOrbitals', category: 'biomes', attribute: 'inv' },
  biomeIndustrial: { label: 'JOSTER.Skill.BiomeIndustrial', category: 'biomes', attribute: 'inv' },
  biomeAgricultural: { label: 'JOSTER.Skill.BiomeAgricultural', category: 'biomes', attribute: 'inv' },
  biomeHivesMigrators: { label: 'JOSTER.Skill.BiomeHivesMigrators', category: 'biomes', attribute: 'inv' },
  biomePlanetoids: { label: 'JOSTER.Skill.BiomePlanetoids', category: 'biomes', attribute: 'inv' },
  biomeDryAsteroids: { label: 'JOSTER.Skill.BiomeDryAsteroids', category: 'biomes', attribute: 'inv' },
  biomeWetAsteroids: { label: 'JOSTER.Skill.BiomeWetAsteroids', category: 'biomes', attribute: 'inv' },
  biomeTouchedCubewano: { label: 'JOSTER.Skill.BiomeTouchedCubewano', category: 'biomes', attribute: 'inv' },
  biomeTouchedResonant: { label: 'JOSTER.Skill.BiomeTouchedResonant', category: 'biomes', attribute: 'inv' },
  biomeTouchedScattered: { label: 'JOSTER.Skill.BiomeTouchedScattered', category: 'biomes', attribute: 'inv' },
  biomeTouchedDetached: { label: 'JOSTER.Skill.BiomeTouchedDetached', category: 'biomes', attribute: 'inv' },
  biomeAwakenedAsteroids: { label: 'JOSTER.Skill.BiomeAwakenedAsteroids', category: 'biomes', attribute: 'inv' },
  biomeFreeSpace: { label: 'JOSTER.Skill.BiomeFreeSpace', category: 'biomes', attribute: 'inv' },
  biomeRelictoids: { label: 'JOSTER.Skill.BiomeRelictoids', category: 'biomes', attribute: 'inv' },

  techMining: { label: 'JOSTER.Skill.TechMining', category: 'technology', attribute: 'int', starter: true },
  techMechanics: { label: 'JOSTER.Skill.TechMechanics', category: 'technology', attribute: 'int', starter: true },
  techElectronics: { label: 'JOSTER.Skill.TechElectronics', category: 'technology', attribute: 'int', starter: true },
  techPropulsion: { label: 'JOSTER.Skill.TechPropulsion', category: 'technology', attribute: 'int', starter: true },
  techBiovat: { label: 'JOSTER.Skill.TechBiovat', category: 'technology', attribute: 'int' },
  techSoftware: { label: 'JOSTER.Skill.TechSoftware', category: 'technology', attribute: 'int', starter: true },
  techSensors: { label: 'JOSTER.Skill.TechSensors', category: 'technology', attribute: 'int', starter: true },
  techSecurity: { label: 'JOSTER.Skill.TechSecurity', category: 'technology', attribute: 'int', starter: true },
  techComms: { label: 'JOSTER.Skill.TechComms', category: 'technology', attribute: 'int', starter: true },
  techHacking: { label: 'JOSTER.Skill.TechHacking', category: 'technology', attribute: 'int', starter: true },
  techTissue: { label: 'JOSTER.Skill.TechTissue', category: 'technology', attribute: 'int', starter: true },
  techSymbio: { label: 'JOSTER.Skill.TechSymbio', category: 'technology', attribute: 'int' },
  techExplosives: { label: 'JOSTER.Skill.TechExplosives', category: 'technology', attribute: 'int', starter: true },
  medFirstAid: { label: 'JOSTER.Skill.MedFirstAid', category: 'technology', attribute: 'fin', starter: true },
  medSurgery: { label: 'JOSTER.Skill.MedSurgery', category: 'technology', attribute: 'fin', starter: true },
  medPoisons: { label: 'JOSTER.Skill.MedPoisons', category: 'technology', attribute: 'int', starter: true },
  medDiseases: { label: 'JOSTER.Skill.MedDiseases', category: 'technology', attribute: 'int', starter: true },
  pilotInterorbital: { label: 'JOSTER.Skill.PilotInterorbital', category: 'technology', attribute: 'fin', starter: true },
  pilotTransorbital: { label: 'JOSTER.Skill.PilotTransorbital', category: 'technology', attribute: 'fin' },
  pilotGroundVehicles: { label: 'JOSTER.Skill.PilotGroundVehicles', category: 'technology', attribute: 'fin', starter: true },
  pilotWalkers: { label: 'JOSTER.Skill.PilotWalkers', category: 'technology', attribute: 'fin' },

  sciAstronomy: { label: 'JOSTER.Skill.SciAstronomy', category: 'knowledge', attribute: 'wis', starter: true },
  sciPhysics: { label: 'JOSTER.Skill.SciPhysics', category: 'knowledge', attribute: 'wis', starter: true },
  sciChemistry: { label: 'JOSTER.Skill.SciChemistry', category: 'knowledge', attribute: 'wis', starter: true },
  sciBiology: { label: 'JOSTER.Skill.SciBiology', category: 'knowledge', attribute: 'wis', starter: true },
  humPoliticalScience: { label: 'JOSTER.Skill.HumPoliticalScience', category: 'knowledge', attribute: 'wis', starter: true },
  humEconomics: { label: 'JOSTER.Skill.HumEconomics', category: 'knowledge', attribute: 'wis', starter: true },
  humLaw: { label: 'JOSTER.Skill.HumLaw', category: 'knowledge', attribute: 'wis', starter: true },
  humStrategy: { label: 'JOSTER.Skill.HumStrategy', category: 'knowledge', attribute: 'wis', starter: true },
  humPsychology: { label: 'JOSTER.Skill.HumPsychology', category: 'knowledge', attribute: 'wis', starter: true },
  cultArtMusic: { label: 'JOSTER.Skill.CultArtMusic', category: 'knowledge', attribute: 'wis', starter: true },
  cultWriting: { label: 'JOSTER.Skill.CultWriting', category: 'knowledge', attribute: 'wis', starter: true },
  cultCooking: { label: 'JOSTER.Skill.CultCooking', category: 'knowledge', attribute: 'wis', starter: true },
  cultGamesSports: { label: 'JOSTER.Skill.CultGamesSports', category: 'knowledge', attribute: 'wis', starter: true },
  cultReligion: { label: 'JOSTER.Skill.CultReligion', category: 'knowledge', attribute: 'wis', starter: true },
  cultHistory: { label: 'JOSTER.Skill.CultHistory', category: 'knowledge', attribute: 'wis', starter: true },
};
