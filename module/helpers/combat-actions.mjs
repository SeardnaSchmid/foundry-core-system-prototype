import { ARMOR_ADDON_ZONES } from './inventory.mjs';
import {
  ARMOR_SUIT_ZONE,
  armorPenetrationChoices,
  canWeaponAttack,
  canWeaponParry,
  hasRole,
  inventoryArt,
  isAuthoredNumber,
  usesMelee,
  weaponAttribute,
  weaponDkDifferenceChoices,
  weaponHandlingModifier,
  weaponRangeChoices,
  weaponRequirementStatus,
  weaponSkillRank,
  MALUS_STEP,
  resolveArmorInteraction,
} from './items.mjs';
import { DAMAGE_RULES, DEFAULT_ZONE, ZONE_CHOICES, appliedDamage, zoneCost } from './maneuvers.mjs';
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
 * Which Manöverfertigkeit buys the repeated-defence malus back, and in which
 * Haltungen it is allowed to.
 *
 * Keyed by the pair, not by the defence: Ausweichen now has two relief skills
 * and which one applies is decided by the Haltung. No (defence, Haltung) pair is
 * claimed twice, so the first match is the only match.
 *
 * The rulebook names 'Defensiver Kampf' in the 'Deckung nutzen' and 'Haken
 * schlagen' sections too; both are copy-paste slips, since each is a skill of
 * its own and its own section is the one about repeated Ausweichen. Read
 * literally, neither would do anything at all.
 * @type {Array<{defense: 'parry'|'dodge', skill: string, stances: Array<string>}>}
 */
const DEFENSE_RELIEF = [
  { defense: 'parry', skill: 'defensiveCombat', stances: ['simpleMove', 'enGarde'] },
  { defense: 'dodge', skill: 'useCover', stances: ['carefulMove', 'inCover'] },
  { defense: 'dodge', skill: 'evasiveMove', stances: ['simpleMove', 'fastMove'] },
];

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
 * The i18n key naming this actor's Haltung, for surfaces that only need to say
 * which one it is. Read through here rather than from `CONFIG` at the call
 * site, so the defensive lookup stays in one place with `actorStance()`.
 * @param {Actor} actor
 * @returns {string|null}
 */
