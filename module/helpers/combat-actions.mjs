import { ARMOR_ADDON_ZONES } from './inventory.mjs';
import {
  armorPenetrationChoices,
  canWeaponAttack,
  canWeaponParry,
  hasRole,
  isAuthoredNumber,
  usesMelee,
  weaponAttribute,
  weaponDkDifferenceChoices,
  weaponHandlingModifier,
  weaponRangeChoices,
  weaponRequirementStatus,
  weaponSkillRank,
} from './items.mjs';
import { DAMAGE_RULES, DEFAULT_ZONE, declarableManeuvers, maneuverSkill } from './maneuvers.mjs';
import { getSkillDefinition, getSkillDefinitions } from './skills.mjs';

/**
 * One builder per Handlung: each returns the `TnoRollDialog` options for a
 * combat roll, or `null` when the actor cannot form that roll at all.
 *
 * Why these live here rather than at their four call sites: every Manöver in the
 * Kampfregeln modifies a roll that already exists ("alles das läuft aber unter
 * Angriff"), so an Ansage has to be able to reach the same option object an
 * ordinary attack builds. With the assembly inlined in `documents/item.mjs`,
 * `documents/actor.mjs` and `sheets/actor-sheet.mjs`, there was no such place.
 *
 * None of these builders knows an opponent, and none of them may learn one. The
 * values a workflow cannot compute from its own sheet are asked for instead: the
 * reach comparison as a pick (both players can see who holds the longer weapon),
 * the announced Schadenswert as a typed number.
 */

/**
 * The malus on every defence after the first one between two activations:
 * "Jede weitere Parade oder jedes weitere Ausweichen ist erschwert um -10".
 *
 * Flat, not cumulative, and deliberately **not** a multiple of a Malusstufe —
 * the Manöverfertigkeit that relieves it does so a point at a time, and at rank
 * 10 "kann der Charakter beliebig viele Paraden ohne Malus durchführen", which
 * only works against a flat ten.
 * @type {number}
 */
export const REPEATED_DEFENSE_MALUS = -10;

/**
 * Which Manöverfertigkeit buys the repeated-defence malus back, and in which
 * Haltungen it is allowed to.
 *
 * The rulebook names 'Defensiver Kampf' in both entries; the second is a
 * copy-paste slip, since 'Deckung nutzen' is a skill of its own and its own
 * section is the one about repeated Ausweichen. Read literally, `useCover` would
 * do nothing at all.
 * @type {Object<string, {skill: string, stances: Array<string>}>}
 */
const DEFENSE_RELIEF = {
  parry: { skill: 'defensiveCombat', stances: ['simpleMove', 'enGarde'] },
  dodge: { skill: 'useCover', stances: ['carefulMove', 'inCover'] },
};

/**
 * The Haltung this actor is in, falling back to the one that permits nothing.
 * @param {Actor} actor
 * @returns {string}
 */
export function actorStance(actor) {
  // Read defensively: this runs inside `prepareDerivedData` for every actor in
  // the world, and a throw there takes the whole sheet down with it.
  const stances = CONFIG.TNO?.stances ?? {};
  const stance = actor?.system?.combat?.stance;
  return stance in stances ? stance : CONFIG.TNO?.defaultStance ?? 'open';
}

/**
 * Whether this actor's Haltung permits this defence at all.
 *
 * This is the value that makes the defence side of an exchange self-contained:
 * "Je nach Haltung hat der Charakter eine Parade, ein Ausweichen oder beides",
 * so the defender answers it from their own sheet and the attacker never asks.
 * @param {Actor} actor
 * @param {'parry'|'dodge'} defense
 * @returns {boolean}
 */
export function canDefend(actor, defense) {
  return (CONFIG.TNO?.stances?.[actorStance(actor)]?.defenses ?? []).includes(defense);
}

/**
 * What the next defence of this kind costs, given how many have already been
 * made since the Haltung was taken. Zero for the first one, and never positive.
 * @param {Actor} actor
 * @param {'parry'|'dodge'} defense
 * @returns {number}
 */
