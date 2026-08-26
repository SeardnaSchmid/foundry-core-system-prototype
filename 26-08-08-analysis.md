
1. Die Standard-Trefferzone ist nirgends definiert. Zonen entstehen nur durch Ansage (Gezielte Angriffe/Schüsse). Was trifft ein Standardangriff — immer Torso? Ohne das hat der Umschlag kein Default für Stelle.
   1. ja, es ist immer torso, wenn nichts angesagt ist.
2. RA hat außerhalb von 'Rüstung umgehen' keine Funktion. Über alle Regeldateien gegreppt: RA taucht nur in der Rüstungstabelle und als Preis fürs Umgehen auf. Nicht im Widerstandswert, nicht im Penetrationsvergleich. Soll es mehr tun?
   1. noch nicht bekannt... aber vermutlich nicht
3. Welches Attribut nimmt Torso- und Kopfschaden? Arme und Beine sind explizit gesplittet, für Torso/Kopf steht nur "auf körperliche Attribute" (attribute.md:226). Stärke?
   1. stärke
4. Wuchtschaden → Gleichgewicht ist nicht beziffert. "Durchatmen" spricht von Stufen aus dem Gleichgewicht (kampfregeln.md:577, 829), aber wo die herkommen, steht nirgends.
   1. wuchtschadne geht auf beweglichkeit? durchatmen lässt diese reduzieren..? aktuell glaube ich nicht wichtig.. es reduziert quasi pro runde wuchtschaden...
5.


Recalled a memory, saved 3 memories
Notiert. Zwei davon greifen tiefer, als sie aussehen.

1 + 3 zusammen machen das Regelwerk stimmig
Torso als Default und Torso/Kopf → Stärke ergibt zusammen mit attribute.md:233-235 genau das, was die Fertigkeitsbeschreibung verspricht:

Stelle	Attribut	bei 0	Fertigkeitstext (fertigkeiten.md:350)
Torso (Default)	Stärke	tot	"in die Brust zu schießen ist gut um ihn zu töten"
Kopf	Stärke ×2	tot, schneller	—
Arme	Fingerfertigkeit / Stärke	keine Handaktionen	"jemanden entwaffnen"
Beine	Beweglichkeit / Stärke	nur noch kriechen	"an der Flucht hindern"
Der Standardangriff tötet, und die Ansage ist der Weg, nicht zu töten. Das ist keine Interpretation von mir — die Fertigkeit sagt es wörtlich, und deine Antwort schließt die Lücke, die das mechanisch trägt.

Folge für den Umschlag: die Schadensregel ist jetzt vollständig aus der Stelle ableitbar. Das Feld fliegt raus — B schlägt in einer Vierzeilentabelle nach. A sagt nur noch die Stelle an, und wenn er nichts sagt, ist es Torso.

2 hat einen Haken, der 'Rüstung umgehen' wertlos macht
Wenn RA sonst nichts tut, dann kostet "Erschwere deinen Angriff um die Rüstungsabdeckung und ignoriere sie dafür" einen echten Preis für exakt null Gegenwert. RA steht weder im Widerstandswert (Stärke + RW − Schadenswert) noch im Penetrationsvergleich (RH vs. RB/RD) — es gibt nichts zu ignorieren.

Ich glaube, das ist ein Lesefehler im Satz, nicht eine fehlende Regel: "sie" ist die Rüstung, nicht die Abdeckung. Also — zahle die RA der Stelle, und die Rüstung dort gilt nicht: kein RW im Widerstand, kein RH im Vergleich, damit automatisch Scharfer Schaden.

Damit hat RA auch endlich einen Sinn, ohne dass du eine Regel erfinden musst: RA ist das Preisschild fürs Umgehen. Gut abgedeckt = teuer zu unterlaufen, exakt das, was "wie gut die Rüstung die Stelle bedeckt" bedeuten sollte. Und es passt zum Fertigkeitstext zwei Sätze weiter: "was, wenn er seine Brust so dick eingepackt hat, dass du nicht durchkommst?" — genau dafür ist das Manöver da.

Wenn du das so liest, bleibt RA-Funktion = "nur Preis" (deine Antwort steht), aber das Manöver wird auf einen Schlag das stärkste im Buch.

4 — Deferred akzeptiert, aber deine zwei Antworten widersprechen sich
Kein Drama, nur damit's nicht verlorengeht: #3 sagt Torso → Stärke, #4 sagt Wuchtschaden → Beweglichkeit. Ein nicht-penetrierender Treffer auf den Torso ist beides.

Wahrscheinlich sind es zwei getrennte Dinge, die derselbe Treffer auslöst:

Schaden (der WS-Wert als Würfel) → Attribut nach Stelle, also Stärke. Wie jeder Schaden.
Gleichgewicht → ein eigener Malusstufen-Zähler, der sich pro Runde abbaut (Sich Fangen: "baut automatisch eine Stufe ab"; Durchatmen: "wieder voll im Gleichgewicht").
Der Unterschied ist wichtig, weil kein anderer Attributschaden im Kampf heilt — wenn Gleichgewicht Beweglichkeitsschaden wäre, hättest du plötzlich selbstheilende Attribute und über attribute.md:228 auch noch schwankende Initiative. Als eigener Zähler ist es sauber, bleibt eigener Zustand auf B's Bogen, und überquert die Grenze nie. Aber: unbeziffert bleibt unbeziffert, das kann warten.

