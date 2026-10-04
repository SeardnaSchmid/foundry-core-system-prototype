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
| **SV** Stärkevorraussetzung | `sv` | Strength the weapon or armour piece needs |
| **WA** Waffenattribut | `wa` | the attribute this weapon rolls from |
| **WF** Waffenfertigkeit | `wf` | the skill this weapon rolls with |
| **DK** Distanzklasse | `dk` (melee), `range.{sn,near,mid,far,sf}` (ranged) | reach class 0–6 / the five range bands |
| **HH** Handhabung | `hh.active`, `hh.passive` | base modifier, attack / parry |
| **RB** Rüstungsbrechung | `rb` | armour ignored up to this hardness, for melee and ranged weapons alike |
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
| **Resistance** (Widerstandswert) | Stärke + applicable RW(Stelle) − the weapon's SS or WS; penetration ignores all RW, while Rüstung umgehen removes only the outer armour's RW and retains the Unterkleidung | `tests/documents/actor-resistance-roll.test.js › opens the resistance roll of the location that was clicked, with its armour value`<br>`tests/documents/actor-resistance-roll.test.js › reads the sole Stärke rating`<br>`tests/documents/actor-resistance-roll.test.js › bypasses only the outer armour and keeps the underclothing RW` |

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
| **SV armour** | base Stärke < Σ SV of everything worn | 1, flat | `−3` | every Beweglichkeit roll | `tests/helpers/inventory.test.js › sums the strength requirement over every worn piece`<br>`tests/helpers/items.test.js › costs one flat step on a Beweglichkeit roll and nothing on any other attribute`<br>`tests/documents/roll-dialog.test.js › sends the armour step into the breakdown, the roll components and the message flags` |
| **Damage** | every raw point in either damage pool | 1 point, flat | `−(sharp + blunt)` | every roll, including Resistance | `tests/helpers/damage.test.js › accumulates both raw pools and applies one malus per point`<br>`tests/documents/roll-dialog.test.js › applies to every roll and reaches the breakdown, components and flags`<br>`tests/documents/actor-resistance-roll.test.js › includes the always-on damage malus on the resistance roll` |

SV weapon, worked out:

| Shortfall (SV − Stärke) | 1 | 2 | 3 | 4 | 5 | 6 | … | 9 |
|---|---|---|---|---|---|---|---|---|
| Steps | 1 | 1 | 2 | 2 | 3 | 3 | | 5 |
| **To the threshold** | `−3` | `−3` | `−6` | `−6` | `−9` | `−9` | | `−15` |

