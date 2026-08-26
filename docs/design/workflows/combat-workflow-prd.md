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
indexes every em dash above and today reads "None." Nothing checks that pairing
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
| **DK modifier** | `+3` longer weapon · `0` otherwise |
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

That same sentence is the whole DK rule, and it grants `+3` to the longer weapon
while saying nothing at all about the shorter one. Holding the shorter weapon and
holding an equally long one therefore roll identically, which makes reach **two**
outcomes rather than three and puts the two sides three apart, not six. The
modifier is a shared observation: both players can see who holds the longer
weapon and each answers it on their own sheet, so neither workflow reads the
other's.

## Maluses

| Malus | Trigger | Steps | To the threshold | Applies to | Proof |
|---|---|---|---|---|---|
| **SV weapon** | base Stärke < SV | `ceil((SV − Stärke) / 2)`, uncapped | `steps × (−3)` | every attack / parry with this weapon | `tests/helpers/items.test.js › grades a shortfall one step per two points, rounded up`<br>`tests/documents/item-weapon-roll.test.js › sends the SV shortfall as one graded component` |
| **FV weapon** | skill rank < FV rank | 1, flat | `−3` | Manöver only — **not** a standard attack | `tests/helpers/items.test.js › reports FV and SV separately, and never grades FV`<br>`tests/documents/item-weapon-roll.test.js › keeps the FV shortfall out of a standard attack`<br>consumer: `tests/documents/roll-dialog.test.js › leaves a standard attack free of the FV malus and charges a declared one` |
| **SV armour** | base Stärke < Σ SV of everything worn | 1, flat | `−3` | every Beweglichkeit roll | `tests/helpers/inventory.test.js › sums the strength requirement over every worn piece`<br>`tests/helpers/items.test.js › costs one flat step on a Beweglichkeit roll and nothing on any other attribute`<br>`tests/documents/roll-dialog.test.js › sends the armour step into the breakdown, the roll components and the message flags` |

SV weapon, worked out:

| Shortfall (SV − Stärke) | 1 | 2 | 3 | 4 | 5 | 6 | … | 9 |
|---|---|---|---|---|---|---|---|---|
| Steps | 1 | 1 | 2 | 2 | 3 | 3 | | 5 |
| **To the threshold** | `−3` | `−3` | `−6` | `−6` | `−9` | `−9` | | `−15` |

SV and FV are separate requirements and their maluses add; exceeding a
requirement buys nothing. A melee weapon may be rolled with Raufen instead of
its authored skill, and then always carries the FV malus.

Whether an attack is a Manöver — and so whether the FV malus applies at all — is
decided **in the dialog, by what the player declares**. An attack with no Ansage
on it is a Standardangriff and takes no FV step; the first declaration turns the
same roll into a Manöver and the step appears. The SV malus does not move with
it: "jede Angriff/Parade mit dieser Waffe" covers both, because a Manöver is an
attack ("alles das läuft aber unter Angriff").

The armour SV attaches to the **attribute**, not to a workflow: any roll built
on Beweglichkeit takes the step, Dodge and a dex-attributed roll alike. Two
Beweglichkeit slots on one roll are still one step
(`tests/helpers/items.test.js › costs the same one step however many Beweglichkeit slots a roll fills`).
Where both requirements meet — a dex roll declaring a Manöver with a weapon whose
FV is missed — they stay two components:
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

The comparison needs one number from each side, and the direction it runs in is
what keeps the armour private: **the attacker reads their weapon card out** —
RB/RD, Scharf, Wucht — and the defender, who alone knows their RH, picks.

### Where damage lands

Fully determined by the Stelle, which is why an attack announces the location
and never the rule
(`tests/helpers/maneuvers.test.js › puts an unannounced hit on Stärke, which is the attribute that kills`).
The resistance roll names it on the dialog and on the card it posts
(`tests/documents/actor-resistance-roll.test.js › names the attributes a failed roll lands on, per Stelle`).

| Stelle | Attribute | At zero |
|---|---|---|
| **Torso** *(default)* | Stärke | dead |
| **Kopf** | Stärke, **×2** after the resistance roll | dead |
| **Arme** | Fingerfertigkeit (½ up) · Stärke (½ down) | no hand actions |
| **Beine** | Beweglichkeit (½ up) · Stärke (½ down) | crawl only |

A Standardangriff therefore kills, and the Ansage is the way *not* to — which is
what Gezielter Stich promises in as many words: "jemandem in die Brust zu
schießen ist zwar gut um ihn zu töten, aber was, wenn du jemanden nur entwaffnen
oder an der Flucht hindern willst"
(`tests/helpers/maneuvers.test.js › splits an arm hit over Fingerfertigkeit and Stärke, in that order`).

