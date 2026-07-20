export const TNO = {};

/**
 * The three groups primary attributes are organized into.
 * @type {Object}
 */
TNO.attributeCategories = {
  physical: 'TNO.AttributeCategory.Physical',
  social: 'TNO.AttributeCategory.Social',
  mental: 'TNO.AttributeCategory.Mental',
};

/**
 * The set of primary Attributes used within the system.
 * @type {Object}
 */
TNO.abilities = {
  str: 'TNO.Ability.Str.long',
  dex: 'TNO.Ability.Dex.long',
  fin: 'TNO.Ability.Fin.long',
  per: 'TNO.Ability.Per.long',
  aut: 'TNO.Ability.Aut.long',
  cha: 'TNO.Ability.Cha.long',
  man: 'TNO.Ability.Man.long',
  emp: 'TNO.Ability.Emp.long',
  wil: 'TNO.Ability.Wil.long',
  int: 'TNO.Ability.Int.long',
  wis: 'TNO.Ability.Wis.long',
  inv: 'TNO.Ability.Inv.long',
};

/**
 * Which category (physical / social / mental) each attribute belongs to.
 * Drives the 3-column layout of the attribute block on the character sheet.
 * @type {Object}
 */
TNO.abilityCategory = {
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
TNO.attributeRows = [
  ['str', 'aut', 'wil'],
  ['dex', 'cha', 'int'],
  ['fin', 'man', 'wis'],
  ['per', 'emp', 'inv'],
];

/**
 * Localization keys for the label of each row in TNO.attributeRows,
 * describing the shared theme of that row's three attributes.
 * @type {Array<string>}
 */
TNO.attributeRowLabels = [
  'TNO.AttributeRow.Assert',
  'TNO.AttributeRow.Adapt',
  'TNO.AttributeRow.Influence',
  'TNO.AttributeRow.Perceive',
];

/**
 * Skill categories, in display order.
 * @type {Object}
 */
TNO.skillCategories = {
  combat: 'TNO.SkillCategory.Combat',
  maneuvers: 'TNO.SkillCategory.Maneuvers',
  general: 'TNO.SkillCategory.General',
  milieus: 'TNO.SkillCategory.Milieus',
  biomes: 'TNO.SkillCategory.Biomes',
  technology: 'TNO.SkillCategory.Technology',
  knowledge: 'TNO.SkillCategory.Knowledge',
};

/**
 * The set of Skills used within the system. `attribute` is only the
 * suggested pairing preselected when rolling this skill — any attribute can
 * be swapped in via the roll dialog's chip picker, since a skill is never
 * bound to one fixed attribute. `category` groups it under TNO.skillCategories.
 * @type {Object}
 */
TNO.skills = {
  brawling: { label: 'TNO.Skill.Brawling', category: 'combat', attribute: 'str', starter: true },
  swords: { label: 'TNO.Skill.Swords', category: 'combat', attribute: 'fin', starter: true },
  heavyMelee: { label: 'TNO.Skill.HeavyMelee', category: 'combat', attribute: 'str', starter: true },
  flexibleWeapons: { label: 'TNO.Skill.FlexibleWeapons', category: 'combat', attribute: 'fin', starter: true },
  shooting: { label: 'TNO.Skill.Shooting', category: 'combat', attribute: 'per', starter: true },
  sniper: { label: 'TNO.Skill.Sniper', category: 'combat', attribute: 'per', starter: true },
  heavyRanged: { label: 'TNO.Skill.HeavyRanged', category: 'combat', attribute: 'str', starter: true },
  launcher: { label: 'TNO.Skill.Launcher', category: 'combat', attribute: 'per', starter: true },
  electronicWeapons: { label: 'TNO.Skill.ElectronicWeapons', category: 'combat', attribute: 'fin', starter: true },
  exotic: { label: 'TNO.Skill.Exotic', category: 'combat', attribute: 'fin' },
  throwingWeapons: { label: 'TNO.Skill.ThrowingWeapons', category: 'combat', attribute: 'fin' },

  preciseStrike: { label: 'TNO.Skill.PreciseStrike', category: 'maneuvers', attribute: 'fin', starter: true },
  cunningAttacks: { label: 'TNO.Skill.CunningAttacks', category: 'maneuvers', attribute: 'fin', starter: true },
  footwork: { label: 'TNO.Skill.Footwork', category: 'maneuvers', attribute: 'dex', starter: true },
  dirtyTricks: { label: 'TNO.Skill.DirtyTricks', category: 'maneuvers', attribute: 'fin', starter: true },
  rangeControl: { label: 'TNO.Skill.RangeControl', category: 'maneuvers', attribute: 'str', starter: true },
  defensiveCombat: { label: 'TNO.Skill.DefensiveCombat', category: 'maneuvers', attribute: 'dex', starter: true },
  calledShot: { label: 'TNO.Skill.CalledShot', category: 'maneuvers', attribute: 'per', starter: true },
  suppressiveFire: { label: 'TNO.Skill.SuppressiveFire', category: 'maneuvers', attribute: 'per', starter: true },
  gunKata: { label: 'TNO.Skill.GunKata', category: 'maneuvers', attribute: 'fin' },
  useCover: { label: 'TNO.Skill.UseCover', category: 'maneuvers', attribute: 'per', starter: true },
  groupTactics: { label: 'TNO.Skill.GroupTactics', category: 'maneuvers', attribute: 'aut', starter: true },
  psychWarfare: { label: 'TNO.Skill.PsychWarfare', category: 'maneuvers', attribute: 'aut', starter: true },
  leadership: { label: 'TNO.Skill.Leadership', category: 'maneuvers', attribute: 'aut', starter: true },

  athletics: { label: 'TNO.Skill.Athletics', category: 'general', attribute: 'dex', starter: true },
  acrobatics: { label: 'TNO.Skill.Acrobatics', category: 'general', attribute: 'dex', starter: true },
  stealth: { label: 'TNO.Skill.Stealth', category: 'general', attribute: 'dex' },
  selfControl: { label: 'TNO.Skill.SelfControl', category: 'general', attribute: 'wil', starter: true },
  contortionist: { label: 'TNO.Skill.Contortionist', category: 'general', attribute: 'dex', starter: true },
  sleightOfHand: { label: 'TNO.Skill.SleightOfHand', category: 'general', attribute: 'fin', starter: true },

  milieuImperialUpper: { label: 'TNO.Skill.MilieuImperialUpper', category: 'milieus', attribute: 'emp' },
  milieuImperialCitizen: { label: 'TNO.Skill.MilieuImperialCitizen', category: 'milieus', attribute: 'emp' },
  milieuImperialLower: { label: 'TNO.Skill.MilieuImperialLower', category: 'milieus', attribute: 'emp' },
  milieuKuiperNior: { label: 'TNO.Skill.MilieuKuiperNior', category: 'milieus', attribute: 'emp' },
  milieuKuiperOdur: { label: 'TNO.Skill.MilieuKuiperOdur', category: 'milieus', attribute: 'emp' },
  milieuKuiperBragis: { label: 'TNO.Skill.MilieuKuiperBragis', category: 'milieus', attribute: 'emp' },
  milieuKuiperForset: { label: 'TNO.Skill.MilieuKuiperForset', category: 'milieus', attribute: 'emp' },
  milieuKuiperSolani: { label: 'TNO.Skill.MilieuKuiperSolani', category: 'milieus', attribute: 'emp' },
  milieuKuiperErinnernde: { label: 'TNO.Skill.MilieuKuiperErinnernde', category: 'milieus', attribute: 'emp' },
  milieuSoViva: { label: 'TNO.Skill.MilieuSoViva', category: 'milieus', attribute: 'emp' },
  milieuSoPerja: { label: 'TNO.Skill.MilieuSoPerja', category: 'milieus', attribute: 'emp' },

  biomeShipsOrbitals: { label: 'TNO.Skill.BiomeShipsOrbitals', category: 'biomes', attribute: 'inv' },
  biomeIndustrial: { label: 'TNO.Skill.BiomeIndustrial', category: 'biomes', attribute: 'inv' },
  biomeAgricultural: { label: 'TNO.Skill.BiomeAgricultural', category: 'biomes', attribute: 'inv' },
  biomeHivesMigrators: { label: 'TNO.Skill.BiomeHivesMigrators', category: 'biomes', attribute: 'inv' },
  biomePlanetoids: { label: 'TNO.Skill.BiomePlanetoids', category: 'biomes', attribute: 'inv' },
  biomeDryAsteroids: { label: 'TNO.Skill.BiomeDryAsteroids', category: 'biomes', attribute: 'inv' },
  biomeWetAsteroids: { label: 'TNO.Skill.BiomeWetAsteroids', category: 'biomes', attribute: 'inv' },
  biomeTouchedCubewano: { label: 'TNO.Skill.BiomeTouchedCubewano', category: 'biomes', attribute: 'inv' },
  biomeTouchedResonant: { label: 'TNO.Skill.BiomeTouchedResonant', category: 'biomes', attribute: 'inv' },
  biomeTouchedScattered: { label: 'TNO.Skill.BiomeTouchedScattered', category: 'biomes', attribute: 'inv' },
  biomeTouchedDetached: { label: 'TNO.Skill.BiomeTouchedDetached', category: 'biomes', attribute: 'inv' },
  biomeAwakenedAsteroids: { label: 'TNO.Skill.BiomeAwakenedAsteroids', category: 'biomes', attribute: 'inv' },
  biomeFreeSpace: { label: 'TNO.Skill.BiomeFreeSpace', category: 'biomes', attribute: 'inv' },
  biomeRelictoids: { label: 'TNO.Skill.BiomeRelictoids', category: 'biomes', attribute: 'inv' },

  techMining: { label: 'TNO.Skill.TechMining', category: 'technology', attribute: 'int', starter: true },
  techMechanics: { label: 'TNO.Skill.TechMechanics', category: 'technology', attribute: 'int', starter: true },
  techElectronics: { label: 'TNO.Skill.TechElectronics', category: 'technology', attribute: 'int', starter: true },
  techPropulsion: { label: 'TNO.Skill.TechPropulsion', category: 'technology', attribute: 'int', starter: true },
  techBiovat: { label: 'TNO.Skill.TechBiovat', category: 'technology', attribute: 'int' },
  techSoftware: { label: 'TNO.Skill.TechSoftware', category: 'technology', attribute: 'int', starter: true },
  techSensors: { label: 'TNO.Skill.TechSensors', category: 'technology', attribute: 'int', starter: true },
  techSecurity: { label: 'TNO.Skill.TechSecurity', category: 'technology', attribute: 'int', starter: true },
  techComms: { label: 'TNO.Skill.TechComms', category: 'technology', attribute: 'int', starter: true },
  techHacking: { label: 'TNO.Skill.TechHacking', category: 'technology', attribute: 'int', starter: true },
  techTissue: { label: 'TNO.Skill.TechTissue', category: 'technology', attribute: 'int', starter: true },
  techSymbio: { label: 'TNO.Skill.TechSymbio', category: 'technology', attribute: 'int' },
  techExplosives: { label: 'TNO.Skill.TechExplosives', category: 'technology', attribute: 'int', starter: true },
  medFirstAid: { label: 'TNO.Skill.MedFirstAid', category: 'technology', attribute: 'fin', starter: true },
  medSurgery: { label: 'TNO.Skill.MedSurgery', category: 'technology', attribute: 'fin', starter: true },
  medPoisons: { label: 'TNO.Skill.MedPoisons', category: 'technology', attribute: 'int', starter: true },
  medDiseases: { label: 'TNO.Skill.MedDiseases', category: 'technology', attribute: 'int', starter: true },
  pilotInterorbital: { label: 'TNO.Skill.PilotInterorbital', category: 'technology', attribute: 'fin', starter: true },
  pilotTransorbital: { label: 'TNO.Skill.PilotTransorbital', category: 'technology', attribute: 'fin' },
  pilotGroundVehicles: { label: 'TNO.Skill.PilotGroundVehicles', category: 'technology', attribute: 'fin', starter: true },
  pilotWalkers: { label: 'TNO.Skill.PilotWalkers', category: 'technology', attribute: 'fin' },

  sciAstronomy: { label: 'TNO.Skill.SciAstronomy', category: 'knowledge', attribute: 'wis', starter: true },
  sciPhysics: { label: 'TNO.Skill.SciPhysics', category: 'knowledge', attribute: 'wis', starter: true },
  sciChemistry: { label: 'TNO.Skill.SciChemistry', category: 'knowledge', attribute: 'wis', starter: true },
  sciBiology: { label: 'TNO.Skill.SciBiology', category: 'knowledge', attribute: 'wis', starter: true },
  humPoliticalScience: { label: 'TNO.Skill.HumPoliticalScience', category: 'knowledge', attribute: 'wis', starter: true },
  humEconomics: { label: 'TNO.Skill.HumEconomics', category: 'knowledge', attribute: 'wis', starter: true },
  humLaw: { label: 'TNO.Skill.HumLaw', category: 'knowledge', attribute: 'wis', starter: true },
  humStrategy: { label: 'TNO.Skill.HumStrategy', category: 'knowledge', attribute: 'wis', starter: true },
  humPsychology: { label: 'TNO.Skill.HumPsychology', category: 'knowledge', attribute: 'wis', starter: true },
  cultArtMusic: { label: 'TNO.Skill.CultArtMusic', category: 'knowledge', attribute: 'wis', starter: true },
  cultWriting: { label: 'TNO.Skill.CultWriting', category: 'knowledge', attribute: 'wis', starter: true },
  cultCooking: { label: 'TNO.Skill.CultCooking', category: 'knowledge', attribute: 'wis', starter: true },
  cultGamesSports: { label: 'TNO.Skill.CultGamesSports', category: 'knowledge', attribute: 'wis', starter: true },
  cultReligion: { label: 'TNO.Skill.CultReligion', category: 'knowledge', attribute: 'wis', starter: true },
  cultHistory: { label: 'TNO.Skill.CultHistory', category: 'knowledge', attribute: 'wis', starter: true },
};
