export const EDGEFALL = {};

/**
 * The three groups primary attributes are organized into.
 * @type {Object}
 */
EDGEFALL.attributeCategories = {
  physical: 'EDGEFALL.AttributeCategory.Physical',
  social: 'EDGEFALL.AttributeCategory.Social',
  mental: 'EDGEFALL.AttributeCategory.Mental',
};

/**
 * The set of primary Attributes used within the system.
 * @type {Object}
 */
EDGEFALL.abilities = {
  str: 'EDGEFALL.Ability.Str.long',
  dex: 'EDGEFALL.Ability.Dex.long',
  fin: 'EDGEFALL.Ability.Fin.long',
  per: 'EDGEFALL.Ability.Per.long',
  aut: 'EDGEFALL.Ability.Aut.long',
  cha: 'EDGEFALL.Ability.Cha.long',
  man: 'EDGEFALL.Ability.Man.long',
  emp: 'EDGEFALL.Ability.Emp.long',
  wil: 'EDGEFALL.Ability.Wil.long',
  int: 'EDGEFALL.Ability.Int.long',
  wis: 'EDGEFALL.Ability.Wis.long',
  inv: 'EDGEFALL.Ability.Inv.long',
};

/**
 * Which category (physical / social / mental) each attribute belongs to.
 * Drives the 3-column layout of the attribute block on the character sheet.
 * @type {Object}
 */