export function defenseMalus(actor, defense) {
  const used = Number(actor?.system?.combat?.defenses?.[defense]) || 0;
  if (used < 1) return 0;
  const relief = DEFENSE_RELIEF[defense];
  const rank = relief?.stances.includes(actorStance(actor))
    ? Number(actor?.system?.skills?.[relief.skill]?.value) || 0
    : 0;
  return Math.min(0, REPEATED_DEFENSE_MALUS + rank);
}

/**
 * A melee attack or parry needs the reach comparison; a ranged attack needs the
 * band it is fired at.
 * @param {Object} system  A weapon item's `system` data.
 * @returns {{label: string, placeholder: string, control: 'tiles', tileLabels: boolean, tileColumns: 2|5, choices: Array<Object>}}
 */
function weaponContext(system) {
  const melee = usesMelee(system);
  return {
    label: game.i18n.localize(melee ? 'TNO.Combat.DkDifference' : 'TNO.Combat.RangeBand'),
    placeholder: game.i18n.localize('TNO.Combat.ContextPlaceholder'),
    control: 'tiles',
    tileLabels: true,
    tileColumns: melee ? 2 : 5,
    choices: melee ? dkChoices() : rangeBandChoices(system),
  };
}

/**
 * The two reach outcomes, as pre-roll context tiles.
 *
 * Captioned with the question rather than left to the bare number: the tile
 * already shows `+3` or `0` as its value, and with only two outcomes a `0`
 * states what the roll gets without saying which weapon it is about.
 * @returns {Array<{key: string, label: string, value: number, componentLabel: string}>}
 */
function dkChoices() {
  return weaponDkDifferenceChoices().map((choice) => ({
    ...choice,
    label: game.i18n.localize(choice.value > 0 ? 'TNO.Combat.Reach.Longer' : 'TNO.Combat.Reach.NotLonger'),
    componentLabel: game.i18n.localize('TNO.Combat.DkDifference'),
  }));
}

/**
 * The authored range bands of a ranged weapon, as pre-roll context tiles.
 * @param {Object} system  A weapon item's `system` data.
 * @returns {Array<{key: string, label: string, value: number, componentLabel: string}>}
 */
function rangeBandChoices(system) {
  return weaponRangeChoices(system).map((choice) => {
    const band = game.i18n.localize(`TNO.Weapons.Band.${choice.key.charAt(0).toUpperCase()}${choice.key.slice(1)}`);
    return {
      ...choice,
      label: band,
      componentLabel: game.i18n.format('TNO.Combat.RangeComponent', { band }),
    };
  });
}

/**
 * Immutable handling and requirement components for weapon rolls.
 *
 * The SV malus is unconditional: "eine Malusstufe für jede Angriff/Parade mit
 * dieser Waffe", and a Manöver is an attack — "alles das läuft aber unter
 * Angriff" — so it applies whether or not anything is declared. It is labelled
 * with its Malusstufen, because the ladder is what lets it exceed the −3 the
 * dice system otherwise moves in.
 *
 * The FV malus is not: "würfelt er alle Manöver mit einem Malus", and a
 * Standardangriff is not a Manöver. It cannot be resolved here, because whether
 * this roll is a Manöver is decided in the dialog by what the player declares —
 * so it is handed over as a rule the Ansage block applies.
 * @param {Actor} actor
 * @param {Object} system              A weapon item's `system` data.
 * @param {'active'|'passive'} handling
 * @returns {Array<{label: string, value: number}>}
 */
function weaponFixedModifiers(actor, system, handling) {
  const { svSteps, svMalus } = weaponRequirementStatus(actor, system);

  return [
    {
      label: game.i18n.localize(handling === 'active' ? 'TNO.Combat.ActiveHandling' : 'TNO.Combat.PassiveHandling'),
      value: weaponHandlingModifier(system, handling),
    },
    ...(svSteps ? [{ label: game.i18n.format('TNO.Combat.SvMalus', { steps: svSteps }), value: svMalus }] : []),
  ];
}

