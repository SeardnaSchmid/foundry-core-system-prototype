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
import { isStashed, itemSlotCost, wornItemIds } from './inventory.mjs';
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
 * popover and the chat card show.
 *
 * The shape follows the card's reading order:
 *
 * - **typeLine** and **slots** say what the thing is and what it costs to carry,
 * - **tiles** are the handful of numbers with a rules table behind them, one
 *   glance each,
 * - **probe** carries the two fixed components a weapon check starts from, and
 * - **rows** are everything else that needs a label.
 *
 * Which numbers are tiles is decided per role. A required tile the item has not
 * got is a `missing` tile, which is the same list `missingRequired` counts, so
 * the tile and the warning banner can never disagree. A value a rule rules out
 * (the RA of underclothing) has no tile at all. Consumables and plain items
 * carry no tiles: a consumable's one number is its stock, which the card shows
 * as its own stepper row.
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
 * @returns {{typeLine: Object, slots: number, quantity: number, probe: ?Object, tiles: Array, rows: Array, missing: string[]}}
 */
export function buildGearSummary(item) {
  const system = item?.system ?? {};
  const roles = itemRoles(item);
  const use = weaponUse(system);
  const zones = armorZones(item);
  const missing = missingRequired(item);
  const quantity = Math.max(0, numberOrNull(system.quantity) ?? 1);

  // The two components an Angriffswurf is built from, shown together because
  // neither is meaningful alone and the roll dialog fixes both.
  const skillKey = String(system.fv?.skill ?? '').trim();
  const probe = roles.weapon
    ? {
        attribute: {
          labelKey: 'TNO.Item.Summary.Attribute',
          valueKey: WEAPON_ATTRIBUTES.includes(system.wa) ? TNO.abilities[weaponAttribute(system)] : null,
        },
        fv: {
          labelKey: 'TNO.Item.Summary.Skill',
          value: skillKey ? { skillKey, rank: Number(system.fv?.rank) || 0 } : null,
        },
      }
    : null;

  const na = (key, labelKey, titleKey) => ({ key, labelKey, titleKey, value: null, state: 'na' });
  const tile = (key, labelKey, titleKey, value, format = String) => {
    if (missing.includes(key)) return { key, labelKey, titleKey, value: null, state: 'missing' };
    const number = numberOrNull(value);
    return number === null
      ? na(key, labelKey, titleKey)
      : { key, labelKey, titleKey, value: format(number), state: 'value' };
  };

  const tiles = [];
  if (roles.weapon) {
    if (use === 'melee') tiles.push(tile('dk', 'TNO.Item.Summary.Dk', 'TNO.Weapons.Dk', system.dk));
    tiles.push(
      tile('rb', 'TNO.Weapons.Rb', 'TNO.Weapons.RbHint', system.rb),
      tile('ss', 'TNO.Weapons.Ss', 'TNO.Weapons.SsHint', system.ss?.count),
      tile('ws', 'TNO.Weapons.Ws', 'TNO.Weapons.WsHint', system.ws?.count),
    );
    // Melee handling modifies attack and parry, so the tile states both; a
    // ranged weapon has no parry and states the attack modifier alone.
    const active = numberOrNull(system.hh?.active);
    const passive = numberOrNull(system.hh?.passive);
    if (use === 'melee') {
      tiles.push(active === null && passive === null
        ? na('hh', 'TNO.Item.Summary.Hh', 'TNO.Weapons.HhHint')
        : {
            key: 'hh',
            labelKey: 'TNO.Item.Summary.Hh',
            titleKey: 'TNO.Weapons.HhHint',
            value: `${active === null ? '—' : signed(active)} / ${passive === null ? '—' : signed(passive)}`,
            state: 'value',
            wide: true,
          });
    } else {
      tiles.push(tile('hh', 'TNO.Item.Summary.Hh', 'TNO.Weapons.HhHint', system.hh?.active, signed));
    }
  } else if (roles.armor) {
    const suit = zones.includes(ARMOR_SUIT_ZONE);
    tiles.push(
      // SV leads the read-out: it is what the piece costs to wear, and it is
      // read before the values it buys. `decimal` marks it as the one tile that
      // comes in quarter steps and therefore wants the reader's own separator —
      // the localizer, not this global-free builder, applies it.
      { ...tile('sv', 'TNO.Item.Cap.Sv', 'TNO.Armor.Sv', system.sv, Number), decimal: true },
      // A suit's hardness is the fixed 0 of the Rüstungstabelle — a real value
      // the RD comparison uses — while its coverage does not exist at all.
      tile('rh', 'TNO.Armor.RhShort', 'TNO.Armor.Rh', suit ? 0 : system.rh),
      tile('rw', 'TNO.Armor.RwShort', 'TNO.Armor.Rw', system.rw),
    );
    if (!suit) tiles.push(tile('ra', 'TNO.Armor.RaShort', 'TNO.Armor.Ra', system.ra));
  }

  // Armour states its SV as a tile beside the values it buys, and carries no
  // comparison at all: its SV is one addend in the sum of everything worn, so
  // measuring this piece's share against Strength on its own would report
  // "met" for a glove that pushes the body's total out of reach. The
  // comparison that matters is on the paper doll, against `derived.armorSv`.
  const rows = [];
  const required = roles.armor ? 0 : Math.max(0, numberOrNull(system.sv) ?? 0);
  if (required > 0) {
    // The shortfall is plain arithmetic against the owner's Strength. How many
    // penalty steps it costs is combat resolution and is not decided here.
    const actual = numberOrNull(item?.actor?.system?.abilities?.str?.base);
    rows.push({
      key: 'sv',
      labelKey: 'TNO.Item.Overview.Requirement',
      prefixKey: 'TNO.Item.Cap.Sv',
      value: required,
      note: actual === null
        ? null
        : actual >= required
          ? { labelKey: 'TNO.Item.Overview.RequirementMet', state: 'ok' }
          : { labelKey: 'TNO.Item.Summary.RequirementShort', params: { delta: actual - required }, state: 'warning' },
    });
  }

  return { typeLine: itemTypeLine(item), slots: itemSlotCost(item), quantity, probe, tiles, rows, missing };
}

