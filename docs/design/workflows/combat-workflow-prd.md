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
| Stärke | `abilities.str.base` | Strength; the sole rating used by requirements, damage capacity and resistance rolls |
| Beweglichkeit | `abilities.dex.base` | Agility |
| Fingerfertigkeit | `abilities.fin.base` | Dexterity |
| Akrobatik | `skills.acrobatics.value` | Acrobatics |
| Raufen | `skills.brawling.value` | Brawling |
| **FV** Fertigkeitsvorraussetzung | `fv.skill`, `fv.rank` | which skill the weapon needs, at which rank |
| **SV** Stärkevorraussetzung | `sv` | Strength the weapon or armour piece needs |
| **WA** Waffenattribut | `wa` | the attribute this weapon rolls from |
| **DK** Distanzklasse | `dk` (melee), `range.{sn,near,mid,far,sf}` (ranged) | reach class 0–6 / the five range bands |
| **HH** Handhabung | `hh.active`, `hh.passive` | base modifier, attack / parry |
| **RB / RD** Rüstungsbrechung / -durchdringung | `rb` (melee), `rd` (ranged) | armour ignored up to this hardness |
| **S / WS** Schadenswert / Wucht Schadenswert | `ss.count`, `ws.count` | damage on a penetrating / non-penetrating hit |
| **RH** Rüstungshärte | `rh` | how hard the armour is to punch through |
| **RW** Rüstungswert | `rw` | padding; feeds the resistance value |
| **RA** Rüstungsabdeckung | `ra` | how well the location is covered |
| Stelle | `zone` | hit location: `head`, `torso`, `arms`, `legs` |
| Schaden / Wuchtschaden | `damage.{sharp,blunt}` | the two raw health counters; conversion is derived, never persisted. The stored keys predate the rename — read `sharp` as Schaden |
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
| **Resistance** (Widerstandswert) | Stärke + RW(Stelle) − the weapon's SS or WS, `+3` when RH > RB/RD | `tests/documents/actor-resistance-roll.test.js › opens the resistance roll of the location that was clicked, with its armour value`<br>`tests/documents/actor-resistance-roll.test.js › reads the sole Stärke rating` |

Resistance takes the same sole `base` rating as requirements, regular attribute
rolls and `derived.dodge`; there is no separate temporary/effective attribute
axis.

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
| **Damage** | every raw point in either damage pool | 1 point, flat | `−(sharp + blunt)` | every roll, including Resistance | `tests/helpers/damage.test.js › accumulates both raw pools and applies one malus per point`<br>`tests/documents/roll-dialog.test.js › applies to every roll and reaches the breakdown, components and flags`<br>`tests/documents/actor-resistance-roll.test.js › includes the always-on damage malus on the resistance roll` |

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

If 3 fails, the target takes the applicable damage value:

| | RH < RB/RD | RH = RB/RD | RH > RB/RD |
|---|---|---|---|
| Damage value | S (Schaden) | WS (Wucht) | WS (Wucht) |
| Resistance roll | — | — | `+3` (1 bonus step) |

The comparison needs one number from each side, and the direction it runs in is
what keeps the armour private: **the attacker reads their weapon card out** —
RB/RD, Schaden, Wucht — and the defender, who alone knows their RH, picks.

### Damage pools and Stelle

There are two kinds of damage. **Schaden** is the obvious one and measures how
badly a person or object is injured or damaged. **Wuchtschaden** measures how
restricted they currently are — knocked to the ground, off balance, or with
their orientation impaired. Each level of either shows up as a `−1` malus on
every roll. The kind that used to be called *Scharfer Schaden* is this plain
`Schaden`, abbreviated **S** where the old name was abbreviated SS; `WS` is
unchanged.

Per-Stelle attribute damage is gone. The penetration comparison selects the raw
pool — S enters Schaden, WS enters Wuchtschaden — while Stelle keeps
only its multiplier: Kopf ×2, every other location ×1
(`tests/helpers/maneuvers.test.js › doubles a head hit, and only a head hit`).
The resistance dialog and the attack's Stelle tiles therefore name the pool and
multiplier, never an attribute
(`tests/documents/actor-resistance-roll.test.js › names the damage pool and the Stelle multiplier instead of attributes`).