/**
 * The FV shortfall, as the surcharge a *declared* Manöver carries.
 *
 * One flat step however far short the rank is, unlike the graded SV ladder, and
 * absent entirely from a Standardangriff.
 * @param {Actor} actor
 * @param {Object} system  A weapon item's `system` data.
 * @returns {{label: string, value: number}|null}
 */
function maneuverFvMalus(actor, system) {
  const { fvMalus } = weaponRequirementStatus(actor, system);
  if (!fvMalus) return null;
  return { label: game.i18n.localize('TNO.Combat.FvMalus'), value: fvMalus };
}

/**
 * The attacker's half of an exchange, as numbers the defender can act on.
 *
 * The three weapon values travel because the penetration comparison needs one
 * number from each side, and this is the direction that keeps the armour
 * private: the attacker reads their own weapon card out, and the defender —
 * who alone knows their RH — decides whether Scharfer or Wucht applies.
 * @param {Actor} actor
 * @param {Item} weapon
 * The Distanzklasse rides along as information only. It settles nothing on its
 * own — reach is a shared observation both players answer for themselves — but
 * it is the fact the defender needs to answer it, and reading it off the card
 * beats asking "wie lang ist das Ding nochmal" every exchange.
 * @returns {{from: string, dk: number|null, penetration: number|null, sharp: number|null, blunt: number|null}}
 */
function attackEnvelope(actor, weapon) {
  const authored = (value) => (isAuthoredNumber(value) ? Number(value) : null);
  const system = weapon.system;
  const melee = usesMelee(system);
  return {
    from: String(actor?.name ?? ''),
    // Only melee has a Distanzklasse; a ranged weapon's DK column is the five
    // range bands, which say nothing about reach in a melee.
    dk: melee ? authored(system?.dk) : null,
    penetration: authored(melee ? system?.rb : system?.rd),
    sharp: authored(system?.ss?.count),
    blunt: authored(system?.ws?.count),
  };
}

/**
 * Where a failed resistance roll lands, as a label: the attributes the Stelle
 * feeds and the multiple it applies.
 * @param {string} zone
 * @returns {string}
 */
function damageTargetLabel(zone) {
  const rule = DAMAGE_RULES[zone] ?? DAMAGE_RULES[DEFAULT_ZONE];
  const attributes = rule.attributes
    .map((key) => game.i18n.localize(CONFIG.TNO.abilities[key] ?? key))
    .join(' / ');
  return rule.multiplier > 1 ? `${attributes} ×${rule.multiplier}` : attributes;
}

/**
 * The Manöver declarable on this roll, resolved against the ranks this
 * character holds.
 * @param {Actor} actor
 * @param {Object} system  A weapon item's `system` data.
 * @param {'attack'|'parry'} on
 * @returns {Array<Object>}
 */
function ansageRows(actor, system, on) {
  const use = usesMelee(system) ? 'melee' : 'ranged';
  const definitions = getSkillDefinitions(actor);
  return declarableManeuvers(on, use).map(({ key, maneuver }) => {
    const skill = maneuverSkill(maneuver, use);
    const rank = Number(actor?.system?.skills?.[skill]?.value) || 0;
    return {
      key,
      label: game.i18n.localize(maneuver.label),
      effect: maneuver.effect,
      mode: typeof maneuver.betrag === 'number' ? 'fixed' : maneuver.betrag,
      betrag: typeof maneuver.betrag === 'number' ? maneuver.betrag : 0,
      rank,
      rankLabel: definitions[skill]?.label ?? skill,
      // A Manöver whose Fertigkeit the character has never bought. Still
      // declarable — "hättest du gar keinen Punkt … um 6" is the rulebook's own
      // example — but folded away, because otherwise every attack dialog lists
      // the whole chapter at a character who can use one line of it.
      untrained: rank < 1,
      requiresReach: maneuver.requiresReach === true,
      // Members of a group are chosen against one another rather than declared
      // on their own; the dialog renders them as one control.
      group: maneuver.group ?? '',
      ...(maneuver.zone ? { zone: maneuver.zone } : {}),
    };
  });
}

