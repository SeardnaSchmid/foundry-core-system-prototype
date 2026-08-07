# Combat: derived values and roll workflows

**Status:** [Implemented](#implemented) · [Not implemented](#not-implemented) —
no prose status anywhere, see *Proof* below.
**Source of record:** the Kampfregeln page — *Waffen- und Rüstungswerte*,
*Abgeleitete Kampfwerte*, *Angriffswürfe*. On any disagreement that page wins.

**Language:** German is an *identifier*, English is *explanation*. Every term
that also exists as a field, key or label in the system keeps its German name,
so a term in this document can be grepped for in the code. Rule quotes stay
German because they are citations. Everything else is English.

**Proof:** every rule row cites the test that pins it down — spec file, an `›`,
and the test name, in one code span. `npm run docs:check` fails on a citation
whose test no longer exists, so these cannot rot into a lie the way a
hand-maintained status field does. The document therefore carries no per-rule
status of its own: the Proof column *is* the status.

An em dash in a Proof cell means nothing holds that rule in place. Which of the
two reasons applies is spelled out in [Not implemented](#not-implemented), which
indexes every em dash above and today reads "None." Nothing checks that pairing —
keep the two in step by hand when a dash appears or disappears.

## Glossary

The rule vocabulary resolved to code. Item paths are `item.system.*`, actor
paths `actor.system.*`.

| Rule term | Code | Meaning |
|---|---|---|
| Stärke | `abilities.str.{base,value}` | Strength; requirements compare `base` |
| Beweglichkeit | `abilities.dex.{base,value}` | Agility |
| Fingerfertigkeit | `abilities.fin.{base,value}` | Dexterity |
| Akrobatik | `skills.acrobatics.value` | Acrobatics |
| Raufen | `skills.brawling.value` | Brawling |
| **FV** Fertigkeitsvorraussetzung | `fv.skill`, `fv.rank` | which skill the weapon needs, at which rank |
| **SV** Stärkevorraussetzung | `sv` | Strength the weapon or armour piece needs |
| **WA** Waffenattribut | `wa` | the attribute this weapon rolls from |
| **DK** Distanzklasse | `dk` (melee), `range.{sn,near,mid,far,sf}` (ranged) | reach class 0–6 / the five range bands |
| **HH** Handhabung | `hh.active`, `hh.passive` | base modifier, attack / parry |
| **RB / RD** Rüstungsbrechung / -durchdringung | `rb` (melee), `rd` (ranged) | armour ignored up to this hardness |
| **SS / WS** Scharfer / Wucht Schadenswert | `ss.count`, `ws.count` | damage on a penetrating / non-penetrating hit |
| **RH** Rüstungshärte | `rh` | how hard the armour is to punch through |
| **RW** Rüstungswert | `rw` | padding; feeds the resistance value |
| **RA** Rüstungsabdeckung | `ra` | how well the location is covered |
| Stelle | `zone` | hit location: `head`, `torso`, `arms`, `legs` |
| Malusstufe | `MALUS_STEP` in `helpers/items.mjs` | `−3` |
| Bonusstufe | `BONUS_STEP` in `helpers/items.mjs` | `+3` |
| worn armour totals | `derived.armorSv`, `derived.armorSvPenalty`, `derived.armor.<zone>` | summed SV, whether it is unmet, per-location RH/RW/RA |

## Units

Every roll has a **threshold**: the number the counting die must land at or
under. Higher = easier. Everything below is a signed addend to that threshold —
never a roll of its own, never damage.

| Term | Value |
|---|---|
| **1 malus step** (Malusstufe) | `−3` to the threshold |
| **1 bonus step** (Bonusstufe) | `+3` to the threshold |
| **DK modifier** | `+3` longer weapon · `0` equal reach · `−3` shorter weapon |
| **HH** | authored per weapon, `−3 … +3`, any integer within — **not** a step |

## Derived combat values

All addends signed; maluses are negative numbers.

| Value | Threshold = | Proof |
|---|---|---|
| **Attack** (Angriffswert) | WA + weapon skill + HH (attack) + DK modifier + SV malus (weapon) | `tests/e2e/specs/combat-attack.spec.mjs › a weapon attack carries its requirement maluses from dialog to chat card` |
| **Parry** (Paradewert) | WA + weapon skill + HH (parry) + DK modifier + SV malus (weapon) | `tests/documents/item-weapon-roll.test.js › gives a parry passive handling, the same SV malus, and a reach choice` |
| **Dodge** (Ausweichenwert) | Beweglichkeit + Akrobatik + SV malus (armour) | `tests/documents/roll-dialog.test.js › adds the armour step the moment the chosen attribute becomes Beweglichkeit`<br>`tests/e2e/specs/combat-dodge.spec.mjs › a dodge is Beweglichkeit plus Akrobatik, less the armour step` |
| **Resistance** (Widerstandswert) | Stärke + RW(Stelle) − the weapon's SS or WS, `+3` when RH > RB/RD | `tests/documents/actor-resistance-roll.test.js › opens the resistance roll of the location that was clicked, with its armour value`<br>`tests/documents/actor-resistance-roll.test.js › reads Stärke at its damage-adjusted value, not its trained base` |

Resistance takes Stärke at its damage-adjusted `value`, not the `base` every
requirement compares against: `base` answers "did you train up to what this gear
demands", and resisting a blow is a statement about performance right now — the
same reading `derived.dodge` already takes.

HH and the DK modifier appear on the Parry row on the authority of the
Nahkampfwaffen table ("Basismodifikator für alle Angriffe / Paraden") and the DK
definition ("Angriffe und Paraden sind um +3 erleichtert wenn man den längeren
hat"); the Abgeleitete-Kampfwerte table omits both.

## Maluses

| Malus | Trigger | Steps | To the threshold | Applies to | Proof |
|---|---|---|---|---|---|
| **SV weapon** | base Stärke < SV | `ceil((SV − Stärke) / 2)`, uncapped | `steps × (−3)` | every attack / parry with this weapon | `tests/helpers/items.test.js › grades a shortfall one step per two points, rounded up`<br>`tests/documents/item-weapon-roll.test.js › sends the SV shortfall as one graded component` |
| **FV weapon** | skill rank < FV rank | 1, flat | `−3` | Manöver only — **not** a standard attack | `tests/helpers/items.test.js › reports FV and SV separately, and never grades FV`<br>`tests/documents/item-weapon-roll.test.js › keeps the FV shortfall out of a standard attack`<br>consumer: `tests/helpers/items.test.js › prices a weapon whose FV rank the character misses at one flat step`<br>`tests/documents/actor-maneuver-context.test.js › requires a Manöver to name the weapon it is declared with` |
| **SV armour** | base Stärke < Σ SV of everything worn | 1, flat | `−3` | every Beweglichkeit roll | `tests/helpers/inventory.test.js › sums the strength requirement over every worn piece`<br>`tests/helpers/items.test.js › costs one flat step on a Beweglichkeit roll and nothing on any other attribute`<br>`tests/documents/roll-dialog.test.js › sends the armour step into the breakdown, the roll components and the message flags` |

SV weapon, worked out:

| Shortfall (SV − Stärke) | 1 | 2 | 3 | 4 | 5 | 6 | … | 9 |
|---|---|---|---|---|---|---|---|---|
| Steps | 1 | 1 | 2 | 2 | 3 | 3 | | 5 |
| **To the threshold** | `−3` | `−3` | `−6` | `−6` | `−9` | `−9` | | `−15` |

SV and FV are separate requirements and their maluses add; exceeding a
requirement buys nothing. A melee weapon may be rolled with Raufen instead of
its authored skill, and then always carries the FV malus.

The armour SV attaches to the **attribute**, not to a workflow: any roll built
on Beweglichkeit takes the step, Dodge and a dex-attributed Manöver alike. Two
Beweglichkeit slots on one roll are still one step
(`tests/helpers/items.test.js › costs the same one step however many Beweglichkeit slots a roll fills`).
Where both requirements meet — a dex Manöver declared with a weapon whose FV is
missed — they stay two components:
`tests/documents/roll-dialog.test.js › adds the armour step and the weapon FV step separately, never as one`.

## The attack roll

| # | Who | Rolls against | Attack ends on |
|---|---|---|---|
| 1 | Attacker | Attack value | failure |
| 2 | Defender, if their Haltung allows a defence | Dodge **or** Parry value (Parry is melee-only) | success |
| 3 | Defender | Resistance value | success |

If 3 fails, the target takes the applicable damage value in dice:

| | RH < RB/RD | RH = RB/RD | RH > RB/RD |
|---|---|---|---|
| Damage value | SS (Scharfer) | WS (Wucht) | WS (Wucht) |
| Resistance roll | — | — | `+3` (1 bonus step) |

## Implemented

Five independent checks. No targets, no combatant state, no hand-off between
them.

| Workflow | Fixed components | Required context | Proof |
|---|---|---|---|
| **Attack** | WA + the actor's current FV-skill rank · HH active · SV malus | melee: DK modifier `+3 / 0 / −3` · ranged: one authored range band (each authored `−3 … +3`) | `tests/documents/item-weapon-roll.test.js › offers a melee attack the three reach outcomes as its required context`<br>`tests/helpers/items.test.js › offers only authored ranged bands and preserves their modifiers` |
| **Parry** (melee) | WA + the actor's current FV-skill rank · HH passive · SV malus | DK modifier `+3 / 0 / −3` | `tests/documents/item-weapon-roll.test.js › gives a parry passive handling, the same SV malus, and a reach choice` |
| **Dodge** | Beweglichkeit + Akrobatik · armour SV malus | — | `tests/e2e/specs/combat-dodge.spec.mjs › a dodge is Beweglichkeit plus Akrobatik, less the armour step` |
| **Resistance** | Stärke (locked) · RW(Stelle) | the penetration comparison `softer / equal / harder` **and** the announced Schadenswert, typed | `tests/documents/actor-resistance-roll.test.js › requires both the announced damage and the penetration comparison`<br>`tests/documents/roll-dialog.test.js › refuses to roll until the announced value is entered` |
| **Manöver** | attribute + skill rank · armour SV malus when the attribute is Beweglichkeit | the weapon it is declared with, and that weapon's FV shortfall | `tests/documents/actor-maneuver-context.test.js › requires a Manöver to name the weapon it is declared with`<br>`tests/documents/actor-maneuver-context.test.js › keeps the weapon choice answerable by a character carrying nothing` |

The FV rank authored on a weapon is a requirement only; what is *added* is the
character's current rank. SV comparisons use **base** Strength. All five keep
the situational modifier (`±3` steps), the advantage/disadvantage picker and the
Idea option; the chosen context is a signed immutable component in the
threshold, the chat breakdown and the message flags. An announced value is the
one component deliberately outside the situational `±30` clamp — that clamp
bounds what a GM hands out, not a number the table has already agreed on
(`tests/documents/roll-dialog.test.js › leaves the announced value outside the situational modifier clamp`).

Resistance determines **neither** the hit location nor any damage: the player
states the location by clicking it on the paper doll and the Schadenswert by
typing it. Both remain [Deferred](#deferred).

## Not implemented

Every em dash in a Proof cell, and what it is waiting for. **State** is the
difference that matters: `no code` means the rule does not exist in the system,
`no test` means it does and nothing is stopping it from silently breaking.

**None.** Every rule above cites a test.

Not the same as [Deferred](#deferred): a row here would be **in scope, specified
above, and owed**. Deferred means the rules exist but this document does not
cover them.

## Deferred

Targets, combatant state, Initiative, Haltungen, Bindung, repeated defence
(`−10`, **not** a multiple of a step), action economy, **Ansagen, and what a
Manöver actually *does*** — declaring one and paying its FV malus is
[Implemented](#implemented); the effects each of the thirteen produces are not —
armour resolution, hit location, damage application, ammunition, readying,
chat-card follow-up chains.

Hit location and damage application stay deferred **although the resistance roll
is not**: nothing in the system determines either. The player states the
location by clicking it and the damage value by typing it, which is the same
division the DK and range pickers already work on.

## Open

1. **Does a Manöver also carry the weapon's SV malus?** The rule scopes SV to
   "jeden Angriff/Parade mit dieser Waffe", and a Manöver is neither. Not
   applied today.
2. **Should the announced Schadenswert persist between resistance rolls on the
   same actor**, the way `skills.<key>.lastAttribute` does?
