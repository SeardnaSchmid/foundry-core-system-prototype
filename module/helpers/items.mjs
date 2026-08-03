/**
 * What an item *is*, expressed as roles rather than as a Foundry item type.
 *
 * The design decision this file exists to carry: there is one kind of gear, and
 * a piece of it optionally takes on **one** role — weapon, armour, or
 * consumable. A Foundry item type cannot express that, even though the roles
 * are exclusive the same way types are: a type is fixed at creation and can
 * never change, so an object entered as a plain item could never become a
 * weapon, and every item would have to be classified before it has a name.
 * A role is a value like any other and can be picked, corrected, or cleared.
 *
 * The types `armor` and `weapon` therefore stay registered but stop meaning
 * anything: documents authored under them still exist in published worlds, and
 * Foundry refuses to load a document whose type is gone. `itemRoles` reads the
 * old type as a role of last resort so such an item behaves correctly even
 * before the migration has touched it; everything else in the system asks for
 * roles and never for the type.
 *
 * Deliberately free of Foundry globals so it can be unit-tested without a game
 * world, and imported by `inventory.mjs`, which has the same rule.
 */

/**
 * The roles a piece of gear can take on, in the order the dialog's chips show
 * them.
 * @type {Array<string>}
 */
export const ITEM_ROLES = ['weapon', 'armor', 'consumable'];

/**
 * Item types that are physical gear, i.e. everything the role model and the
 * slot economy apply to. `feature` and `spell` are not objects at all.
 *
 * `armor` and `weapon` are legacy: nothing creates them any more, but worlds
 * published before the role model still hold them, and they are gear.
 * @type {Array<string>}
 */
export const GEAR_TYPES = ['item', 'armor', 'weapon'];

/**
 * Whether the authored profile describes a melee or ranged weapon.
 * @type {Array<string>}
 */
export const WEAPON_USES = ['melee', 'ranged'];

/** All primary attributes a weapon profile can author, in sheet order. */
export const WEAPON_ATTRIBUTES = [
  'str', 'dex', 'fin', 'per',
  'aut', 'cha', 'man', 'emp',
  'wil', 'int', 'wis', 'inv',
];

/**
 * The five distance bands a ranged weapon carries a modifier for, near to far.
 * A band left empty means the weapon cannot attack at that distance at all,
 * which is why the fields are nullable rather than defaulting to 0.
 * @type {Array<string>}
 */
export const RANGE_BANDS = ['sn', 'near', 'mid', 'far', 'sf'];

/** The only range modifiers the rules authorize; null means no attack. */
export const RANGE_MODIFIERS = [null, -3, 0, 3];

/**
 * Armour locations, in paperdoll order. `suit` is the Unterkleidung base
 * layer, which is not a hit location — it applies in all four at once — so it
 * leads the list and cannot be combined with any of them.
 * @type {Array<string>}
 */
export const ARMOR_ZONES = ['suit', 'head', 'torso', 'arms', 'legs'];

/**
 * The all-covering base layer, kept as a named constant because both the
 * exclusivity rule here and the paper doll's separate suit row key off it.
 * @type {string}
 */
export const ARMOR_SUIT_ZONE = 'suit';

/**
 * The bands the dialog renders as click-scales rather than as number inputs,
 * with the bounds each one runs between. A scale is a closed set of values the
 * rules enumerate, so a spinner that can be typed past the end of the table
 * would be lying about the range.
 * @type {Object<string, {min: number, max: number}>}
 */
export const SCALES = {
  slots: { min: 0, max: 4 },
  availability: { min: 1, max: 10 },
  dk: { min: 0, max: 6 },
  rd: { min: 1, max: 10 },
  rb: { min: 0, max: 10 },
  rh: { min: 1, max: 10 },
  rw: { min: 0, max: 6 },
  ra: { min: 1, max: 10 },
};

/**
 * Upper bound of Rüstungsabdeckung, i.e. what the coverage bar reads as full.
 * @type {number}
 */
export const RA_MAX = 10;

/**
 * Authoring bounds for numeric gear fields which have a rule-defined or
 * structural limit. Fields absent from this table are intentionally open-ended.
 */
export const GEAR_NUMBER_BOUNDS = {
  'system.quantity': { min: 0 },
  'system.slots': { min: 0, max: 4 },
  'system.sv': { min: 0 },
  'system.price': { min: 0 },
  'system.fv.rank': { min: 0 },
  'system.ammo.count': { min: 0 },
  'system.ss.count': { min: 0 },
  'system.ws.count': { min: 0 },
  'system.hh.active': { min: -3, max: 3 },
  'system.hh.passive': { min: -3, max: 3 },
  'system.rb': { min: 0 },
  'system.ra': { min: 1, max: RA_MAX },
};

/**
 * Clamp one authored numeric value when that field has declared bounds.
 * Empty values stay empty so nullable authoring fields remain distinguishable
 * from a real zero.
 * @param {string} field
 * @param {*} value
 * @returns {*}
 */