/**
 * Whether this actor may open a weapon roll with this item at all, and the
 * skill definition the roll is built on.
 * @param {Actor} actor
 * @param {Item} weapon
 * @param {(system: Object, options: Object) => boolean} canRoll
 * @returns {{key: string, definition: Object}|null}
 */
function weaponSkill(actor, weapon, canRoll) {
  const key = weapon?.system?.fv?.skill;
  const definition = actor ? getSkillDefinitions(actor)[key] : null;
  if (!actor?.isOwner || !hasRole(weapon, 'weapon')) return null;
  if (!canRoll(weapon.system, { skillDefined: !!definition })) return null;
  return { key, definition };
}

/**
 * A weapon attack: WA + the actor's current rank in the weapon's skill, its
 * active handling and SV malus, and the reach or range band as required context.
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {Object|null}
 */
export function angriffOptions(actor, weapon) {
  const resolved = weaponSkill(actor, weapon, canWeaponAttack);
  if (!resolved) return null;
  const { key, definition } = resolved;
  return {
    attributeA: weaponAttribute(weapon.system),
    lockAttribute: true,
    skill: { key, label: definition.label, value: weaponSkillRank(actor, weapon.system) },
    fixedModifiers: weaponFixedModifiers(actor, weapon.system, 'active'),
    preRollContext: weaponContext(weapon.system),
    ansagen: ansageRows(actor, weapon.system, 'attack'),
    maneuverMalus: maneuverFvMalus(actor, weapon.system),
    envelope: attackEnvelope(actor, weapon),
    flavor: game.i18n.format('TNO.Combat.AttackFlavor', { weapon: weapon.name }),
  };
}

/**
 * An independent melee parry: the same base as an attack with passive handling.
 *
 * It asks for the reach comparison exactly like an attack does — "Angriffe und
 * Paraden sind um +3 erleichtert wenn man den längeren hat" — because who holds
 * the longer weapon is a fact about the pairing, not about who is swinging.
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {Object|null}
 */
export function paradeOptions(actor, weapon) {
  const resolved = weaponSkill(actor, weapon, canWeaponParry);
  if (!resolved) return null;
  const { key, definition } = resolved;
  return {
    attributeA: weaponAttribute(weapon.system),
    lockAttribute: true,
    skill: { key, label: definition.label, value: weaponSkillRank(actor, weapon.system) },
    fixedModifiers: [...weaponFixedModifiers(actor, weapon.system, 'passive'), ...repeatedDefense(actor, 'parry')],
    preRollContext: {
      label: game.i18n.localize('TNO.Combat.DkDifference'),
      placeholder: game.i18n.localize('TNO.Combat.ContextPlaceholder'),
      control: 'tiles',
      tileLabels: true,
      tileColumns: 2,
      choices: dkChoices(),
    },
    ansagen: ansageRows(actor, weapon.system, 'parry'),
    maneuverMalus: maneuverFvMalus(actor, weapon.system),
    opposingAnsage: pendingAnsage(actor, 'parry'),
    afterRoll: async () => {
      await countDefense(actor, 'parry');
      await clearAnsage(actor);
    },
    flavor: game.i18n.format('TNO.Combat.ParryFlavor', { weapon: weapon.name }),
  };
}

/**
 * A dodge: Beweglichkeit + Akrobatik.
 *
 * The armour SV malus is deliberately absent here — the rule attaches it to the
 * attribute ("eine Malusstufe auf alle Beweglichkeitswürfe"), so the dialog adds
 * the step to whatever roll is currently built on Beweglichkeit, and a dodge is
 * only one of those.
 * @param {Actor} actor
 * @returns {Object|null}
 */
