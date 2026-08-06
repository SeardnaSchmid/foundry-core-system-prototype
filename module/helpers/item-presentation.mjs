import {
  ARMOR_SUIT_ZONE,
  RANGE_BANDS,
  WEAPON_ATTRIBUTES,
  armorZones,
  itemRoles,
  missingRequired,
  weaponAttribute,
  weaponUse,
} from './items.mjs';
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

/** Write a modifier the way a player reads it: with its sign, always. */
const signed = (value) => (value > 0 ? `+${value}` : String(value));

/**
 * Build the compact, role-aware view of one piece of gear — what the item
 * popover, the chat card and the carry-cell tooltips all show.
 *
 * The shape is the view mode's layout rather than a flat stat list, because
 * the card is read in three passes and each one has its own grammar:
 *
 * - **badges** say what the thing is,
 * - **probe** carries the two fixed components a weapon check starts from,
 * - **tiles** are the handful of numbers with a rules table behind them, one
 *   glance each, and
 * - **rows** are everything that needs a sentence.
 *
 * Which numbers are tiles is decided per role, and the count is deliberately
 * stable within a role so a shelf of cards lines up. A tile a role cannot fill
 * is not dropped: it stays as an `na` tile, so switching a weapon from melee to
 * ranged does not change the card's height. A tile a role *requires* and the
 * item has not got is a `missing` tile, which is the same list `missingRequired`
 * counts, so the tile and the warning banner can never disagree.
 *
 * Price and availability never appear here. They are facts about buying the
 * thing, not about using it, and the view mode is what is on the table.
 *
 * The helper returns localization keys rather than translated strings so it
 * stays free of Foundry globals and unit-testable; the two values that need
 * runtime context stay structured, an FV carrying the skill key the owning
 * actor resolves (custom skills included).
 *
 * @param {Object} item  An item document or plain item-shaped object.
 * @returns {{badges: Array, probe: ?Object, tiles: Array, rows: Array, missing: string[]}}
 */