Was jetzt noch offen ist
Nur noch eins — der Punkt, den du oben zitiert, aber nicht beantwortet hast: kriegt der Kürzere −3 oder 0? Der Regeltext gibt nur dem Längeren +3, das System implementiert +3 / 0 / −3. Der Abstand zwischen den beiden ist dadurch 6 statt 3, also eine volle Stufe Unterschied — der einzige verbliebene Punkt, wo Regeltext und Code auseinandergehen.

Sag mir das, dann ist der Umschlag komplett:

A → B:  von · Verteidigung −X · Widerstand −Y · Stelle (Default Torso)
        · Rüstung umgangen ja/nein · RB/RD · Scharf · Wucht
B → A:  getroffen ja/nein · Schaden ja/nein
bitte halte dich an den regeltext... :)

bevor du was implementierst, fasse alles nochmal zusammen

Verstanden — Regeltext gewinnt: +3 nur für den Längeren, sonst 0. Damit wird aus der Dreifachauswahl eine Ja/Nein-Frage ("habe ich den längeren?"), und Unterlaufen dreht sie einfach um. Hier die Gesamtzusammenfassung, nichts implementiert.

Kampf-Workflow — Stand der Diskussion
A. Das Prinzip
Jeder Wert im Kampf fällt in genau eine von drei Kategorien, und die Kategorie bestimmt, wie er ins UI kommt:

Kategorie	Herkunft	Eingabeart
Eigener Zustand	eigener Bogen	wird gelesen, nie gefragt
Geteilte Beobachtung	die Fiktion; beide sehen sie, jeder trägt sie selbst ein	Auswahl
Angesagtes Ergebnis	die Gegenseite hat gerechnet und nennt die Zahl	getippte Zahl
Fällt ein Wert in keine, ist es echte Kopplung — und dann ist die Regel das Problem, nicht der Code. Kein Bogen liest je einen fremden Bogen.

B. Was auf welchem Bogen liegt
A	B
Haltung	Haltung — entscheidet allein, ob und womit B verteidigt
Waffe: WA, FV, SV, DK, HH, RB/RD, SS, WS	Rüstung je Stelle: SV, RH, RW, RA
Manöverfertigkeiten (= Ansage-Umrechnung)	Zähler Parade/Ausweichen (erlischt bei neuer Haltung)
Marke "ich binde X" (max. 1)	Marken "X bindet mich" (beliebig viele)
Marke "Riposte gegen X +n"	Gleichgewichtsstufen
stehende Angriffshaltung + Zähler	Attribute (Schaden landet direkt drauf)
Die Bindungsmarke schreibt immer der, der das Ereignis erlebt — B wird getroffen und trägt sich selbst ein. Niemand schreibt fremd.

C. Der Ablauf
0 — Aktivierung. A sagt Handlung und Haltung laut an (kampfregeln.md:166). Das ist regelseitig gefordert, kein Zugeständnis an die Technik.

1 — Angriff (A). Schwelle = WA + Waffenfertigkeit + HH + DK-Mod − SV/FV. Alles eigener Bogen. Von B braucht A nichts außer der geteilten Beobachtung "habe ich den längeren?". Einzige Ausnahme: bei Rüstung umgehen nennt B den Preis, weil die RA B gehört.

2 — Verteidigung (B). B's Haltung sagt, was geht: En Garde → Ausweichen oder Parade · In Deckung / Vorsichtige / Schnelle Bewegung → nur Ausweichen · Ringen / Durchatmen → nichts. Von A braucht B eine Zahl: die Summe der Ansagen. Nicht welches Manöver, nicht welche Waffe, nicht A's Wurf.

3 — Widerstand & Schaden (B). Schwelle = Stärke (aktuell) + RW(Stelle) − Schadenswert, +3 wenn RH > RB/RD. A liest seine Waffenkarte vor, B vergleicht und wählt Scharf oder Wucht, würfelt, und trägt den Schaden auf seine eigenen Attribute ein.

D. Der Umschlag — vollständig
geteilte Beobachtung:  längere Waffe?  →  +3 / 0   (jeder für sich)
A → B:  von              "Anton"
        Verteidigung     −X
        Widerstand       −Y
        Stelle           Torso (Default) | Kopf | Arme | Beine
        Rüstung umgangen ja/nein
        RB/RD · Scharf · Wucht
B → A:  getroffen ja/nein · Schaden ja/nein        (für Bindung lösen)
B → A:  Preis n                                     (nur vor 'Rüstung umgehen')
Acht Werte hin, zwei Bits zurück. Mehr überquert nie die Grenze.