export function clampGearNumber(field, value) {
  if (value === '' || value === null || value === undefined) return value;
  const bounds = GEAR_NUMBER_BOUNDS[field];
  const number = Number(value);
  if (!bounds || !Number.isFinite(number)) return value;
  return Math.min(bounds.max ?? Infinity, Math.max(bounds.min ?? -Infinity, number));
}

/**
 * Which role a pre-role-model item type stood for.
 * @type {Object<string, string>}
 */
const LEGACY_TYPE_ROLES = { armor: 'armor', weapon: 'weapon' };

/**
 * The roles an item carries, as a flat `{weapon, armor, consumable}` of
 * booleans — the shape templates branch on.
 *
 * An item with no `system.roles` at all predates the role model, so its type
 * speaks for it. Once the key exists it is authoritative even when every role
 * in it is false: that is a player who turned the last chip off, not an
 * unmigrated document, and second-guessing them would make the chip unclickable.
 *
 * @param {Object} item  An item document (or plain object) with `.type` and `.system`.
 * @returns {Object<string, boolean>}
 */
export function itemRoles(item) {
  const stored = item?.system?.roles;
  const legacy = !stored ? LEGACY_TYPE_ROLES[item?.type] : null;

  const roles = {};
  for (const role of ITEM_ROLES) roles[role] = stored ? stored[role] === true : role === legacy;
  return roles;
}

/**
 * Pick one role, or clear the selection when the role that is already on is
 * picked again.
 *
 * The roles are **mutually exclusive**: a piece of gear is a weapon, or armour,
 * or a consumable, or none of those — never two at once. An item starts with no
 * role, which is what a plain object is, so "none" has to stay reachable and
 * clicking the active chip is the way back to it.
 *
 * Returns the whole `{weapon, armor, consumable}` object rather than a single
 * flag, so the caller writes `system.roles` in one update and cannot leave two
 * roles on by setting one before clearing the other.
 *
 * @param {Object<string, boolean>} roles  The roles as they are now.
 * @param {string} role  The role that was clicked.
 * @returns {Object<string, boolean>}
 */
export function selectRole(roles, role) {
  if (!ITEM_ROLES.includes(role)) return { ...itemRoles({ system: { roles } }) };
  const clearing = roles?.[role] === true;

  const next = {};
  for (const key of ITEM_ROLES) next[key] = !clearing && key === role;
  return next;
}

/**
 * Whether an item takes on one particular role.
 * @param {Object} item  An item document (or plain object).
 * @param {string} role  One of ITEM_ROLES.
 * @returns {boolean}
 */
export function hasRole(item, role) {
  return itemRoles(item)[role] === true;
}

/**
 * The single location a piece of armour covers, returned as a list for
 * consumers that iterate paper-doll targets.
 *
 * Empty for anything without the armour role, so callers can ask any item and
 * get a truthful answer instead of having to check the role first. A piece can
 * cover several locations at once — a coverall is one garment over torso, arms
 * and legs — which is why this is a list and not a single zone.
 *
 * @param {Object} item  An item document (or plain object).
 * @returns {Array<string>}
 */
export function armorZones(item) {
  if (!hasRole(item, 'armor')) return [];
  const zone = item?.system?.zone ?? item?.system?.zones?.find((candidate) => ARMOR_ZONES.includes(candidate));
  return ARMOR_ZONES.includes(zone) ? [zone] : [];
}

/**
 * Whether an item is physical gear rather than a feature or a spell.
 * @param {Object} item  An item document (or plain object).
 * @returns {boolean}
 */
export function isGear(item) {
  return GEAR_TYPES.includes(item?.type);
}

/**
 * A weapon's use, defaulting to melee for anything unset or unrecognised.
 * @param {Object} system  An item's `system` data.
 * @returns {string}  One of WEAPON_USES.
 */
export function weaponUse(system) {
  // Development builds briefly stored `both`; those were ranged profiles with
  // an extra DK and degrade safely to the authored ranged side.
  if (system?.use === 'both') return 'ranged';
  return WEAPON_USES.includes(system?.use) ? system.use : 'melee';
}

/**
 * The attribute a weapon check starts from. Older weapon documents did not
 * store one, so they retain the historic Strength default.
 * @param {Object} system An item's `system` data.
 * @returns {string}
 */
export function weaponAttribute(system) {
  return WEAPON_ATTRIBUTES.includes(system?.wa) ? system.wa : 'str';
}

/**
 * The compact, recognisable icon for a physical item in an inventory view.
 * Item artwork is useful on an item's own sheet, but a repeated role icon is
 * quicker to scan in the dense carry grid and flat inventory list.
 *
 * @param {Object} item An item document (or plain object).
 * @returns {string} A Font Awesome icon class without the style prefix.
 */
export function inventoryIcon(item) {
  const roles = itemRoles(item);
  if (roles.weapon) return weaponUse(item?.system) === 'ranged' ? 'fa-crosshairs' : 'fa-sword';
  if (roles.armor) return 'fa-shield-halved';
  if (roles.consumable) return 'fa-flask';
  return 'fa-cube';
}

/**
 * Whether the weapon's Distanzklasse applies, i.e. whether it is ever swung.
 * @param {Object} system  An item's `system` data.
 * @returns {boolean}
 */
