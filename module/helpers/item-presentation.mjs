import { armorZones, itemRoles, RANGE_BANDS, weaponAttribute, weaponUse } from './items.mjs';
import { itemSlotCost, wornItemIds } from './inventory.mjs';
import { TNO } from './config.mjs';

const PENETRATION_MIN_RH = 0;
const PENETRATION_MAX_RH = 10;
const SLOT_PREVIEW_LIMIT = 10;

const numberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const present = (value) => value !== '' && value !== null && value !== undefined;

/**
 * Build the compact, role-aware facts shared by carry-cell tooltips and the
 * actor-sheet item popover. The helper deliberately returns localization keys
 * instead of translated strings so it stays usable in plain unit tests and
 * free of Foundry globals.
 *
 * A stat value is normally display-ready. The two values which need runtime
 * context remain structured: armour zones are localization keys, while an FV
 * carries the skill key which the owning actor resolves (including custom
 * skills).
 *
 * @param {Object} item  An item document or plain item-shaped object.
 * @returns {{badges: string[], stats: Array<{labelKey: string, value: *}>}}
 */
export function buildGearSummary(item) {
  const system = item?.system ?? {};
  const roles = itemRoles(item);
  const use = weaponUse(system);
  const badges = Object.entries(TNO.itemRoles)
    .filter(([role]) => roles[role])
    .map(([, labelKey]) => labelKey);
  if (!badges.length) badges.push('TNO.Item.Role.Plain');
  if (roles.weapon) badges.push(TNO.weaponUses[use]);

  const stats = [];
  if (!item?.isWorn) {
    stats.push({ labelKey: 'TNO.Inventory.Slots', value: itemSlotCost(item) });
  }

  const quantity = Math.max(0, numberOrNull(system.quantity) ?? 1);
  if (roles.consumable) {
    stats.push({ labelKey: 'TNO.Item.Summary.Stock', value: `×${quantity}` });
  } else if (quantity > 1) {
    stats.push({ labelKey: 'TNO.Inventory.Quantity', value: `×${quantity}` });
  }

  if (roles.weapon) {
    stats.push({ labelKey: 'TNO.Weapons.Attribute', value: [TNO.abilities[weaponAttribute(system)]] });
    const skillKey = String(system.fv?.skill ?? '').trim();
    const customSkill = item?.actor?.system?.skills?.[skillKey]?.custom;
    if (skillKey && (skillKey in TNO.skills || customSkill)) {
      stats.push({
        labelKey: 'TNO.Item.Cap.Fv',
        value: { skillKey, rank: Number(system.fv?.rank) || 0 },
      });
    }
    if (use === 'melee' && present(system.dk)) {
      stats.push({ labelKey: 'TNO.Item.Summary.Dk', value: Number(system.dk) });
    }
    const penetration = use === 'ranged' ? 'rd' : 'rb';
    if (present(system[penetration])) {
      stats.push({
        labelKey: penetration === 'rd' ? 'TNO.Weapons.RdShort' : 'TNO.Weapons.Rb',
        value: Number(system[penetration]),
      });
    }
    for (const [key, labelKey] of [['ss', 'TNO.Weapons.Ss'], ['ws', 'TNO.Weapons.Ws']]) {
      const count = numberOrNull(system[key]?.count);
      if (count !== null && count > 0) stats.push({ labelKey, value: `${count}W` });
    }
    const active = numberOrNull(system.hh?.active);
    const passive = numberOrNull(system.hh?.passive);
    if (active !== null || (use === 'melee' && passive !== null)) {
      const values = use === 'melee' ? [active, passive] : [active];
      stats.push({
        labelKey: 'TNO.Item.Summary.Hh',
        value: values.map((value) => value ?? '—').join(' / '),
      });
    }
    if (use === 'ranged') {
      const count = Math.max(0, numberOrNull(system.ammo?.count) ?? 0);
      const type = String(system.ammo?.type ?? '').trim();
      stats.push({
        labelKey: 'TNO.Weapons.Magazine',
        value: `${count}${type ? ` ${type}` : ''}`,
      });
    }
  }

  if (roles.armor) {
    const zones = armorZones(item);
    if (zones.length) {
      stats.push({
        labelKey: 'TNO.Armor.Zone.Label',
        value: zones.map((zone) => TNO.armorZones[zone]),
      });
    }
    const suit = zones.includes('suit');
    if (suit || present(system.rh)) {
      stats.push({ labelKey: 'TNO.Armor.RhShort', value: suit ? '—' : Number(system.rh) });
    }
    if (present(system.rw)) {
      stats.push({ labelKey: 'TNO.Armor.RwShort', value: Number(system.rw) });
    }
    if (present(system.ra)) {
      stats.push({ labelKey: 'TNO.Armor.RaShort', value: `${Number(system.ra)} / 10` });
    }
  }

  if (present(system.sv) && Number(system.sv) !== 0) {
    stats.push({ labelKey: 'TNO.Item.Cap.Sv', value: Number(system.sv) });
  }

  return { badges, stats };
}