E. Manöver — eine Formel für alle
Das ist der eigentliche Fund. Der Abschnitt sagt selbst "normale Ansageregeln gelten hier auf alles" — die "maximal um die Höhe deiner X Fertigkeit"-Sätze in den einzelnen Manövern sind also keine harten Caps, sondern schlecht formulierte Wiederholungen der 1:1-Grenze. Die allgemeine Regel gewinnt, und ihr eigenes Beispiel beweist es: Geschickte Angriffe 2, 3er Finte — also über dem Rang.

Damit hat jedes Manöver dieselbe Form:

kosten(betrag, rang) = betrag <= rang ? betrag : rang + 2*(betrag − rang)
A zahlt:   kosten(betrag, rang)      auf seinen eigenen Wurf
B trifft:  betrag                     (nicht die Kosten!)
Beispiel aus dem Buch: Rang 2, Betrag 3 → A −4, B −3. ✓

Manöver	Fertigkeit	Betrag	Wirkt auf
Finte	Geschickte Angriffe	frei	gegn. Parade/Ausweichen
Riposte	Geschickte Angriffe	frei	eigener nächster Angriff vs. ihn
Starker Schwung	Distanzkontrolle	frei	gegn. Widerstand + Parade
Weiter Schwung	Distanzkontrolle	frei	gegn. Ausweichen
Arme	Gezielter Stich / Angesagter Schuss	fix 3	Stelle = Arme
Beine	dito	fix 3	Stelle = Beine
Kopf	dito	fix 6	Stelle = Kopf
Rüstung umgehen	dito	= RA der Stelle	Rüstung dort gilt nicht
Schwachstelle	dito	GM nennt	GM nennt
Nicht deklarierbar, sondern stehende Boni (Kosten 0, Bonus = Rang) — gehören in denselben Resolver wie SV/FV/DK, keine neue Maschinerie: Abtauchen, Unterlaufen, Positionierung, Auf Abstand halten, Defensiver Kampf, Deckung nutzen.

Voraussetzungen bleiben Voraussetzungen: Starke Angriffe nur mit Reichweitenvorteil, Defensiver Kampf/Deckung nutzen nur in bestimmten Haltungen.

F. Entscheidungen aus dieser Session
Standardangriff ohne Ansage trifft immer Torso.
Torso und Kopf → Stärke (Kopf verdoppelt nach dem Widerstandswurf). Damit tötet der Standardangriff, und die Ansage ist der Weg, nicht zu töten — genau was fertigkeiten.md:350 verspricht.
Die Schadensregel ist damit allein aus der Stelle ableitbar — der Umschlag braucht das Feld nicht.
DK: +3 für den Längeren, 0 sonst (Regeltext).
Wuchtschaden → Gleichgewicht bleibt deferred.
G. Was im Regeltext klemmt
Fundstelle	Problem
kampfregeln.md:919	"Deckung nutzen" reduziert laut Text "Defensiver Kampf" — Copy-Paste, bestätigt über fertigkeiten.md:93
Manöver-Überschriften	Drei Sektionen heißen anders als ihre Fertigkeit: Gezielte Angriffe → Gezielter Stich, Gezielte Schüsse → Angesagter Schuss, Starke Angriffe → Distanzkontrolle
fertigkeiten.md:73-99	Einzelkampftaktik hat keine Fertigkeit in der Liste
kampfregeln.md:853	"ignoriere sie" — wenn "sie" die Abdeckung meint, kostet das Manöver etwas und bringt nichts. Muss "die Rüstung" heißen (RH + RW fallen weg), sonst hat RA gar keine Funktion
kampfregeln.md:420-429	Paradewert-Formel führt HH nicht — die Nahkampfwaffentabelle schon ("Basismodifikator für alle Angriffe / Paraden")
Widerspruch #2 ↔ #5	Torso → Stärke, aber Wuchtschaden → Beweglichkeit. Ein nicht-penetrierender Torsotreffer ist beides. Vermutlich zwei getrennte Effekte: Schaden auf Stärke plus ein eigener Gleichgewichtszähler
H. Wo Code und Regeltext auseinandergehen
DK-Modifikator: implementiert ist +3 / 0 / −3, Regel sagt +3 / 0. Betrifft combat-workflow-prd.md:61, die Auswahllisten in Angriff und Parade, und die zugehörigen Tests.
Open Question 1 der PRD ist beantwortet: "Trägt ein Manöver den SV-Malus der Waffe?" → ja. kampfregeln.md:491 sagt "alles das läuft aber unter Angriff", und SV gilt für "jede Angriff/Parade mit dieser Waffe". Heute nicht angewandt.
Ansagen sind freie Ganzzahlen, keine ±3-Vielfachen — das Stufenvokabular deckt sie nicht ab, das Komponentenmodell schon.
Der Rückkanal (getroffen/Schaden) und der Umschlag existieren noch gar nicht; in der PRD steht dafür "no hand-off between them".
Offen ist damit nur noch der fehlende Cap-Satz bei Arme/Beine/Rüstung umgehen — aber wenn E stimmt, löst sich das von selbst, weil die allgemeine Ansageregel ohnehin auf alles gilt.

Wenn das so passt: soll ich es als Abschnitt in docs/design/workflows/combat-workflow-prd.md schreiben, oder lieber als eigenes Dokument daneben, weil es Regeln und Workflow-Protokoll mischt?