export function ausweichenOptions(actor) {
  const definition = actor ? getSkillDefinition(actor, 'acrobatics') : null;
  if (!definition || !canDefend(actor, 'dodge')) return null;
  return {
    attributeA: 'dex',
    lockAttribute: true,
    skill: {
      key: 'acrobatics',
      label: definition.label,
      value: actor.system.skills?.acrobatics?.value ?? 0,
    },
    fixedModifiers: repeatedDefense(actor, 'dodge'),
    opposingAnsage: pendingAnsage(actor, 'dodge'),
    afterRoll: async () => {
      await countDefense(actor, 'dodge');
      await clearAnsage(actor);
    },
    flavor: game.i18n.localize('TNO.Combat.Dodge'),
  };
}

/**
 * The repeated-defence malus as a threshold component, or nothing at all while
 * this is still the free first defence of the Haltung.
 * @param {Actor} actor
 * @param {'parry'|'dodge'} defense
 * @returns {Array<{label: string, value: number}>}
 */
function repeatedDefense(actor, defense) {
  const value = defenseMalus(actor, defense);
  if (!value) return [];
  const used = Number(actor?.system?.combat?.defenses?.[defense]) || 0;
  return [{ label: game.i18n.format('TNO.Combat.RepeatedDefense', { count: used + 1 }), value }];
}

/**
 * Count one made defence against the Haltung, which is what prices the next one.
 *
 * Parries and dodges are counted apart: "Ausweichen und Parieren werden hierfür
 * immer unabhängig verwendet."
 * @param {Actor} actor
 * @param {'parry'|'dodge'} defense
 * @returns {Promise<void>}
 */
export async function countDefense(actor, defense) {
  const used = Number(actor?.system?.combat?.defenses?.[defense]) || 0;
  await actor.update({ [`system.combat.defenses.${defense}`]: used + 1 });
}

/**
 * Store an announced Ansage on the defender's **own** sheet.
 *
 * This is the whole of Ü2, and it is deliberately a store rather than a direct
 * hand-off: the defender clicks a button on the attacker's card, and what that
 * writes lands on their own actor. Whichever defence they then open — from the
 * sheet, the weapon popover or the paper doll — picks it up. Nothing reaches
 * across, nothing is forced, and typing the number by hand instead keeps working
 * exactly as before.
 * @param {Actor} actor
 * @param {Object} envelope  `flags.tno.envelope` from an attack card.
 * @returns {Promise<void>}
 */
export async function takeAnsage(actor, envelope) {
  if (!actor?.isOwner || !envelope) return;
  await actor.update({
    'system.combat.pending': {
      from: String(envelope.from ?? ''),
      parry: Number(envelope.parry) || 0,
      dodge: Number(envelope.dodge) || 0,
      resistance: Number(envelope.resistance) || 0,
      zone: String(envelope.zone ?? ''),
      bypassArmor: envelope.bypassArmor === true,
    },
  });
}

/**
 * Forget the stored Ansage. Called once the defence it was meant for has been
 * rolled, so it can never silently apply to a second one.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function clearAnsage(actor) {
  if (!actor?.system?.combat?.pending?.from) return;
  await actor.update({
    'system.combat.pending': { from: '', parry: 0, dodge: 0, resistance: 0, zone: '', bypassArmor: false },
  });
}

/**
 * What was announced against a given defence, or `true` when nothing was — the
 * field is offered either way, because the card is a convenience and never a
 * precondition.
 * @param {Actor} actor
 * @param {'parry'|'dodge'|'resistance'} defense
 * @returns {number|true}
 */
function pendingAnsage(actor, defense) {
  const pending = actor?.system?.combat?.pending;
  if (!pending?.from) return true;
  return Number(pending[defense]) || true;
}

/**
 * Take a Haltung, which clears the defence counters: "Sobald der Charakter eine
 * neue Haltung, oder die selbe Haltung noch einmal, einnimmt, erlischt dieser
 * Malus." Taking the same one again is a real move, so this never short-circuits
 * on an unchanged value.
 * @param {Actor} actor
 * @param {string} stance
 * @returns {Promise<void>}
 */