export function usesMelee(system) {
  return weaponUse(system) === 'melee';
}

/**
 * Whether the weapon's range bands and ammunition apply.
 * @param {Object} system  An item's `system` data.
 * @returns {boolean}
 */
export function usesRanged(system) {
  return weaponUse(system) === 'ranged';
}

/** Cycle one range band through unavailable, penalty, neutral and bonus. */
export function cycleRangeModifier(value, direction = 1) {
  const current = value === '' || value === undefined ? null : value;
  const index = RANGE_MODIFIERS.findIndex((modifier) => modifier === current);
  const start = index < 0 ? 0 : index;
  return RANGE_MODIFIERS[(start + Math.sign(direction || 1) + RANGE_MODIFIERS.length) % RANGE_MODIFIERS.length];
}

/**
 * The cells of one click-scale, ready for the template.
 *
 * A value of `null` selects nothing, which is the point of the nullable
 * scales: not set and set to the lowest step are different answers, and only
 * one of them means "I have not filled this in yet". `Number(null)` is 0, so
 * the blank check has to come before the coercion.
 *
 * @param {string} key  A key of SCALES.
 * @param {*} value  The item's current value for that band.
 * @returns {Array<{value: number, selected: boolean}>}
 */
export function scaleCells(key, value) {
  const { min, max } = SCALES[key];
  const current = value === null || value === undefined || value === '' ? NaN : Number(value);

  const cells = [];
  for (let v = min; v <= max; v++) cells.push({ value: v, selected: v === current });
  return cells;
}

/**
 * Add or remove one armour zone, honouring the Unterkleidung's exclusivity:
 * the suit is worn under everything rather than over one location, so it can
 * never be combined with a hit location on the same piece.
 *
 * Returns a fresh array in ARMOR_ZONES order, so the stored value does not
 * depend on the order the player clicked the chips in.
 *
 * @param {string|null} current  The location currently selected.
 * @param {string} zone  The zone that was clicked.
 * @returns {Array<string>}
 */
export function toggleZone(current, zone) {
  if (!ARMOR_ZONES.includes(zone)) return ARMOR_ZONES.includes(current) ? current : null;
  return current === zone ? null : zone;
}

/**
 * What each required-field key is called, so the gear dialog's footer and the
 * view-mode card's warning banner name a missing value the same way.
 * @type {Object<string, string>}
 */
export const MISSING_FIELD_LABELS = {
  name: 'Name',
  slots: 'TNO.Inventory.Slots',
  fv: 'TNO.Item.Cap.Fv',
  wa: 'TNO.Weapons.Attribute',
  dk: 'TNO.Weapons.Dk',
  range: 'TNO.Weapons.Range',
  rd: 'TNO.Weapons.Rd',
  ss: 'TNO.Weapons.Ss',
  zone: 'TNO.Armor.Zone.Label',
  rh: 'TNO.Armor.Rh',
  ra: 'TNO.Armor.Ra',
  rb: 'TNO.Weapons.Rb',
  effects: 'TNO.Item.Effect',
};

/**
 * Which required fields are still blank, as field keys the dialog's footer
 * counts and its rows mark.
 *
 * Required means "the item cannot be used at the table without it", so the
 * list grows with the roles the piece has taken on and never includes a field
 * that is currently n/a. Nothing here blocks saving — the sheet writes through
 * on every change — it only says out loud what is still missing.
 *
 * @param {Object} item  An item document (or plain object) with `.name` and `.system`.
 * @returns {Array<string>}
 */
export function missingRequired(item) {
  const system = item?.system ?? {};
  const roles = itemRoles(item);
  const blank = (value) => value === null || value === undefined || value === '';

  const missing = [];
  if (!String(item?.name ?? '').trim()) missing.push('name');
  if (blank(system.slots)) missing.push('slots');

  if (roles.weapon) {
    if (blank(system.fv?.skill)) missing.push('fv');
    if (!WEAPON_ATTRIBUTES.includes(system.wa)) missing.push('wa');
    if (usesRanged(system) && blank(system.rd)) missing.push('rd');
    if (usesMelee(system) && blank(system.rb)) missing.push('rb');
    if (!Number(system.ss?.count)) missing.push('ss');
    // The Distanzklasse and the range bands are the same question asked of
    // the two uses, so only the one that currently applies is required.
    if (usesMelee(system) && blank(system.dk)) missing.push('dk');
    if (usesRanged(system) && RANGE_BANDS.every((band) => blank(system.range?.[band]))) {
      missing.push('range');
    }
  }

  if (roles.armor) {
    const zones = armorZones(item);
    if (!zones.length) missing.push('zone');
    // Underclothing never grants Armour Hardness, so RH is not a value the
    // suit is missing — it is one the suit does not have.
    if (blank(system.rh) && !zones.includes(ARMOR_SUIT_ZONE)) missing.push('rh');
    if (blank(system.ra)) missing.push('ra');
  }

  if (roles.consumable && !(system.consumableEffects ?? []).some((effect) => String(effect?.text ?? '').trim())) {
    missing.push('effects');
  }

  return missing;
}