EDGEFALL.abilityCategory = {
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
EDGEFALL.attributeRows = [
  ['str', 'aut', 'wil'],
  ['dex', 'cha', 'int'],
  ['fin', 'man', 'wis'],
  ['per', 'emp', 'inv'],
];

/**
 * Localization keys for the label of each row in EDGEFALL.attributeRows,
 * describing the shared theme of that row's three attributes.
 * @type {Array<string>}
 */
EDGEFALL.attributeRowLabels = [
  'EDGEFALL.AttributeRow.Assert',
  'EDGEFALL.AttributeRow.Adapt',
  'EDGEFALL.AttributeRow.Influence',
  'EDGEFALL.AttributeRow.Perceive',
];

/**
 * Skill categories, in display order.
 * @type {Object}
 */
EDGEFALL.skillCategories = {
  combat: 'EDGEFALL.SkillCategory.Combat',
  maneuvers: 'EDGEFALL.SkillCategory.Maneuvers',
  general: 'EDGEFALL.SkillCategory.General',
  milieus: 'EDGEFALL.SkillCategory.Milieus',
  biomes: 'EDGEFALL.SkillCategory.Biomes',
  technology: 'EDGEFALL.SkillCategory.Technology',
  knowledge: 'EDGEFALL.SkillCategory.Knowledge',
};

/**
 * The set of Skills used within the system. `attribute` is only the
 * suggested pairing preselected when rolling this skill — any attribute can
 * be swapped in via the roll dialog's chip picker, since a skill is never
 * bound to one fixed attribute. `category` groups it under EDGEFALL.skillCategories.
 * @type {Object}
 */
EDGEFALL.skills = {
  brawling: { label: 'EDGEFALL.Skill.Brawling', category: 'combat', attribute: 'str', starter: true },
  swords: { label: 'EDGEFALL.Skill.Swords', category: 'combat', attribute: 'fin', starter: true },
  heavyMelee: { label: 'EDGEFALL.Skill.HeavyMelee', category: 'combat', attribute: 'str', starter: true },
  flexibleWeapons: { label: 'EDGEFALL.Skill.FlexibleWeapons', category: 'combat', attribute: 'fin', starter: true },
  shooting: { label: 'EDGEFALL.Skill.Shooting', category: 'combat', attribute: 'per', starter: true },
  sniper: { label: 'EDGEFALL.Skill.Sniper', category: 'combat', attribute: 'per', starter: true },
  heavyRanged: { label: 'EDGEFALL.Skill.HeavyRanged', category: 'combat', attribute: 'str', starter: true },
  launcher: { label: 'EDGEFALL.Skill.Launcher', category: 'combat', attribute: 'per', starter: true },
  electronicWeapons: { label: 'EDGEFALL.Skill.ElectronicWeapons', category: 'combat', attribute: 'fin', starter: true },
  exotic: { label: 'EDGEFALL.Skill.Exotic', category: 'combat', attribute: 'fin' },
  throwingWeapons: { label: 'EDGEFALL.Skill.ThrowingWeapons', category: 'combat', attribute: 'fin' },

  preciseStrike: { label: 'EDGEFALL.Skill.PreciseStrike', category: 'maneuvers', attribute: 'fin', starter: true },
  cunningAttacks: { label: 'EDGEFALL.Skill.CunningAttacks', category: 'maneuvers', attribute: 'fin', starter: true },
  footwork: { label: 'EDGEFALL.Skill.Footwork', category: 'maneuvers', attribute: 'dex', starter: true },
  dirtyTricks: { label: 'EDGEFALL.Skill.DirtyTricks', category: 'maneuvers', attribute: 'fin', starter: true },
  rangeControl: { label: 'EDGEFALL.Skill.RangeControl', category: 'maneuvers', attribute: 'str', starter: true },
  defensiveCombat: { label: 'EDGEFALL.Skill.DefensiveCombat', category: 'maneuvers', attribute: 'dex', starter: true },
  calledShot: { label: 'EDGEFALL.Skill.CalledShot', category: 'maneuvers', attribute: 'per', starter: true },
  suppressiveFire: { label: 'EDGEFALL.Skill.SuppressiveFire', category: 'maneuvers', attribute: 'per', starter: true },
  gunKata: { label: 'EDGEFALL.Skill.GunKata', category: 'maneuvers', attribute: 'fin' },
  useCover: { label: 'EDGEFALL.Skill.UseCover', category: 'maneuvers', attribute: 'per', starter: true },
  groupTactics: { label: 'EDGEFALL.Skill.GroupTactics', category: 'maneuvers', attribute: 'aut', starter: true },
  psychWarfare: { label: 'EDGEFALL.Skill.PsychWarfare', category: 'maneuvers', attribute: 'aut', starter: true },
  leadership: { label: 'EDGEFALL.Skill.Leadership', category: 'maneuvers', attribute: 'aut', starter: true },

  athletics: { label: 'EDGEFALL.Skill.Athletics', category: 'general', attribute: 'dex', starter: true },
  acrobatics: { label: 'EDGEFALL.Skill.Acrobatics', category: 'general', attribute: 'dex', starter: true },
  stealth: { label: 'EDGEFALL.Skill.Stealth', category: 'general', attribute: 'dex' },
  selfControl: { label: 'EDGEFALL.Skill.SelfControl', category: 'general', attribute: 'wil', starter: true },
  contortionist: { label: 'EDGEFALL.Skill.Contortionist', category: 'general', attribute: 'dex', starter: true },
  sleightOfHand: { label: 'EDGEFALL.Skill.SleightOfHand', category: 'general', attribute: 'fin', starter: true },

  milieuImperialUpper: { label: 'EDGEFALL.Skill.MilieuImperialUpper', category: 'milieus', attribute: 'emp' },
  milieuImperialCitizen: { label: 'EDGEFALL.Skill.MilieuImperialCitizen', category: 'milieus', attribute: 'emp' },
  milieuImperialLower: { label: 'EDGEFALL.Skill.MilieuImperialLower', category: 'milieus', attribute: 'emp' },
  milieuKuiperNior: { label: 'EDGEFALL.Skill.MilieuKuiperNior', category: 'milieus', attribute: 'emp' },
  milieuKuiperOdur: { label: 'EDGEFALL.Skill.MilieuKuiperOdur', category: 'milieus', attribute: 'emp' },
  milieuKuiperBragis: { label: 'EDGEFALL.Skill.MilieuKuiperBragis', category: 'milieus', attribute: 'emp' },
  milieuKuiperForset: { label: 'EDGEFALL.Skill.MilieuKuiperForset', category: 'milieus', attribute: 'emp' },
  milieuKuiperSolani: { label: 'EDGEFALL.Skill.MilieuKuiperSolani', category: 'milieus', attribute: 'emp' },
  milieuKuiperErinnernde: { label: 'EDGEFALL.Skill.MilieuKuiperErinnernde', category: 'milieus', attribute: 'emp' },
  milieuSoViva: { label: 'EDGEFALL.Skill.MilieuSoViva', category: 'milieus', attribute: 'emp' },
  milieuSoPerja: { label: 'EDGEFALL.Skill.MilieuSoPerja', category: 'milieus', attribute: 'emp' },

  biomeShipsOrbitals: { label: 'EDGEFALL.Skill.BiomeShipsOrbitals', category: 'biomes', attribute: 'inv' },
  biomeIndustrial: { label: 'EDGEFALL.Skill.BiomeIndustrial', category: 'biomes', attribute: 'inv' },
  biomeAgricultural: { label: 'EDGEFALL.Skill.BiomeAgricultural', category: 'biomes', attribute: 'inv' },
  biomeHivesMigrators: { label: 'EDGEFALL.Skill.BiomeHivesMigrators', category: 'biomes', attribute: 'inv' },
  biomePlanetoids: { label: 'EDGEFALL.Skill.BiomePlanetoids', category: 'biomes', attribute: 'inv' },
  biomeDryAsteroids: { label: 'EDGEFALL.Skill.BiomeDryAsteroids', category: 'biomes', attribute: 'inv' },
  biomeWetAsteroids: { label: 'EDGEFALL.Skill.BiomeWetAsteroids', category: 'biomes', attribute: 'inv' },
  biomeTouchedCubewano: { label: 'EDGEFALL.Skill.BiomeTouchedCubewano', category: 'biomes', attribute: 'inv' },
  biomeTouchedResonant: { label: 'EDGEFALL.Skill.BiomeTouchedResonant', category: 'biomes', attribute: 'inv' },
  biomeTouchedScattered: { label: 'EDGEFALL.Skill.BiomeTouchedScattered', category: 'biomes', attribute: 'inv' },
  biomeTouchedDetached: { label: 'EDGEFALL.Skill.BiomeTouchedDetached', category: 'biomes', attribute: 'inv' },
  biomeAwakenedAsteroids: { label: 'EDGEFALL.Skill.BiomeAwakenedAsteroids', category: 'biomes', attribute: 'inv' },
  biomeFreeSpace: { label: 'EDGEFALL.Skill.BiomeFreeSpace', category: 'biomes', attribute: 'inv' },
  biomeRelictoids: { label: 'EDGEFALL.Skill.BiomeRelictoids', category: 'biomes', attribute: 'inv' },

  techMining: { label: 'EDGEFALL.Skill.TechMining', category: 'technology', attribute: 'int', starter: true },
  techMechanics: { label: 'EDGEFALL.Skill.TechMechanics', category: 'technology', attribute: 'int', starter: true },
  techElectronics: { label: 'EDGEFALL.Skill.TechElectronics', category: 'technology', attribute: 'int', starter: true },
  techPropulsion: { label: 'EDGEFALL.Skill.TechPropulsion', category: 'technology', attribute: 'int', starter: true },
  techBiovat: { label: 'EDGEFALL.Skill.TechBiovat', category: 'technology', attribute: 'int' },
  techSoftware: { label: 'EDGEFALL.Skill.TechSoftware', category: 'technology', attribute: 'int', starter: true },
  techSensors: { label: 'EDGEFALL.Skill.TechSensors', category: 'technology', attribute: 'int', starter: true },
  techSecurity: { label: 'EDGEFALL.Skill.TechSecurity', category: 'technology', attribute: 'int', starter: true },
  techComms: { label: 'EDGEFALL.Skill.TechComms', category: 'technology', attribute: 'int', starter: true },
  techHacking: { label: 'EDGEFALL.Skill.TechHacking', category: 'technology', attribute: 'int', starter: true },
  techTissue: { label: 'EDGEFALL.Skill.TechTissue', category: 'technology', attribute: 'int', starter: true },
  techSymbio: { label: 'EDGEFALL.Skill.TechSymbio', category: 'technology', attribute: 'int' },
  techExplosives: { label: 'EDGEFALL.Skill.TechExplosives', category: 'technology', attribute: 'int', starter: true },
  medFirstAid: { label: 'EDGEFALL.Skill.MedFirstAid', category: 'technology', attribute: 'fin', starter: true },
  medSurgery: { label: 'EDGEFALL.Skill.MedSurgery', category: 'technology', attribute: 'fin', starter: true },
  medPoisons: { label: 'EDGEFALL.Skill.MedPoisons', category: 'technology', attribute: 'int', starter: true },
  medDiseases: { label: 'EDGEFALL.Skill.MedDiseases', category: 'technology', attribute: 'int', starter: true },
  pilotInterorbital: { label: 'EDGEFALL.Skill.PilotInterorbital', category: 'technology', attribute: 'fin', starter: true },
  pilotTransorbital: { label: 'EDGEFALL.Skill.PilotTransorbital', category: 'technology', attribute: 'fin' },
  pilotGroundVehicles: { label: 'EDGEFALL.Skill.PilotGroundVehicles', category: 'technology', attribute: 'fin', starter: true },
  pilotWalkers: { label: 'EDGEFALL.Skill.PilotWalkers', category: 'technology', attribute: 'fin' },

  sciAstronomy: { label: 'EDGEFALL.Skill.SciAstronomy', category: 'knowledge', attribute: 'wis', starter: true },
  sciPhysics: { label: 'EDGEFALL.Skill.SciPhysics', category: 'knowledge', attribute: 'wis', starter: true },
  sciChemistry: { label: 'EDGEFALL.Skill.SciChemistry', category: 'knowledge', attribute: 'wis', starter: true },
  sciBiology: { label: 'EDGEFALL.Skill.SciBiology', category: 'knowledge', attribute: 'wis', starter: true },
  humPoliticalScience: { label: 'EDGEFALL.Skill.HumPoliticalScience', category: 'knowledge', attribute: 'wis', starter: true },
  humEconomics: { label: 'EDGEFALL.Skill.HumEconomics', category: 'knowledge', attribute: 'wis', starter: true },
  humLaw: { label: 'EDGEFALL.Skill.HumLaw', category: 'knowledge', attribute: 'wis', starter: true },
  humStrategy: { label: 'EDGEFALL.Skill.HumStrategy', category: 'knowledge', attribute: 'wis', starter: true },
  humPsychology: { label: 'EDGEFALL.Skill.HumPsychology', category: 'knowledge', attribute: 'wis', starter: true },
  cultArtMusic: { label: 'EDGEFALL.Skill.CultArtMusic', category: 'knowledge', attribute: 'wis', starter: true },
  cultWriting: { label: 'EDGEFALL.Skill.CultWriting', category: 'knowledge', attribute: 'wis', starter: true },
  cultCooking: { label: 'EDGEFALL.Skill.CultCooking', category: 'knowledge', attribute: 'wis', starter: true },
  cultGamesSports: { label: 'EDGEFALL.Skill.CultGamesSports', category: 'knowledge', attribute: 'wis', starter: true },
  cultReligion: { label: 'EDGEFALL.Skill.CultReligion', category: 'knowledge', attribute: 'wis', starter: true },
  cultHistory: { label: 'EDGEFALL.Skill.CultHistory', category: 'knowledge', attribute: 'wis', starter: true },
};