The character's health model resolves against trained Stärke
(`abilities.str.base`):

1. Each pool has its own budget of the full Stärke. Schaden never takes room
   away from Wuchtschaden, and Wuchtschaden never takes room away from Schaden
   (`tests/helpers/damage.test.js › gives each pool its own budget instead of letting Schaden crowd Wuchtschaden out`).
   Wuchtschaden is derived as converted Schaden only past *its own* Stärke,
   while the stored raw counters remain untouched
   (`tests/helpers/damage.test.js › converts blunt damage only once it has filled its own track`).
2. `effectiveSharp = sharp + bluntConverted`. The character is
   **Kampfunfähig** only when `effectiveSharp > base Stärke`, strictly greater,
   with a warning badge but no enforced status
   (`tests/helpers/damage.test.js › incapacitates only once effective Schaden is strictly greater than capacity`).
3. Every raw point in either pool applies `−1` to every roll. A converted point
   remains one point and is never counted twice
   (`tests/helpers/damage.test.js › counts converted damage once rather than adding it to the raw total again`).

The header also derives a fixed **3×2 condition raster** from those pools. Its
columns are core, legs and arms; Wuchtschaden is the upper mild row and Schaden
the lower severe row. Each light activates only when its pool is strictly
greater than the associated trained attribute: core compares with Stärke, legs
with Beweglichkeit and arms with Fingerfertigkeit. The severe row reads
effective Schaden, so converted Wuchtschaden crosses the same thresholds as raw
Schaden. The named warnings are Handlungsunfähig / Kampfunfähig, Beine
behindert / verkrüppelt and Arme behindert / verkrüppelt.

Was jeder Zustand bedeutet — die Wortlaute, die Sheet und Tooltip anzeigen:

| Zustand | Schwelle | Effekt |
| --- | --- | --- |
| Kampfunfähig | Schaden > Stärke | Scheidet aus dem Kampf aus |
| Beine verkrüppelt | Schaden > Beweglichkeit | Kann sich nur noch mit der Geschwindigkeit „Kriechend" fortbewegen — im Kampf also nur in der Haltung „Vorsichtige Bewegung" |
| Arme verkrüppelt | Schaden > Fingerfertigkeit | Kann keine Handlungen mehr durchführen, für die die Hände benötigt werden: neben allen Angriffen auch Klettern, Geräte bedienen usw. nach GM-Entscheid |
| Handlungsunfähig | Wuchtschaden > Stärke | Kann keine Handlung außer „Sich fangen" ausführen und keine Haltung außer „Offen" einnehmen |
| Beine behindert | Wuchtschaden > Beweglichkeit | Kann sich nur noch mit „Kriechend" oder „Gehen" fortbewegen — im Kampf also nicht in der Haltung „Schnelle Bewegung" |
| Arme behindert | Wuchtschaden > Fingerfertigkeit | Kann nichts mehr in der Hand halten und lässt es fallen |

**Der Effekt wird angesagt, nicht erzwungen.** Keine dieser Zeilen greift in
eine Regelrechnung ein: das Sheet sperrt weder Haltungen noch Handlungen, und
der globale Wurfmalus kommt weiterhin allein aus den rohen Pools. Die Zustände
sind das, was am Tisch gilt — die Anzeige sagt es, der Tisch wendet es an. Ob
die Haltungssperren der Beine- und Kern-Zustände einmal in den Haltungswähler
wandern, ist offen und bewusst nicht vorweggenommen.

Each light follows its derived comparison by default and may be forced on or
off by the actor's owner. This override changes only the displayed condition:
it never changes either damage pool, the global malus or another rule result.
The conditions are warnings, not enforced restrictions. The header status
component is always visible as the character's read-only collection of active
conditions: both its compact summary and opened panel omit inactive and manually
negated entries, and the panel shows an empty state when none are active. A
blue point marks a manually set condition. The full damage raster alone keeps
all six positions visible and cycles each one through automatic, manually set
and manually negated. Damage conditions are negative conditions; the shared
warning red colours only their small boxes in the status collection, never the
surrounding `ZUSTÄNDE` pill.