Exceeding a requirement buys nothing. The SV malus lands on a declared Manöver
as much as on a Standardangriff, because a Manöver is an attack ("alles das
läuft aber unter Angriff").

The armour SV attaches to the **attribute**, not to a workflow: any roll built
on Beweglichkeit takes the step, Dodge and a dex-attributed roll alike. Two
Beweglichkeit slots on one roll are still one step
(`tests/helpers/items.test.js › costs the same one step however many Beweglichkeit slots a roll fills`).

## The attack roll

| # | Who | Rolls against | Attack ends on |
|---|---|---|---|
| 1 | Attacker | Attack value | failure |
| 2 | Defender, if their Haltung allows a defence | Dodge **or** Parry value (Parry is melee-only) | success |
| 3 | Defender | Resistance value | success |

If 3 fails, the target takes the applicable damage value:

| | RH < RB | RH = RB | RH > RB |
|---|---|---|---|
| Damage value | S (Schaden) | S (Schaden) | WS (Wucht) |
| RW(Stelle) | ignored | applies | applies |

The comparison needs one number from each side, and the direction it runs in is
what keeps the armour private: **the attacker reads their weapon card out** —
RB, Schaden, Wucht — and the defender, who alone knows their RH, types the RB
in; their own sheet compares it against the RH of the struck location.
A confirmed Rüstung umgehen makes the comparison moot and is asked first.

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
The resistance dialog names the pool and multiplier, never an attribute
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

`Rüstung umgehen` is a private comparison on the defender's resistance roll:
"Hat der Angreifer mindestens RA X angesagt?" A lower or missing declaration is
No; a declaration at least as high as the location's RA is Yes. The attacker
does not see that RA. A successful bypass makes the hit use Schaden and removes
only the outer zone armour's `rwAddon`; the Unterkleidung's `rwSuit` remains in
the threshold. A location covered only by Unterkleidung offers no bypass at all.
When penetration already selects Schaden and ignores all RW, the toggle's own
effect is suppressed so RW is never subtracted twice
(`tests/documents/actor-resistance-roll.test.js › bypasses only the outer armour and keeps the underclothing RW`<br>`tests/documents/actor-resistance-roll.test.js › offers no bypass when only underclothing covers the location`).

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
| **Attack** | WA + the actor's current WF rank · HH active · SV malus | own Ansage first; then melee DK modifier `+3 / 0` or one authored ranged band; then the situational modifier | `tests/documents/roll-dialog.test.js › asks only what the roller answers, numbered in one order`<br>`tests/documents/item-weapon-roll.test.js › offers a melee attack the two reach outcomes as its required context`<br>`tests/helpers/items.test.js › offers only authored ranged bands and preserves their modifiers` |
| **Parry** (melee) | WA + the actor's current WF rank · HH passive · SV malus | own Ansage · DK modifier `+3 / 0` | `tests/documents/item-weapon-roll.test.js › gives a parry passive handling, the same SV malus, and a reach choice` |
| **Dodge** | Beweglichkeit + Akrobatik · armour SV malus | — | `tests/e2e/specs/combat-dodge.spec.mjs › a dodge is Beweglichkeit plus Akrobatik, less the armour step` |
| **Resistance** | Stärke (locked) · RW(Stelle); penetration removes all RW, Rüstung umgehen only `rwAddon` | Rüstung umgehen yes/no against private RA; unless bypassed, the attacker's RB compared against RH into `softer / equal / harder`; the announced Schadenswert, required, and asked only once the comparison or bypass has named the applicable value | `tests/documents/actor-resistance-roll.test.js › requires the RB and the damage, unless a bypass makes the comparison moot`<br>`tests/documents/actor-resistance-roll.test.js › derives the penetration outcome from the RB typed against the RH of the struck location`<br>`tests/documents/actor-resistance-roll.test.js › keeps the damage question closed until the comparison or a bypass names it` |
| **Haltung** | — | which defence is possible at all, and what the next one costs | `tests/helpers/combat-actions.test.js › lets the Haltung decide which defence is possible at all`<br>`tests/helpers/combat-actions.test.js › leaves the first defence unmodified and sums a step onto every one after` |

**Manöver are not a workflow.** A Manöver is not a roll of its own — "alles das
läuft aber unter Angriff" — so it is declared *inside* the attack or parry it
modifies, where the weapon already supplies WA, HH, DK and the SV malus. What is
declared is one number. See [Ansagen](#ansagen).

SV comparisons use **base** Strength. All four rolls
keep the situational modifier (`±3` steps, `±1` to fine-tune), the advantage/disadvantage picker
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
| Input | one optional signed integer, `0` = nothing declared |
| Cost to the declaring roll | `−Betrag` |
| What the defender is told | `Betrag`, if positive |
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
Blank and zero mean the same thing: a Standardangriff
(`tests/documents/roll-dialog.test.js › reads a blank field as nothing declared and a fraction as its whole part`).

**A negative Betrag is the other half of the bargain.** "Um einen anderen zu
erleichtern" needs somewhere to land, and the roll being eased is as often an
attack or parry as not — a Riposte pays on the parry and collects on the next
attack. So the same field takes the collected amount with its sign flipped: `−2`
eases this roll by 2. It is collecting, not declaring, so the card announces nothing to the
defender (`tests/documents/roll-dialog.test.js › eases the roll by a negative Ansage`).
What the amount was earned by is, like everything else here, agreed at the table.

A parry gets the same field — a Riposte is declared on one
(`tests/helpers/combat-actions.test.js › gives a parry the Ansage field`).

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

The attack dialog has no separate "Wohin zielst du?" choice. Aimed-location
effects are part of the free Ansage agreed at the table, not a second modifier
or a second field. Consequently no location price enters the attack threshold,
breakdown, message flags or attack-card envelope.

The defender still opens Resistance by clicking the actually struck zone on
their own paper doll. That local zone selects RH/RW/RA and keeps the damage
multiplier: head ×2, torso/arms/legs ×1. This preserves location-dependent
resistance and damage without claiming that the attack dialog knows the target.

`Rüstung umgehen` has no separate attack control. The attacker declares its
amount through the ordinary Ansage after discussing it with the GM, without
seeing the defender's RA. On Resistance, the defender answers whether that
amount was at least their displayed RA. Yes waives the RB/RH comparison, routes
the hit to Schaden and removes `rwAddon`; `rwSuit` remains. No includes every
lower amount and leaves the ordinary comparison untouched
(`tests/helpers/combat-actions.test.js › never pre-ticks the armour bypass`<br>`tests/documents/actor-resistance-roll.test.js › bypasses only the outer armour and keeps the underclothing RW`).

**Schwachstelle**, whose Erschwernis the GM names, remains a free Ansage and
needs no separate field.

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
(`tests/documents/roll-dialog.test.js › emits the envelope with the amount and no target location`).

```
from · Ansage −n · DK · RB · Schaden / Wucht
```

**One Ansage figure, not one per defence.** Which of the defender's rolls it
lands on was settled out loud when the two players agreed the number, so the card
states the amount and claims nothing about where it applies
(`tests/helpers/dice.test.js › states the Ansage as one figure, not one per defence`).

The envelope carries no target location and never claims that armour was
bypassed. The defender selects the actual struck zone on their own paper doll
and answers the RA question there
(`tests/helpers/dice.test.js › never claims the armour was bypassed, since that is the defenders own call`).

There is no "Gegen dich angesagt" input on attack, parry, dodge, resistance or
ordinary rolls. The card retains the attacker's declaration as a record of what
they paid, but no opposing roll consumes it automatically. Situational effects
are agreed with the GM and entered through the unchanged situational modifier.

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
tracked — the player carries it over and enters it as a negative Ansage. The seven `#TODO` Manöver categories — Fiese Tricks, Automatikfeuer,
Gun-Kata, Gruppenkampftaktik, Einzelkampftaktik, Psychologische Kriegsführung,
Teamführung — are unwritten in the rulebook itself, not merely unimplemented.

The hit location is resolved at the table and then selected by the defender on
their paper doll. The attack dialog neither rolls nor stores a location.

## Open

1. **Should the announced Schadenswert persist between resistance rolls on the
   same actor**, the way `skills.<key>.lastAttribute` does?
2. **What produces the Gleichgewicht steps?** Sich Fangen and Durchatmen both
   spend them and nothing in the rules hands them out. Open whether they are
   Beweglichkeit damage or a separate, self-clearing track — the latter is
   assumed, because the damage model no longer writes to attributes at all.
3. **Is "Schaden in Höhe des verwendeten Schadenswert als Würfel" a roll?**
   **Shipped flat**: the card applies the Schadenswert itself, times the Stelle
   multiplier — the damage track counts in points, and no dice are named. If a
   roll was meant, `appliedDamage` is the one function to change.

Resolved: *does a Manöver carry the weapon's SV malus?* — **yes.** A Manöver is
an attack ("alles das läuft aber unter Angriff"), and SV covers "jede
Angriff/Parade mit dieser Waffe". It now falls out by construction, since a
Manöver is declared inside the attack rather than rolled beside it.