export function stanceLabelKey(actor) {
  return CONFIG.TNO?.stances?.[actorStance(actor)]?.label ?? null;
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
 *
 * "Jede weitere Parade oder jedes weitere Ausweichen ist erschwert um eine, sich
 * aufsummierende, Stufe (-3)" — so the price is the count of defences already
 * made, times a Malusstufe.
 *
 * The relief skill then *skips* repeats rather than shifting the ladder: each
 * rank point "reduziert diesen Malus einmal", and the rulebook's own worked
 * examples put a rank-1 character at full / full / −6 for three defences, not
 * full / full / −3. So a rank buys the first `rank` repeats outright and the
 * ones past it still cost what their position says.
 * @param {Actor} actor
 * @param {'parry'|'dodge'} defense
 * @returns {number}
 */
export function defenseMalus(actor, defense) {
  const used = Number(actor?.system?.combat?.defenses?.[defense]) || 0;
  if (used < 1) return 0;
  const stance = actorStance(actor);
  const relief = DEFENSE_RELIEF.find(
    (entry) => entry.defense === defense && entry.stances.includes(stance)
  );
  const rank = relief ? Number(actor?.system?.skills?.[relief.skill]?.value) || 0 : 0;
  return used <= rank ? 0 : MALUS_STEP * used;
}

/**
 * A melee attack or parry needs the reach comparison; a ranged attack needs the
 * band it is fired at.
 * @param {Object} system  A weapon item's `system` data.
 * @returns {{label: string, placeholder: string, control: 'toggle'|'tiles', tileColumns: 2|5, choices: Array<Object>}}
 */
function weaponContext(system) {
  const melee = usesMelee(system);
  return {
    label: game.i18n.localize(melee ? 'TNO.Combat.DkQuestion' : 'TNO.Combat.RangeQuestion'),
    placeholder: game.i18n.localize('TNO.Combat.ContextPlaceholder'),
    control: melee ? 'toggle' : 'tiles',
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
  const active = handling === 'active';

  return [
    {
      label: game.i18n.localize(active ? 'TNO.Combat.ActiveHandling' : 'TNO.Combat.PassiveHandling'),
      value: weaponHandlingModifier(system, handling),
      hint: game.i18n.localize(active ? 'TNO.Combat.ActiveHandlingHint' : 'TNO.Combat.PassiveHandlingHint'),
    },
    ...(svSteps
      ? [{
          label: game.i18n.format('TNO.Combat.SvMalus', { steps: svSteps }),
          value: svMalus,
          hint: game.i18n.localize('TNO.Combat.SvMalusHint'),
        }]
      : []),
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
  return {
    label: game.i18n.localize('TNO.Combat.FvMalus'),
    value: fvMalus,
    hint: game.i18n.localize('TNO.Combat.FvMalusHint'),
  };
}

/**
 * The attacker's half of an exchange, as numbers the defender can act on.
 *
 * The three weapon values travel because the penetration comparison needs one
 * number from each side, and this is the direction that keeps the armour
 * private: the attacker reads their own weapon card out, and the defender —
 * who alone knows their RH — decides whether Schaden or Wucht applies.
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
 * What a failed resistance roll does to the selected damage pool: Stelle keeps
 * only its multiplier now that damage no longer routes into attributes.
 * @param {string} zone
 * @returns {string}
 */
function damageTargetLabel(zone) {
  const rule = DAMAGE_RULES[zone] ?? DAMAGE_RULES[DEFAULT_ZONE];
  const pool = game.i18n.localize('TNO.Damage.Pool');
  return rule.multiplier > 1 ? `${pool} ×${rule.multiplier}` : pool;
}

/**
 * What a failed resistance roll costs, as the one sentence the card owes the
 * defender: how much goes into which pool.
 *
 * Both halves are already on the roll, and neither is legible as it stands
 * there. The pool is the penetration tile's consequence rather than its wording
 * ("hält · Wuchtschaden"), the amount is the Schadenswert — recorded in the
 * breakdown *negated*, because there it is a threshold component — and the
 * Stelle's multiplier is named on the flavor line as a rule with no number
 * attached. The player was left to multiply a sign-flipped figure by a
 * multiplier printed three lines above it.
 *
 * Nothing is written to either pool from here. Damage entry stays manual and
 * deliberately so — the card states, the owner enters — so this is a read-out,
 * and the sheet's own stepper remains the only writer.
 *
 * @param {string} zone        The Stelle that was resisted at.
 * @param {string} contextKey  The penetration comparison that was picked.
 * @param {number|null} value  The announced Schadenswert, as typed.
 * @returns {{label: string, text: string, note: string, hint: string}|null}
 */
function resistanceConsequence(zone, contextKey, value, bypass = false) {
  const interaction = resolveArmorInteraction(contextKey, { bypass });
  // Both halves or nothing: `null` is the unanswered field, and reading it
  // through `Number()` would turn it into a confidently applied zero.
  if (!interaction || !isAuthoredNumber(value)) return null;

  const sharp = interaction.damage === 'ss';
  const { base, multiplier, total } = appliedDamage(value, zone);
  return {
    label: game.i18n.localize('TNO.Combat.Applied'),
    text: game.i18n.format('TNO.Combat.AppliedAmount', {
      amount: total,
      pool: game.i18n.localize(sharp ? 'TNO.Damage.Sharp' : 'TNO.Damage.Blunt'),
      tag: game.i18n.localize(sharp ? 'TNO.Damage.TagSharp' : 'TNO.Damage.TagBlunt'),
    }),
    // Only the Kopf carries one, and only then is the arithmetic worth showing:
    // ×1 spelled out would make the plain case look like it had a rule on it.
    note: multiplier > 1
      ? game.i18n.format('TNO.Combat.AppliedMultiplier', {
          base,
          multiplier,
          zone: game.i18n.localize(CONFIG.TNO.armorZones[zone]),
        })
      : '',
    hint: game.i18n.localize('TNO.Combat.AppliedHint'),
  };
}

/**
 * The Ansage field: one free magnitude, and nothing about why.
 *
 * "Eine Ansage erschwert einen deiner Würfe um einen anderen zu erleichtern
 * (oder einen gegnerischen Wurf zu erschweren)" — that is the whole mechanic,
 * and it is symmetric, so what the player types is both what this roll pays and
 * what the other side takes.
 *
 * Nothing here prices, caps, or gates it. Which Manöver it is, whether its
 * Fertigkeit is high enough to buy it 1:1, whether the reach advantage the
 * Starke Angriffe need is actually there — all of that is settled between the
 * player and the GM before the number is typed, and a form that re-litigated it
 * would only be able to disagree with the table.
 * @returns {{label: string, hint: string}}
 */
function ansageField() {
  return {
    label: game.i18n.localize('TNO.Combat.Ansage'),
    hint: game.i18n.localize('TNO.Combat.AnsageHint'),
  };
}

/**
 * The Stelle, as tiles carrying both halves of the bargain: what aiming there
 * costs you, and what it buys.
 *
 * This is the one declaration that stayed a pick rather than becoming part of
 * the free number, because it is not only a magnitude: it decides the damage
 * multiplier, and the defender opens that roll by clicking the same location
 * on their paper doll.
 *
 * It does have a magnitude too — Gezielte Angriffe prices every location — and
 * putting the price on the tile beside the damage rule is what makes the choice
 * legible: "Kopf", "−6" and "Schadenspool ×2" are one decision seen from three
 * ends. The tile is the only place the dialog still explains a Manöver, and this
 * is the Manöver worth explaining.
 * @returns {{label: string, choices: Array<{key: string, label: string, caption: string, cost: number}>}}
 */
function zonePicker() {
  return {
    label: game.i18n.localize('TNO.Combat.ZoneQuestion'),
    componentLabel: game.i18n.localize('TNO.Combat.Zone'),
    choices: ZONE_CHOICES.map((zone) => ({
      key: zone,
      label: game.i18n.localize(CONFIG.TNO.armorZones[zone]),
      caption: damageTargetLabel(zone),
      cost: zoneCost(zone),
    })),
  };
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
    // The same width the resistance roll asks for: a picker now sits inside a
    // ledger row beside its Δ column, and the class default of 340 was picked
    // for a dialog whose pickers still had the full width to themselves.
    width: 400,
    skill: { key, label: definition.label, value: weaponSkillRank(actor, weapon.system) },
    fixedModifiers: weaponFixedModifiers(actor, weapon.system, 'active'),
    preRollContext: weaponContext(weapon.system),
    zonePicker: zonePicker(),
    ansage: ansageField(),
    maneuverMalus: maneuverFvMalus(actor, weapon.system),
    envelope: attackEnvelope(actor, weapon),
    // The card says which weapon swung; the picture is the fastest read of that
    // in a scrolling log. Nothing downstream resolves it — it is the item's own
    // `img` string, passed through.
    img: weapon.img,
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
    // The same width the resistance roll asks for: a picker now sits inside a
    // ledger row beside its Δ column, and the class default of 340 was picked
    // for a dialog whose pickers still had the full width to themselves.
    width: 400,
    skill: { key, label: definition.label, value: weaponSkillRank(actor, weapon.system) },
    fixedModifiers: [...weaponFixedModifiers(actor, weapon.system, 'passive'), ...repeatedDefense(actor, 'parry')],
    preRollContext: {
      label: game.i18n.localize('TNO.Combat.DkQuestion'),
      placeholder: game.i18n.localize('TNO.Combat.ContextPlaceholder'),
      control: 'toggle',
        tileColumns: 2,
      choices: dkChoices(),
    },
    // A parry declares an amount but never a Stelle: the location is the
    // attacker's to name, and a Riposte — the one Manöver the rules put on a
    // parry — lands on your own next attack rather than anywhere on a body.
    ansage: ansageField(),
    maneuverMalus: maneuverFvMalus(actor, weapon.system),
    opposingAnsage: true,
    afterRoll: async () => {
      await countDefense(actor, 'parry');
    },
    img: weapon.img,
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
    opposingAnsage: true,
    afterRoll: async () => {
      await countDefense(actor, 'dodge');
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
  return [{
    label: game.i18n.format('TNO.Combat.RepeatedDefense', { count: used + 1 }),
    value,
    hint: game.i18n.localize('TNO.Combat.RepeatedDefenseHint'),
  }];
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
 * The picture a resistance roll carries: what is actually taking the hit.
 *
 * The armour worn at the struck location first, the Unterkleidung second, and
 * no picture at all third. That order is the same one `resolveArmor` sums the
 * RW in, so the icon and the modifier line agree about which piece the roll is
 * about.
 *
 * It is a chain of *icons*, not of pieces: a helmet that was never given art
 * falls through to the suit's, because the suit is padding that location too.
 * Only when neither has a picture does the card go bare — a placeholder here
 * would claim armour where the sheet may be showing none.
 *
 * `resolveArmor` deliberately keeps live documents out of `system.derived`, so
 * the pieces are looked up from `system.equipment` here, as its own doc block
 * says callers must.
 * @param {Actor} actor
 * @param {string} zone  One of the four addon zones.
 * @returns {string} An image path, or '' for no picture.
 */
function wornArmorArt(actor, zone) {
  const equipment = actor?.system?.equipment ?? {};
  for (const key of [zone, ARMOR_SUIT_ZONE]) {
    const piece = actor?.items?.get?.(equipment[key]);
    const img = piece ? inventoryArt(piece).img : null;
    if (img) return img;
  }
  return '';
}

/**
 * The resistance roll of one hit location: Stärke + the RW that survives the
 * armour interaction − the damage value the attacker announced. Penetration or
 * an announced bypass removes RW; neither awards a separate bonus step.
 *
 * The defender's sheet knows no attacker, and this deliberately does not try to
 * become one: it neither determines the hit location — the player states it by
 * clicking one — nor applies any damage. The two numbers it cannot know are
 * asked for: the Schadenswert as a typed value, the RH-versus-RB/RD comparison
 * as a choice.
 *
 * Stärke enters at its sole persisted `base` rating, the same reading
 * `derived.dodge` and regular attribute rolls use.
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
    // As on the attack and parry: a picker sitting in a ledger row next to the
    // Δ column needs more than the class default of 340.
    width: 400,
    // Already summed over the Unterkleidung and this zone's addon by
    // `resolveArmor`, which is the value the paper doll shows.
    fixedModifiers: [
      {
        label: game.i18n.format('TNO.Combat.ResistanceRw', { zone: zoneLabel }),
        value: armor.rw,
        hint: game.i18n.format('TNO.Combat.ResistanceRwHint', { zone: zoneLabel }),
      },
    ],
    // The attacker's card prints two damage values, Schaden and Wuchtschaden,
    // and the comparison above decides which landed. So this field is named by
    // that pick rather than left as a bare "Schadenswert" the player has to map
    // back to the right column of the card themselves.
    //
    // Every one of those names leads with the Angreifer, the way the comparison
    // line above it does ("Angreifer RB/RD"): this is the one row in the ledger
    // asking for a figure that is not the defender's own, and a bare
    // "Wucht (WS)" sitting between their RW and their Modifikation did not say
    // so. `componentLabel` stays the neutral noun — the breakdown and the chat
    // card are already the attacker's half by the time they print it.
    requiredValue: {
      label: game.i18n.localize('TNO.Combat.DamageValueField'),
      componentLabel: game.i18n.localize('TNO.Combat.DamageValue'),
      labels: Object.fromEntries(
        armorPenetrationChoices().map((choice) => [
          choice.key,
          game.i18n.localize(choice.damage === 'ss' ? 'TNO.Combat.DamageSharp' : 'TNO.Combat.DamageBlunt'),
        ])
      ),
      // Rüstung umgehen makes the comparison's ordinary damage pool
      // irrelevant: without armour, the hit always uses Schaden.
      toggleLabel: game.i18n.localize('TNO.Combat.DamageSharp'),
      // No placeholder: the hint directly under this row already says where the
      // number is read off, in full, and a 3rem field only ever clipped it.
      hint: game.i18n.localize('TNO.Combat.DamageValueHint'),
      sign: -1,
      min: 0,
    },
    // The one comparison the defender's sheet cannot make on its own, asked in
    // the only terms it *can* state: it knows this location's RH and says so, so
    // the player answers about the single unknown — where the weapon's
    // Rüstungsbrechung or -durchdringung sat against that number. Each tile then
    // spells out what its answer does, because "weicher · S" said neither whose
    // armour was meant nor what followed from it, and the +3 on the third looked
    // arbitrary.
    //
    // Laid out as a table: the three answers as a ladder, the defender's own RH
    // beside them as a readout, and the number they were told last. The RH is
    // the `anchor` rather than part of the question, because a value the reader
    // has to hold in their head while choosing against it is a value they will
    // choose against wrong.
    //
    // Both abbreviations are named. The rules table writes RB/RD throughout —
    // Rüstungsbrechung in melee, -durchdringung at range — and the defender is
    // told a number without being told which weapon produced it.
    preRollContext: {
      label: game.i18n.localize('TNO.Combat.Penetration.Label'),
      placeholder: game.i18n.localize('TNO.Combat.Penetration.Placeholder'),
      control: 'tiles',
        tileColumns: 1,
      anchor: {
        label: game.i18n.localize('TNO.Combat.Penetration.Anchor'),
        value: armor.rh,
      },
      choices: armorPenetrationChoices().map((choice) => {
        const suffix = `${choice.key.charAt(0).toUpperCase()}${choice.key.slice(1)}`;
        return {
          ...choice,
          // RW is visible as a fixed component above. Penetration cancels that
          // exact amount here, while equality and harder armour retain it.
          value: choice.ignoresRw ? -armor.rw : choice.value,
          // The separate Rüstung-umgehen toggle would buy the same result and
          // must neither double-subtract RW nor pretend there is another effect.
          suppressesToggleModifier: choice.ignoresRw,
          headline: game.i18n.format(`TNO.Combat.Penetration.${suffix}`, { rh: armor.rh }),
          label: game.i18n.localize(`TNO.Combat.Penetration.${suffix}Effect`),
          componentLabel: game.i18n.format('TNO.Combat.Penetration.Component', { rh: armor.rh }),
        };
      }),
    },
    opposingAnsage: true,
    // "Erschwere deinen Angriff um die Rüstungsabdeckung der jeweiligen Stelle
    // und ignoriere sie dafür": the attacker paid this location's RA to make its
    // armour not apply, so the padding comes back out of the threshold.
    //
    // Entirely the defender's own control, and never pre-ticked. The attack card
    // has no way to say a bypass was bought — it carries an amount, not a reason
    // — so this is the defender acting on what they were told, which is how the
    // rule was always meant to work: they name the RA, the attacker pays it.
    ...(armor.rw
      ? {
          toggleModifier: {
            label: game.i18n.localize('TNO.Combat.Envelope.BypassArmor'),
            hint: game.i18n.localize('TNO.Combat.BypassArmorHint'),
            value: -armor.rw,
          },
        }
      : {}),
    // The two answers above are also the two halves of the damage: which pool,
    // and how much of it. Stated on the card, because a roll the player has to
    // do arithmetic on afterwards is a roll they will get wrong at the table.
    consequence: ({ contextKey, value, toggleModifier }) => resistanceConsequence(
      zone,
      contextKey,
      value,
      toggleModifier
    ),
    // The Stelle keeps only its multiplier. The resolved armour interaction
    // names whether the announced value enters Schaden or Wuchtschaden.
    img: wornArmorArt(actor, zone),
    flavor: game.i18n.format('TNO.Combat.ResistanceFlavor', {
      zone: zoneLabel,
      damage: damageTargetLabel(zone),
    }),
  };
}