**Both surfaces lead with the effect from the table above.** The panel row
reads condition → effect → threshold, and a raster light's tooltip does the
same, including on a light that is off — "what would this one do to me" is the
question an unlit position is looked at with. The threshold comparison stays
the footnote: it explains why the entry is on, which is a smaller question than
what it costs.

Damage is entered manually on the owning character sheet. The system does not
automatically transfer a failed resistance roll into either pool.

A failed resistance roll therefore **states its cost on the chat card**: the
announced Schadenswert times the Stelle's multiplier, named as the pool it goes
into — "4 Wuchtschaden (WS)", plus the arithmetic whenever the multiplier is not
1 (`tests/documents/actor-resistance-roll.test.js › states how much of which pool a failed resistance roll costs`,
`tests/documents/actor-resistance-roll.test.js › cashes in the Stelle multiplier and shows the arithmetic it did`).
It states only; the owner still enters it. That line appears on failed rolls and
on nothing else, decided after the dice rather than by whatever opened the dialog
(`tests/helpers/dice.test.js › says nothing at all on the roll that succeeded`).

Both figures were already on the card before, and neither was readable: the pool
was the penetration tile's consequence rather than its wording, the amount was
recorded in the breakdown **negated** (it is a threshold component there), and
the multiplier was named on the flavor line as a rule with no number attached.

**How much** it should be is still open: the rule says "Schaden in Höhe des
verwendeten Schadenswert **als Würfel**", and which dice those are is written
nowhere. Read here as the value itself — the damage track counts in points, and
the alternative is a roll no rule defines. Should dice turn out to be meant,
`appliedDamage` in `helpers/maneuvers.mjs` is the single place that decides it.

`Rüstung umgehen` cancels the Stelle's RW on the resistance roll. It is offered
on every location that has padding to cancel and is ticked by the defender alone
— nothing an attack sends can pre-set it, because the card carries an amount and
never a reason
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

The damage malus is own state and applies before every workflow-specific
modifier. It is neither a fixed option supplied by the opener nor a conditional
component decided by form state.

| Workflow | Fixed components | Required context | Proof |
|---|---|---|---|
| **Attack** | WA + the actor's current FV-skill rank · HH active · SV malus | melee: DK modifier `+3 / 0` · ranged: one authored range band (each authored `−3 … +3`) · the Stelle, priced per [Gezielte Angriffe](#the-stelle) and free only at the Torso | `tests/documents/item-weapon-roll.test.js › offers a melee attack the two reach outcomes as its required context`<br>`tests/documents/item-weapon-roll.test.js › labels both reach-toggle answers rather than showing bare numbers`<br>`tests/helpers/items.test.js › offers only authored ranged bands and preserves their modifiers` |
| **Parry** (melee) | WA + the actor's current FV-skill rank · HH passive · SV malus | DK modifier `+3 / 0`; no Stelle | `tests/documents/item-weapon-roll.test.js › gives a parry passive handling, the same SV malus, and a reach choice` |
| **Dodge** | Beweglichkeit + Akrobatik · armour SV malus | — | `tests/e2e/specs/combat-dodge.spec.mjs › a dodge is Beweglichkeit plus Akrobatik, less the armour step` |
| **Resistance** | Stärke (locked) · RW(Stelle) | the penetration comparison `softer / equal / harder`; the announced Schadenswert opens at 0 and is edited, not required | `tests/documents/actor-resistance-roll.test.js › requires the penetration comparison, and defaults the announced damage`<br>`tests/documents/roll-dialog.test.js › opens the announced value at zero and never blocks the roll on it` |
| **Haltung** | — | which defence is possible at all, and what the next one costs | `tests/helpers/combat-actions.test.js › lets the Haltung decide which defence is possible at all`<br>`tests/helpers/combat-actions.test.js › leaves the first defence unmodified and sums a step onto every one after` |