/** Present a damage pair without deciding which combat branch applies. */
export function damagePresentation(damage) {
  const count = Math.max(0, numberOrNull(damage?.count) ?? 0);
  return { count, label: `${count}W` };
}

/** Build the signed five-band shape used by a ranged weapon overview. */
export function buildRangeProfile(system) {
  const values = RANGE_BANDS.map((band) => numberOrNull(system?.range?.[band]));
  const maxMagnitude = Math.max(1, ...values.filter((value) => value !== null).map(Math.abs));

  return RANGE_BANDS.map((band, index) => {
    const value = values[index];
    const state = value === null ? 'unavailable' : value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
    return {
      band,
      value,
      state,
      available: value !== null,
      height: value === null ? 0 : Math.round((Math.abs(value) / maxMagnitude) * 32),
    };
  });
}

/**
 * Divide the RH domain around RD without inventing the unresolved damage rule.
 * Consumers may show the comparison and both damage values, but must not label
 * a segment as SS/WS until the combat PRD defines equality and overflow.
 */
export function buildPenetrationProfile(system) {
  const key = weaponUse(system) === 'ranged' ? 'rd' : 'rb';
  const raw = numberOrNull(system?.[key]);
  const minimum = key === 'rd' ? 1 : 0;
  const value = raw === null ? null : Math.min(PENETRATION_MAX_RH, Math.max(minimum, raw));
  if (value === null) return { key, value: null, segments: [], ss: damagePresentation(system?.ss), ws: damagePresentation(system?.ws) };

  const segments = [
    { key: 'below', from: PENETRATION_MIN_RH, to: value - 1, size: value, single: false },
    { key: 'equal', from: value, to: value, size: 1, single: true },
    { key: 'above', from: value + 1, to: PENETRATION_MAX_RH, size: PENETRATION_MAX_RH - value, single: false },
  ].filter((segment) => segment.from <= segment.to);

  return { key, value, segments, ss: damagePresentation(system?.ss), ws: damagePresentation(system?.ws) };
}

/** Show one stack's footprint and, when embedded, its owner's current budget. */
export function buildSlotPresentation(item, actor) {
  const cost = Math.max(0, itemSlotCost(item));
  const capacity = numberOrNull(actor?.system?.derived?.carrySlots);
  const used = numberOrNull(actor?.system?.derived?.carrySlotsUsed);
  const shown = Math.min(SLOT_PREVIEW_LIMIT, Math.ceil(cost));
  return {
    unit: Math.max(0, numberOrNull(item?.system?.slots) ?? 0),
    quantity: Math.max(0, numberOrNull(item?.system?.quantity) ?? 1),
    cost,
    cells: Array.from({ length: shown }, (_, index) => ({ index, filled: index < cost })),
    hidden: Math.max(0, Math.ceil(cost) - shown),
    contextual: capacity !== null && used !== null,
    capacity,
    used,
    remaining: capacity === null || used === null ? null : capacity - used,
    state: actor?.system?.derived?.carryState ?? null,
  };
}

/** Compare an item's Strength requirement with its owning character. */
export function buildStrengthPresentation(item, actor) {
  const required = Math.max(0, numberOrNull(item?.system?.sv) ?? 0);
  const actual = numberOrNull(actor?.system?.abilities?.str?.base);
  return {
    required,
    actual,
    contextual: actual !== null,
    met: actual === null || required === 0 ? null : actual >= required,
  };
}

/** State that belongs to the actor/item relationship rather than item data. */
export function buildOwnershipPresentation(item, actor) {
  if (!actor) return { embedded: false, state: null };
  const id = item?._id ?? item?.id;
  const worn = wornItemIds(actor.system?.equipment).has(id);
  return {
    embedded: true,
    state: worn ? 'worn' : 'carried',
  };
}

/** One stable, template-ready view model for both overview and interactions. */
export function buildGearPresentation(item, actor) {
  const system = item?.system ?? {};
  return {
    roles: itemRoles(item),
    use: weaponUse(system),
    zones: armorZones(item),
    range: buildRangeProfile(system),
    penetration: buildPenetrationProfile(system),
    slots: buildSlotPresentation(item, actor),
    strength: buildStrengthPresentation(item, actor),
    ownership: buildOwnershipPresentation(item, actor),
  };
}