/**
 * Present a damage pair without deciding which combat branch applies.
 *
 * S and WS are plain values on a 0..N scale, not counts of dice — there is no
 * unit to append, and a "W" suffix said there was one.
 */
/**
 * What kind of thing an item is, as the two localization keys that name it:
 * the role, and the one qualifier that role brings.
 *
 * Keys rather than text, like everything else in this module — the caller joins
 * them through `TNO.Item.TypeLine`, which is where a language that wants a
 * different word order or separator states it.
 *
 * The role leads and the qualifier follows because the qualifier alone never
 * said what it was qualifying: a line reading only `Kopf` or `Nah` names a
 * detail of a category it leaves the reader to infer. Every item resolves to
 * something here, including one carrying no role at all.
 *
 * Role precedence matches the gear sheet's: `setItemRole` writes one role at a
 * time, so an item holding two is a hand-edited document rather than anything
 * the UI can produce, and armour wins as it does elsewhere.
 * @param {Item|object} item
 * @returns {{roleKey: string, detailKey: string|null}}
 */
export function itemTypeLine(item) {
  const roles = itemRoles(item);
  if (roles.armor) {
    const [zone] = armorZones(item);
    return { roleKey: 'TNO.Item.Role.Armor', detailKey: zone ? TNO.armorZones[zone] ?? null : null };
  }
  if (roles.weapon) {
    return { roleKey: 'TNO.Item.Role.Weapon', detailKey: TNO.weaponUses[weaponUse(item?.system)] ?? null };
  }
  if (roles.consumable) return { roleKey: 'TNO.Item.Role.Consumable', detailKey: null };
  return { roleKey: 'TNO.Item.Role.Plain', detailKey: null };
}

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
 * Divide the RH domain around RB. This presentation helper keeps the graph to
 * authored weapon numbers; the resistance workflow owns the resulting damage
 * pool and RW interaction.
 */
export function buildPenetrationProfile(system) {
  const key = 'rb';
  const raw = numberOrNull(system?.rb);
  const value = raw === null ? null : Math.min(PENETRATION_MAX_RH, Math.max(0, raw));
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
    state: worn ? 'worn' : isStashed(item) ? 'stashed' : 'carried',
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