**How much** damage lands is still open, and deliberately unbuilt: a failed
resistance roll costs "Schaden in Höhe des verwendeten Schadenswert **als
Würfel**", and which dice those are is written nowhere. The Stelle can therefore
say where a hit lands and at what multiple, but nothing can turn it into a
number — so nothing tries.

`Rüstung umgehen` cancels the Stelle's RW on the resistance roll, confirmed by
the defender rather than assumed
(`tests/documents/actor-resistance-roll.test.js › cancels the location padding when the attacker bypassed its armour`).

## Implemented

Four independent checks and the Haltung that gates two of them. No targets, no
hand-off: **no sheet ever reads another sheet.** Every value is one of three
things, and the kind decides how it is asked for.

| Kind | Source | Input |
|---|---|---|
| **Own state** | your own sheet | read, never asked |
| **Shared observation** | the fiction; both sides see it and each enters it | a pick |
| **Announced result** | the other side computed it and says the number | a typed field |

The reach comparison is the first kind of shared observation, the announced
Schadenswert the first announced result. Anything that fits none of the three
would be real coupling.

| Workflow | Fixed components | Required context | Proof |
|---|---|---|---|
| **Attack** | WA + the actor's current FV-skill rank · HH active · SV malus | melee: DK modifier `+3 / 0` · ranged: one authored range band (each authored `−3 … +3`) | `tests/documents/item-weapon-roll.test.js › offers a melee attack the two reach outcomes as its required context`<br>`tests/documents/item-weapon-roll.test.js › captions the reach tiles with the question rather than the bare number`<br>`tests/helpers/items.test.js › offers only authored ranged bands and preserves their modifiers` |
| **Parry** (melee) | WA + the actor's current FV-skill rank · HH passive · SV malus | DK modifier `+3 / 0` | `tests/documents/item-weapon-roll.test.js › gives a parry passive handling, the same SV malus, and a reach choice` |
| **Dodge** | Beweglichkeit + Akrobatik · armour SV malus | — | `tests/e2e/specs/combat-dodge.spec.mjs › a dodge is Beweglichkeit plus Akrobatik, less the armour step` |
| **Resistance** | Stärke (locked) · RW(Stelle) | the penetration comparison `softer / equal / harder` **and** the announced Schadenswert, typed | `tests/documents/actor-resistance-roll.test.js › requires both the announced damage and the penetration comparison`<br>`tests/documents/roll-dialog.test.js › refuses to roll until the announced value is entered` |
| **Haltung** | — | which defence is possible at all, and what the next one costs | `tests/helpers/combat-actions.test.js › lets the Haltung decide which defence is possible at all`<br>`tests/helpers/combat-actions.test.js › leaves the first defence unmodified and charges ten for every one after` |