export async function takeStance(actor, stance) {
  if (!(stance in (CONFIG.TNO?.stances ?? {}))) return;
  await actor.update({
    'system.combat.stance': stance,
    'system.combat.defenses': { parry: 0, dodge: 0 },
  });
}

/**
 * The resistance roll of one hit location: Stärke + RW(Stelle) − the damage
 * value the attacker announced, plus a Bonusstufe when the armour is harder than
 * what the weapon brings through it.
 *
 * The defender's sheet knows no attacker, and this deliberately does not try to
 * become one: it neither determines the hit location — the player states it by
 * clicking one — nor applies any damage. The two numbers it cannot know are
 * asked for: the Schadenswert as a typed value, the RH-versus-RB/RD comparison
 * as a choice.
 *
 * Stärke enters at its damage-adjusted `value`, not its trained `base`. The
 * `base` axis is for requirements ("did you train up to what this gear
 * demands"); resisting a blow is a statement about performance right now, the
 * same reading `derived.dodge` already takes.
 *
 * @param {Actor} actor
 * @param {string} zone  One of the four addon zones. The Unterkleidung is not a
 *   hit location — it applies in all four at once — and is refused.
 * @returns {Object|null}
 */
export function widerstandOptions(actor, zone) {
  if (!actor?.isOwner || !ARMOR_ADDON_ZONES.includes(zone)) return null;
  const armor = actor.system.derived?.armor?.[zone];
  if (!armor) return null;

  const zoneLabel = game.i18n.localize(CONFIG.TNO.armorZones[zone]);
  return {
    attributeA: 'str',
    lockAttribute: true,
    // Already summed over the Unterkleidung and this zone's addon by
    // `resolveArmor`, which is the value the paper doll shows.
    fixedModifiers: [
      { label: game.i18n.format('TNO.Combat.ResistanceRw', { zone: zoneLabel }), value: armor.rw },
    ],
    requiredValue: {
      label: game.i18n.localize('TNO.Combat.DamageValue'),
      componentLabel: game.i18n.localize('TNO.Combat.DamageValue'),
      sign: -1,
      min: 0,
    },
    preRollContext: {
      label: game.i18n.localize('TNO.Combat.Penetration.Label'),
      placeholder: game.i18n.localize('TNO.Combat.ContextPlaceholder'),
      control: 'tiles',
      tileLabels: true,
      tileColumns: 3,
      choices: armorPenetrationChoices().map((choice) => ({
        ...choice,
        label: game.i18n.localize(`TNO.Combat.Penetration.${choice.key.charAt(0).toUpperCase()}${choice.key.slice(1)}`),
        componentLabel: game.i18n.localize('TNO.Combat.Penetration.Label'),
      })),
    },
    opposingAnsage: pendingAnsage(actor, 'resistance'),
    afterRoll: () => clearAnsage(actor),
    // "Erschwere deinen Angriff um die Rüstungsabdeckung der jeweiligen Stelle
    // und ignoriere sie dafür": the attacker paid this location's RA to make its
    // armour not apply, so the padding comes back out of the threshold. They
    // paid a price the defender named, and the defender confirms the effect.
    ...(armor.rw
      ? {
          toggleModifier: {
            label: game.i18n.localize('TNO.Combat.Envelope.BypassArmor'),
            hint: game.i18n.localize('TNO.Combat.BypassArmorHint'),
            value: -armor.rw,
            // Pre-ticked when the attacker announced it, so the defender
            // confirms rather than remembers.
            checked: actor.system.combat?.pending?.bypassArmor === true,
          },
        }
      : {}),
    // The Stelle names where a failed roll lands, so the roll says so — on the
    // dialog and, through the flavor, on the card it posts. How *much* it costs
    // is still open: "Schaden in Höhe des verwendeten Schadenswert als Würfel"
    // never says which dice.
    flavor: game.i18n.format('TNO.Combat.ResistanceFlavor', {
      zone: zoneLabel,
      damage: damageTargetLabel(zone),
    }),
  };
}
