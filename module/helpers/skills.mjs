const DEFAULT_CATEGORY = 'general';
const DEFAULT_ATTRIBUTE = 'wil';

/**
 * Slugify a custom skill's display name into a dotted-path-safe key
 * fragment: lowercase, diacritics stripped, anything that isn't a-z0-9
 * collapsed to a single hyphen, leading/trailing hyphens trimmed. Dots are
 * never produced since `actor.update()` treats them as path separators.
 * @param {string} name
 * @returns {string}
 */
export function slugifySkillName(name) {
  return (name ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Derive a unique actor-scoped key for a new custom skill from its display
 * name. Always prefixed "custom-" so it can never collide with a built-in
 * (camelCase) skill key, now or after future system updates; suffixed
 * "-2", "-3", ... if it collides with an existing key on this actor.
 * @param {Iterable<string>} existingKeys  Keys already in use (built-in + actor's own).
 * @param {string} name  The skill's display name.
 * @returns {string}
 */
export function generateCustomSkillKey(existingKeys, name) {
  const used = new Set(existingKeys);
  const slug = slugifySkillName(name) || 'skill';
  const base = `custom-${slug}`;
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * The unified set of skill definitions available to an actor: every
 * built-in skill from CONFIG.TNO.skills (label pre-localized), plus any
 * custom skills the actor has defined for itself. Built-in skills always
 * win a key collision (impossible in practice given the "custom-" prefix,
 * but keeps this helper safe if that convention is ever broken).
 *
 * Every consumer (sheet prep, roll/advance handlers) should read skill
 * definitions through this helper rather than CONFIG.TNO.skills
 * directly, so custom skills behave identically to built-in ones.
 * @param {Actor} actor
 * @returns {Object<string, {label: string, category: string, attribute: string, starter: boolean, custom: boolean}>}
 */
export function getSkillDefinitions(actor) {
  const definitions = {};

  for (const [key, skill] of Object.entries(CONFIG.TNO.skills)) {
    definitions[key] = {
      label: game.i18n.localize(skill.label),
      category: skill.category,
      attribute: skill.attribute,
      starter: skill.starter ?? false,
      custom: false,
    };
  }

  const skills = actor?.system?.skills ?? {};
  for (const [key, entry] of Object.entries(skills)) {
    if (!entry?.custom || key in definitions) continue;
    const custom = entry.custom;
    definitions[key] = {
      label: typeof custom.label === 'string' && custom.label.trim() ? custom.label : key,
      category: custom.category in CONFIG.TNO.skillCategories ? custom.category : DEFAULT_CATEGORY,
      attribute: custom.attribute in CONFIG.TNO.abilities ? custom.attribute : DEFAULT_ATTRIBUTE,
      starter: false,
      custom: true,
    };
  }

  return definitions;
}

/**
 * The skill definition for a single key, or undefined if it names neither a
 * built-in nor a custom skill on this actor.
 * @param {Actor} actor
 * @param {string} key
 * @returns {{label: string, category: string, attribute: string, starter: boolean, custom: boolean}|undefined}
 */
export function getSkillDefinition(actor, key) {
  return getSkillDefinitions(actor)[key];
}