**Manöver are not a workflow.** A Manöver is not a roll of its own — "alles das
läuft aber unter Angriff" — so it is declared *inside* the attack or parry it
modifies, where the weapon already supplies WA, HH, DK and the SV malus. What is
declared is one number and, on an attack, one Stelle. See [Ansagen](#ansagen).

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
one costs a Malusstufe more than the last — "eine, sich aufsummierende, Stufe
(-3)" — so the second costs `−3`, the third `−6`, and so on.
Parries and dodges are counted apart. Taking a Haltung — including the same one
again — clears both counters
(`tests/helpers/combat-actions.test.js › clears both counters on taking a Haltung, including the same one again`).
The character banner's Haltung chip opens a picker showing all nine at once,
grouped into Grundhaltung, Bewegung, Kampf and Erholung, with a panel that names
the pointed-at Haltung's effect and the defence it permits. Every option is a
button, so taking the Haltung already in force — the act that clears both
counters — needs no control of its own. The next repeated-defence malus is
visible on the Dodge action and on an available Parry action before either
dialog opens.
Three Manöverfertigkeiten buy the malus back, and which one applies is decided
by the Haltung — Ausweichen has two of them:

| Defence | Skill | Haltungen |
|---|---|---|
| Parade | Defensiver Kampf | Einfache Bewegung · En Garde |
| Ausweichen | Deckung nutzen | Vorsichtige Bewegung · In Deckung |
| Ausweichen | Haken schlagen | Einfache Bewegung · Schnelle Bewegung |

A rank **skips** that many repeats rather than shifting the ladder down: at rank
1 three parries cost full / full / `−6`, not full / full / `−3`. That is the one
reading consistent with the rulebook's own worked examples, and it is worth
stating because it looks like a typo and is not
(`tests/helpers/combat-actions.test.js › lets a rank skip that many repeats, leaving the rest at their own price`,
`tests/helpers/combat-actions.test.js › picks the relief skill the Haltung calls for, and none outside it`).
The rulebook names 'Defensiver Kampf' in all three sections; the latter two are
read as 'Deckung nutzen' and 'Haken schlagen', each a skill of its own and each
with its own section about repeated Ausweichen.

### Ansagen

"Viele Manöver verwenden Ansagen als Mechanik. Eine Ansage erschwert einen
deiner Würfe um einen anderen zu erleichtern (oder einen gegnerischen Wurf zu
erschweren)." That sentence is the whole of what the system models: **one free
magnitude, declared on the roll, taken at face value.**

| | |
|---|---|
| Input | one optional integer, `0` = nothing declared |
| Cost to the declaring roll | `−Betrag` |
| What the defender is told | `Betrag` |
| Which of their rolls it lands on | not modelled — said out loud |
| Which Manöver it is | not modelled — said out loud |

The declaration is agreed between the player and the GM **before** the number is
typed, and that conversation is where the rulebook's arithmetic happens: the
1:1-to-the-rank / 2:1-past-it ladder, the per-Manöver "maximal um die Höhe deiner
X Fertigkeit", the reach precondition on the Starke Angriffe, and which of Finte
/ Starker Schwung / Weiter Schwung is being paid for. None of it reaches the
form, because a form that re-derived it could only ever disagree with the table
(`tests/documents/roll-dialog.test.js › takes the declared amount at face value, with nothing to price it against`).

Ansagen are free integers, **not** multiples of a Malusstufe, and the field sits
deliberately outside the situational `±30` clamp — that clamp bounds what a GM
hands out unilaterally, and this is a number both sides already agreed on
(`tests/documents/roll-dialog.test.js › leaves the declared amount outside the situational modifier clamp`).
Blank, zero and negative all mean the same thing: a Standardangriff
(`tests/documents/roll-dialog.test.js › reads a blank, negative or fractional field as nothing declared`).

A parry gets the same field — a Riposte is declared on one — but never a Stelle,
which is the attacker's to name
(`tests/helpers/combat-actions.test.js › gives a parry the Ansage field and no Stelle`).

**Why the per-Manöver form went.** It priced nine rows against nine skill ranks,
gated two of them on the reach tile, and folded the untrained ones away — so a
character with Gezielter Stich 8 and nothing else was shown the two rows whose
Betrag only the GM knows, while Finte sat behind a "rarely used" button. The
rules it enforced are real, but they are rules about a conversation, and the
conversation was happening at the table regardless.

Not Ansagen at all: Abtauchen, Unterlaufen, Positionierung, Auf Abstand halten,
Defensiver Kampf and Deckung nutzen. Those cost nothing and declare nothing —
they are standing bonuses of rank on some other roll.

#### The Stelle

The one declaration that stayed a discrete pick, because it is **a location as
well as an amount**: it decides the damage multiplier, and the defender opens
that roll by clicking the same location on their paper doll. Four tiles in the
declaration section, each carrying its price and multiplier, Torso preselected
(`tests/helpers/combat-actions.test.js › offers every Stelle as a tile captioned with what a hit there costs`).

There is no "keine Ansage" option beside Torso: an attack always lands somewhere,
and where it lands when nobody said otherwise *is* the Torso
(`tests/helpers/maneuvers.test.js › covers every Stelle an attack can announce, and the default first`).

**Gezielte Angriffe prices every location, and the rulebook writes the numbers
out.** "Ansagen auf Trefferzonen im Nahkampf, normale Ansageregeln gelten hier
auf alles":

| Stelle | To the threshold | Rule text |
|---|---|---|
| **Torso** | `0` | not a Gezielter Angriff at all — it is where an unannounced blow lands |
| **Arme** | `−3` | "Erschwere deinen Angriff um eine Stufe, also -3" |
| **Beine** | `−3` | "Erschwere deinen Angriff um eine Stufe, also -3" |
| **Kopf** | `−6` | "Erschwere deinen Angriff um zwei Stufen, also -6" |

The prices live in `ZONE_COSTS` in `helpers/maneuvers.mjs`, written as multiples
of `MALUS_STEP` because that is what the rule says — the −3 and the −6 are the
Stufe restated
(`tests/helpers/maneuvers.test.js › prices every Stelle it offers, and leaves the Torso free`<br>`tests/documents/roll-dialog.test.js › charges the Stelle what Gezielte Angriffe prices it at`).

Because those costs **are** Ansagen, naming a Stelle other than the Torso makes
the attack a Manöver and pulls in the weapon's FV step, exactly as typing an
amount does. The Torso does not
(`tests/documents/roll-dialog.test.js › makes an aimed attack a Manöver, and the Torso not`<br>`tests/documents/roll-dialog.test.js › compounds the Stelle price with the FV step it triggers`).

The price and any freely declared amount stay **two components**, never summed
into one. They are two decisions, and a breakdown reading `Kopf −6 · Ansage −4`
says where each figure came from where a single `Ansage −10` would not
(`tests/documents/roll-dialog.test.js › names the Stelle in the breakdown rather than folding it into the Ansage`).

Applies to melee and ranged alike. The section heading says "im Nahkampf", but
the Gezielter Stich entry describes *schießen* — read as where the section sits
in the book rather than as a restriction.

`Rüstung umgehen` has no control of its own on the attack. Its effect is the
defender's — the cancelled RW is their armour — so it lives on their resistance
roll, as a checkbox they tick on being told and that nothing the attacker sent
can pre-set
(`tests/helpers/combat-actions.test.js › never pre-ticks the armour bypass`).

That is **not** what the rule says, and the divergence is deliberate for now. The
text reads "Erschwere deinen Angriff um die Rüstungsabdeckung der jeweiligen
Stelle und ignoriere sie dafür" — a cost on the *attacker*, priced in the
defender's RA, which is a number the attacker cannot see. It is not modelled as
its own field because it would need an announced-RA channel, and the cheaper
answer already exists: the attacker types the amount into the free Ansage field
like any other declaration. Revisit once the zone tiles and the free field have
been played with. Same for **Schwachstelle**, whose Erschwernis the GM names —
that is a free number and always was.

### Turn order

"Initiativegrundwert + 1d10", and then **the slowest combatant acts first.**

The formula lives once, in `TNO.initiativeFormula`, and both the combat tracker
and the character sheet's Initiative caption roll it — so the two cannot drift
apart. The order it produces is read *upward*: lowest value activates first,
highest last.

A round is kept as an ordered **activation history** rather than as a queue of
who is still owed a turn. That is what makes stepping backwards truthful: a
rewind retraces the round the way it was played, including an activation somebody
pulled forward, instead of recomputing the order the initiative list would have
produced.

A player may pull their own combatant's activation forward **once per round**.
Doing so spends that combatant's turn — they do not come round again until the
next round — and it leaves everyone the order had not yet reached still owed a
turn. When the round turns over, the initiative values from the start of the
encounter are restored, so nothing an interrupt or a hand edit did to a number
outlives the round it happened in.

| Rule | Where | Proof |
|---|---|---|
| Initiative is `1d10 + Initiativegrundwert`, one formula for tracker and sheet | `CONFIG.Combat.initiative` ← `TNO.initiativeFormula` | `tests/e2e/specs/combat-initiative.spec.mjs › the tracker rolls 1d10 plus the derived initiative value`<br>`tests/e2e/specs/combat-initiative.spec.mjs › the sheet initiative cell and tracker share one formula` |
| The lowest initiative activates first | `TnoCombat#_sortCombatants` (ascending) | `tests/e2e/specs/combat-reverse-initiative.spec.mjs › the slowest combatant activates first when combat starts`<br>`tests/documents/combat-turn-order.test.js › puts the slowest combatant first` |
| Each further activation is the slowest combatant still owed a turn | `TnoCombat#nextTurn` | `tests/e2e/specs/combat-reverse-initiative.spec.mjs › next turn walks from the slowest to the fastest combatant`<br>`tests/documents/combat-turn-order.test.js › walks from the slowest to the fastest combatant` |
| Stepping back retraces the activations that happened, not the initiative order | `TnoCombat#previousTurn` over `helpers/round-state.mjs` | `tests/e2e/specs/combat-reverse-initiative.spec.mjs › previous turn retraces the activation history`<br>`tests/helpers/round-state.test.js › preserves an interrupt activation in both directions` |
| A combatant may activate early once a round, and not again that round | `TnoCombat#activateEarly` | `tests/e2e/specs/combat-reverse-initiative.spec.mjs › the GM can pull a combatant forward out of order`<br>`tests/documents/combat-interrupt.test.js › refuses a combatant who has already activated this round` |
| Interrupting does not end the round for the combatants it skipped | `TnoCombat#nextTurn` | `tests/documents/combat-interrupt.test.js › leaves the combatants who were skipped over still owed a turn` |
| A player's interrupt is a request the GM's client grants, checked against actor ownership | `helpers/combat-socket.mjs` | `tests/helpers/combat-socket.test.js › grants an owner their own combatant`<br>`tests/helpers/combat-socket.test.js › refuses a combatant the requesting user does not own` |
| A new round restores the initiative values from combat start | `TnoCombat#nextRound` | `tests/e2e/specs/combat-reverse-initiative.spec.mjs › a new round restores the initiative values from combat start` |
| A combatant's *first* initiative is their baseline, whenever it arrives — a round change never resets someone to no initiative | `TnoCombat#nextRound` | `tests/documents/combat-turn-order.test.js › never restores a combatant to no initiative at all`<br>`tests/documents/combat-turn-order.test.js › adopts a baseline for a combatant who joined mid-fight` |
| The Haltung in force is visible per combatant in the tracker | `apps/combat-tracker.mjs` over `helpers/stances.mjs` | `tests/e2e/specs/combat-tracker-stance.spec.mjs › the tracker shows each combatant stance beside its initiative`<br>`tests/e2e/specs/combat-tracker-stance.spec.mjs › a stance change on the sheet reaches the tracker` |
| A combatant with no Haltung reads as the default one | `helpers/stances.mjs` | `tests/e2e/specs/combat-tracker-stance.spec.mjs › a combatant without a stance falls back to the default`<br>`tests/helpers/stances.test.js › falls back for an actor with no combat block, which is every NPC` |

**Display direction is not a rule.** The `combatTrackerOrder` world setting
chooses which end of the list the sidebar draws first, and the activation order
is identical either way.

**No migration.** Combat state is transient — the round state and the initiative
snapshot live in Combat flags that never existed in an earlier version of this
system. The only thing a migration could rescue is an encounter running across
the version bump, which is not worth a migration step.

### The envelope

What crosses from attacker to defender, and all of it. Rendered as text on the
attack's chat card — no targeting, no second document, no permission check
(`tests/documents/roll-dialog.test.js › emits the envelope with the amount and the Stelle, and no attacker stats`).

```
from · Ansage −n · DK · Stelle · RB/RD · Schaden / Wucht
```

**One Ansage figure, not one per defence.** Which of the defender's rolls it
lands on was settled out loud when the two players agreed the number, so the card
states the amount and claims nothing about where it applies
(`tests/helpers/dice.test.js › states the Ansage as one figure, not one per defence`).

**And the Stelle's price is not part of that figure.** The `−6` for a head shot
buys doubled damage, not a harder defence, so folding it into the envelope's
amount would tell the defender that six was aimed at their dodge. The price stays
on the attacker's own roll; what the Kopf does to the defender travels as the
Stelle and nowhere else
(`tests/documents/roll-dialog.test.js › keeps the Stelle price on the attacker and out of the envelope entirely`).
The defender never learns which Manöver was declared, which is what keeps this
list from growing when Manöver are added — and it can no longer say the armour
was bypassed, because that is the defender's own checkbox
(`tests/helpers/dice.test.js › never claims the armour was bypassed, since that is the defenders own call`).

The receiving end is one optional integer on each defence roll, taken as given
and outside the `±30` clamp
(`tests/documents/roll-dialog.test.js › subtracts an announced Ansage from a defence without ever gating it`).

**One way to get it there: the defender types it.** The card publishes the
number; nothing pushes it anywhere. A shortcut used to exist that wrote the
announcement onto the clicking user's own sheet so the next defence opened
pre-filled, and it is gone — a second path to the same field bought a stored
`system.combat.pending` blob, a recipient-resolution question ("which of my
sheets?"), and a consumed-on-first-use lifetime, all to save typing one integer
that is printed on screen. The typed field was always the guaranteed path and is
now the only one. Nothing is ever gated on it: every defence offers the field,
carrying no announced number — it opens at 0 — whether or not a card was involved
(`tests/helpers/combat-actions.test.js › offers the typed announcement field on every defence, with no card involved`,
`tests/helpers/combat-actions.test.js › offers the announcement field blank, on every defence, always`).
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

Targets, combatant state, Bindung, action economy, ammunition, readying,
chat-card follow-up chains.

**Combatant groups.** Foundry v14 has `CombatantGroup`. How a group behaves under
slowest-first activation — one activation for the group, or one each — is a rule
this document does not settle, and nothing in the code reads the class. Out of
scope until the table wants it.

**Nothing is applied automatically.** The attack card states the envelope, the
defender enters what applies to them, and a failed resistance roll names the
amount and the pool but leaves both to be stepped manually on the target's own
damage widget — stating a number is not writing it.
That is deliberate rather than unfinished: an automatic hand-off needs targets
and cross-actor writes, which is exactly the coupling this document refuses
while the rules are still moving. The format would not change if it were
automated later — only the transport.

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
   assumed, because the damage model no longer writes to attributes at all.
4. **Does the Kopf's cap block the tile, or can you buy past it?** The entry
   prices a head shot at `−6` "maximal um die Höhe deiner 'Gezielter Stich'
   Fertigkeit". Read strictly that bars the Stelle outright below rank 6; read
   through "normale Ansageregeln gelten hier auf alles" the 2:1-past-the-rank
   ladder should let it be bought. **Shipped flat**: the `−6` applies, the tile
   is never disabled and nothing warns, consistent with the standing rule that
   this dialog never re-derives the Ansage ladder.
5. **Is "Schaden in Höhe des verwendeten Schadenswert als Würfel" a roll?**
   **Shipped flat**: the card applies the Schadenswert itself, times the Stelle
   multiplier — the damage track counts in points, and no dice are named. If a
   roll was meant, `appliedDamage` is the one function to change.
6. **Where does `Rüstung umgehen` charge?** The rule puts the cost on the
   attacker, measured in the defender's RA — see [The Stelle](#the-stelle). The
   implementation charges the attacker nothing and lets the defender cancel
   their own RW instead. Resolving it needs an announced-RA channel; deferred
   until the priced zone tiles have been playtested.

Resolved: *does a Manöver carry the weapon's SV malus?* — **yes.** A Manöver is
an attack ("alles das läuft aber unter Angriff"), and SV covers "jede
Angriff/Parade mit dieser Waffe". It now falls out by construction, since a
Manöver is declared inside the attack rather than rolled beside it.