export function buildGearSummary(item) {
  const system = item?.system ?? {};
  const roles = itemRoles(item);
  const use = weaponUse(system);
  const zones = armorZones(item);
  const missing = missingRequired(item);
  const quantity = Math.max(0, numberOrNull(system.quantity) ?? 1);

  const roleKey = Object.entries(TNO.itemRoles).find(([role]) => roles[role])?.[1];
  const badges = [{
    key: 'role',
    state: 'role',
    join: ' · ',
    labelKeys: roleKey
      ? [roleKey, ...(roles.weapon ? [TNO.weaponUses[use]] : [])]
      : ['TNO.Item.Role.Plain'],
  }];
  if (zones.length) {
    badges.push({
      key: 'zone',
      state: 'zone',
      join: ': ',
      labelKeys: ['TNO.Armor.Zone.Label', TNO.armorZones[zones[0]]],
    });
  }

  // The two components an Angriffswurf is built from, shown together because
  // neither is meaningful alone and the roll dialog fixes both.
  const skillKey = String(system.fv?.skill ?? '').trim();
  const probe = roles.weapon
    ? {
        attribute: {
          labelKey: 'TNO.Item.Summary.WeaponAttribute',
          valueKey: WEAPON_ATTRIBUTES.includes(system.wa) ? TNO.abilities[weaponAttribute(system)] : null,
        },
        fv: {
          labelKey: 'TNO.Item.Summary.SkillRequirement',
          value: skillKey ? { skillKey, rank: Number(system.fv?.rank) || 0 } : null,
        },
      }
    : null;

  const na = (key, labelKey) => ({ key, labelKey, value: null, state: 'na' });
  const tile = (key, labelKey, value, format = String) => {
    if (missing.includes(key)) return { key, labelKey, value: null, state: 'missing' };
    const number = numberOrNull(value);
    return number === null
      ? na(key, labelKey)
      : { key, labelKey, value: format(number), state: 'value' };
  };

  const tiles = [];
  if (roles.weapon && use === 'melee') {
    tiles.push(
      tile('dk', 'TNO.Item.Summary.Dk', system.dk),
      tile('rb', 'TNO.Weapons.Rb', system.rb),
      tile('ss', 'TNO.Weapons.Ss', system.ss?.count),
      tile('ws', 'TNO.Weapons.Ws', system.ws?.count),
    );
  } else if (roles.weapon) {
    tiles.push(
      tile('rd', 'TNO.Weapons.RdShort', system.rd),
      tile('ss', 'TNO.Weapons.Ss', system.ss?.count),
      tile('ws', 'TNO.Weapons.Ws', system.ws?.count),
      tile('hh', 'TNO.Item.Summary.HhActive', system.hh?.active, signed),
    );
  } else if (roles.armor) {
    tiles.push(
      // A suit's hardness is the fixed 0 of the Rüstungstabelle — a real value
      // the RD comparison uses — while its coverage does not exist at all.
      zones.includes(ARMOR_SUIT_ZONE)
        ? tile('rh', 'TNO.Armor.RhShort', 0)
        : tile('rh', 'TNO.Armor.RhShort', system.rh),
      tile('rw', 'TNO.Armor.RwShort', system.rw),
      zones.includes(ARMOR_SUIT_ZONE)
        ? na('ra', 'TNO.Armor.RaShort')
        : tile('ra', 'TNO.Armor.RaShort', system.ra),
    );
  } else if (roles.consumable) {
    // Stock is the only number a consumable has, so it takes the emphasis the
    // role values get on every other card.
    tiles.push(
      { key: 'stock', labelKey: 'TNO.Item.Summary.Stock', value: String(quantity), state: 'primary' },
      tile('slots', 'TNO.Inventory.Slots', itemSlotCost(item)),
    );
  } else {
    tiles.push(
      tile('slots', 'TNO.Inventory.Slots', itemSlotCost(item)),
      quantity > 1
        ? { key: 'quantity', labelKey: 'TNO.Inventory.Quantity', value: `×${quantity}`, state: 'value' }
        : na('quantity', 'TNO.Item.Summary.QuantityFrom2'),
    );
  }

  const rows = [];
  if (roles.weapon && use === 'melee') {
    const active = numberOrNull(system.hh?.active);
    const passive = numberOrNull(system.hh?.passive);
    if (active !== null || passive !== null) {
      rows.push({
        key: 'hh',
        labelKey: 'TNO.Weapons.Hh',
        parts: [
          { labelKey: 'TNO.Item.Summary.HhAttack', value: active === null ? '—' : signed(active) },
          { labelKey: 'TNO.Item.Summary.HhParry', value: passive === null ? '—' : signed(passive) },
        ],
      });
    }
  }
  // Weapons and armour spend their tiles on combat values, so the two carry
  // facts move down here rather than disappearing from the card.
  if ((roles.weapon || roles.armor) && quantity > 1) {
    rows.push({ key: 'quantity', labelKey: 'TNO.Inventory.Quantity', value: `×${quantity}` });
  }
  if ((roles.weapon || roles.armor) && !item?.isWorn) {
    rows.push({ key: 'slots', labelKey: 'TNO.Inventory.Slots', value: itemSlotCost(item) });
  }

  const required = Math.max(0, numberOrNull(system.sv) ?? 0);
  if (required > 0) {
    // The shortfall is plain arithmetic against the owner's Strength. How many
    // penalty steps it costs is combat resolution and is not decided here.
    //
    // Armour carries no note at all: its SV is one addend in the sum of
    // everything worn, so comparing this piece's share against Strength on its
    // own would report "met" for a glove that pushes the body's total out of
    // reach. The comparison that matters is on the paper doll, against
    // `derived.armorSv`.
    const actual = roles.armor ? null : numberOrNull(item?.actor?.system?.abilities?.str?.base);
    rows.push({
      key: 'sv',
      labelKey: 'TNO.Item.Cap.Sv',
      value: required,
      note: actual === null
        ? null
        : actual >= required
          ? { labelKey: 'TNO.Item.Overview.RequirementMet', state: 'ok' }
          : { labelKey: 'TNO.Item.Summary.RequirementShort', params: { delta: actual - required }, state: 'warning' },
    });
  }

  return { badges, probe, tiles, rows, missing };
}

/**
 * Present a damage pair without deciding which combat branch applies.
 *
 * SS and WS are plain values on a 0..N scale, not counts of dice — there is no
 * unit to append, and a "W" suffix said there was one.
 */
export function damagePresentation(damage) {
  const count = Math.max(0, numberOrNull(damage?.count) ?? 0);
  return { count, label: String(count) };
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