**Manöver are not a workflow.** A Manöver is not a roll of its own — "alles das
läuft aber unter Angriff" — so it is declared *inside* the attack or parry it
modifies, where the weapon already supplies WA, HH, DK and the SV malus and the
Manöverfertigkeit rank only decides what the Ansage costs. See
[Ansagen](#ansagen).

The FV rank authored on a weapon is a requirement only; what is *added* is the
character's current rank. SV comparisons use **base** Strength. All four rolls
keep the situational modifier (`±3` steps), the advantage/disadvantage picker
and the Idea option; the chosen context is a signed immutable component in the
threshold, the chat breakdown and the message flags. An announced value is the
one component deliberately outside the situational `±30` clamp — that clamp
bounds what a GM hands out, not a number the table has already agreed on
(`tests/documents/roll-dialog.test.js › leaves the announced value outside the situational modifier clamp`).

### Haltung

A Haltung is announced on activation and held until the next one. It answers the
single most important question of the defence side — "je nach Haltung hat der
Charakter eine Parade, ein Ausweichen oder beides" — entirely from the
defender's own sheet, which is what lets an exchange stay uncoupled.

| Haltung | Parade | Ausweichen |
|---|---|---|
| Offen · Ringen · Durchatmen | — | — |
| Einfache Bewegung · En Garde | ✓ | ✓ |
| Vorsichtige Bewegung · Schnelle Bewegung · In Deckung · Unterdrückungsfeuer | — | ✓ |

The first parry and the first dodge of a Haltung are unmodified; every further
one costs `−10`, flat rather than cumulative and **not** a multiple of a step.
Parries and dodges are counted apart. Taking a Haltung — including the same one
again — clears both counters
(`tests/helpers/combat-actions.test.js › clears both counters on taking a Haltung, including the same one again`).
The character banner takes a different Haltung directly from its picker and
provides a separate repeat action for the currently selected one; a native
select cannot emit a change when its current option is chosen again. The next
repeated-defence malus is visible on the Dodge action and on an available Parry
action before either dialog opens.
Defensiver Kampf buys the parry malus back a point at a time in Einfache
Bewegung and En Garde, Deckung nutzen the dodge malus in Vorsichtige Bewegung and
In Deckung, so at rank 10 the malus is gone entirely
(`tests/helpers/combat-actions.test.js › buys the malus back a point at a time, but only in the right Haltung`).
The rulebook names 'Defensiver Kampf' in both entries; the second is read as
'Deckung nutzen', which is a skill of its own and whose section is the one about
repeated Ausweichen.

### Ansagen

"Viele Manöver verwenden Ansagen als Mechanik. Eine Ansage erschwert einen
deiner Würfe um einen anderen zu erleichtern (oder einen gegnerischen Wurf zu
erschweren)." One formula prices all of them:

```
kosten(betrag, rang) = betrag <= rang ? betrag : rang + 2 × (betrag − rang)
```

**What you pay is not what they take.** The 2:1 conversion past the rank is a
surcharge on the declarer; the effect is always the declared Betrag. The
rulebook's own example: Geschickte Angriffe 2 with a 3er Finte is `−4` on the
attack and `−3` on the defence
(`tests/helpers/maneuvers.test.js › matches all three of the rulebook worked examples`).

Ansagen are free integers, **not** multiples of a Malusstufe, and they combine —
"im Prinzip sind sie alle kombinierbar" — so any number may be declared on one
roll and their costs sum into a single component
(`tests/documents/roll-dialog.test.js › sums several declarations into one component and tells the card the Betrag`).

The per-Manöver phrase "maximal um die Höhe deiner X Fertigkeit" is **not** a
hard cap: each section opens with "normale Ansageregeln gelten hier auf alles",
and the general rule's own example declares above the rank.

| Manöver | Fertigkeit | Betrag | Effect |
|---|---|---|---|
| Finte | Geschickte Angriffe | free | defender's Parade/Ausweichen `−Betrag` |
| Riposte *(on a parry)* | Geschickte Angriffe | free | own next attack on them `+Betrag` |
| Starker Schwung | **Distanzkontrolle** | free | defender's Widerstand and Parade `−Betrag` |
| Weiter Schwung | **Distanzkontrolle** | free | defender's Ausweichen `−Betrag` |
| Arme · Beine | **Gezielter Stich** / **Angesagter Schuss** | 3 | Stelle; damage split over two attributes |
| Kopf | **Gezielter Stich** / **Angesagter Schuss** | 6 | Stelle; damage doubled after the resistance roll |
| Rüstung umgehen | **Gezielter Stich** / **Angesagter Schuss** | typed | the armour on that Stelle does not apply |
| Schwachstelle | **Gezielter Stich** / **Angesagter Schuss** | typed | whatever the GM sets |

Three of the Kampfregeln's section headings are not the skill names — Gezielte
Angriffe is *Gezielter Stich*, Gezielte Schüsse is *Angesagter Schuss*, Starke
Angriffe is *Distanzkontrolle*. The Fertigkeiten page wins, because that is where
the rank a character buys is listed, and the rank is what sets the 1:1 limit
(`tests/helpers/maneuvers.test.js › names the skill that governs each Manöver, not its rulebook section`).

Arme, Beine and Kopf name a Stelle, and an attack has one — so they are offered
as a single choice whose default is "keine Ansage", not as three rows that could
all be ticked
(`tests/documents/roll-dialog.test.js › lets one Stelle be announced, and only one`).
Everything else combines freely: "im Prinzip sind sie alle kombinierbar".

The two Schwünge need the reach advantage and cost nothing while it is absent
(`tests/documents/roll-dialog.test.js › refuses to charge for a Manöver whose reach precondition is unmet`).
`Rüstung umgehen` costs the defender's **RA** at that Stelle, which is the
defender's own number — so it is typed in after they name it, never looked up.

Not Ansagen at all, and therefore not in the table: Abtauchen, Unterlaufen,
Positionierung, Auf Abstand halten, Defensiver Kampf and Deckung nutzen. Those
cost nothing and declare nothing — they are standing bonuses of rank on some
other roll.

A Manöver whose Fertigkeit stands at rank 0 is folded behind one line rather
than listed: it is legal — "hättest du gar keinen Punkt … um 6" — but eight open
rows would make the Standardangriff, which is most rolls, the loudest thing in
the dialog
(`tests/helpers/combat-actions.test.js › marks the Manöver whose Fertigkeit the character has never bought`).

Resistance determines **neither** the hit location nor any damage: the player
states the location by clicking it on the paper doll and the Schadenswert by
typing it. Where the damage then lands is
[fully determined by the Stelle](#where-damage-lands); writing it onto the
attributes stays [Deferred](#deferred).

### The envelope

What crosses from attacker to defender, and all of it. Rendered as text on the
attack's chat card — no targeting, no second document, no permission check
(`tests/documents/roll-dialog.test.js › emits the envelope with the Betrag and the Stelle, and no attacker stats`).

```
from · Parade −n · Ausweichen −n · Widerstand −n · Stelle
     · armour bypassed? · RB/RD · Scharf / Wucht
```

Each defence is listed apart because they can differ: a Weiter Schwung worsens
only the dodge, a Starker Schwung only the parry and the resistance
(`tests/helpers/maneuvers.test.js › sends each Schwung only to the roll its rule names`).
The defender never learns *which* Manöver was declared — from their side a
Finte, a Starker Schwung and a Weiter Schwung are the same sentence, which is
what keeps this list from growing when Manöver are added.

The receiving end is one optional integer on each defence roll, taken as given
and outside the `±30` clamp
(`tests/documents/roll-dialog.test.js › subtracts an announced Ansage from a defence without ever gating it`).

**Two ways to get it there, and the manual one is the guaranteed one.** The
defender may read the number off the card and type it, or click the card's
shortcut, which stores it on **their own** sheet so the next defence they open
starts with it filled in. The shortcut writes nowhere else and is consumed by
the first defence that uses it
(`tests/helpers/combat-actions.test.js › forgets the announcement once a defence has used it`).
Nothing is ever gated on it: every defence offers the typed field whether or not
a card was involved
(`tests/helpers/combat-actions.test.js › offers the typed announcement field on every defence, with no card involved`).
The card also carries the attacker's **DK** as information — reach stays a
shared observation each side answers for itself, but this is the fact it is
answered from.

## Not implemented

Every em dash in a Proof cell, and what it is waiting for. **State** is the
difference that matters: `no code` means the rule does not exist in the system,
`no test` means it does and nothing is stopping it from silently breaking.

**None.** Every rule above cites a test.

Not the same as [Deferred](#deferred): a row here would be **in scope, specified
above, and owed**. Deferred means the rules exist but this document does not
cover them.

## Deferred

Targets, combatant state, Initiative, Bindung, action economy, ammunition,
readying, chat-card follow-up chains.

**Nothing is applied automatically.** The attack card states the envelope, the
defender enters what applies to them, and a failed resistance roll leaves the
damage to be written onto the attributes by hand. That is deliberate rather than
unfinished: an automatic hand-off needs targets and cross-actor writes, which is
exactly the coupling this document refuses while the rules are still moving. The
format would not change if it were automated later — only the transport.

Riposte is the one Ansage whose effect outlives its roll ("dein *nächster*
Angriff gegen ihn"), so it needs actor-scoped state keyed by target and is not
tracked. The seven `#TODO` Manöver categories — Fiese Tricks, Automatikfeuer,
Gun-Kata, Gruppenkampftaktik, Einzelkampftaktik, Psychologische Kriegsführung,
Teamführung — are unwritten in the rulebook itself, not merely unimplemented.

The hit location is **declared, never rolled**: an attack announces a Stelle or
it hits the Torso, and the defender opens the resistance roll by clicking that
location on the paper doll. There is no random hit table anywhere in the rules.

## Open

1. **Should the announced Schadenswert persist between resistance rolls on the
   same actor**, the way `skills.<key>.lastAttribute` does?
2. **Do Arme, Beine and Rüstung umgehen have a 1:1 limit at all?** Their entries
   name a Betrag but no Fertigkeit to measure it against, unlike Kopf. Read here
   as governed by the section's own skill, per "normale Ansageregeln gelten hier
   auf alles".
3. **What produces the Gleichgewicht steps?** Sich Fangen and Durchatmen both
   spend them and nothing in the rules hands them out. Open whether they are
   Beweglichkeit damage or a separate, self-clearing track — the latter is
   assumed, because no other attribute damage heals mid-fight.

Resolved: *does a Manöver carry the weapon's SV malus?* — **yes.** A Manöver is
an attack ("alles das läuft aber unter Angriff"), and SV covers "jede
Angriff/Parade mit dieser Waffe". It now falls out by construction, since a
Manöver is declared inside the attack rather than rolled beside it.
