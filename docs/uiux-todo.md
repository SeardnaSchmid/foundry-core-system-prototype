# UI/UX-Todo

Sammelstelle für alles, was sich in der Bedienung falsch anfühlt. Kein Regelwerk
und kein Code-Plan: hier steht das Problem, wo es auftritt und welche Lösungen
im Gespräch waren. Entschieden wird später; erledigte Einträge wandern nach
unten unter „Erledigt".

Neuer Eintrag: Überschrift mit laufender Nummer, dann **Wo**, **Problem**,
**Ideen**, **Offen**.

## Offen

### 1 · „Deine Ansage": `+` macht den Wurf schlechter

- **Wo:** Roll-Dialog, Zeile „Deine Ansage" (Angriff und Parade) —
  `templates/apps/roll-dialog.hbs`, `_ansageValue` in `module/apps/roll-dialog.mjs`.
- **Problem:** Das Feld ist ein Betrag, der vom Wurf abgezogen wird. `+` drücken
  erschwert also den eigenen Wurf, `−` erleichtert ihn. Seit das Feld auch
  negative Werte nimmt (Bonus aus einer früheren Ansage einlösen), ist es
  faktisch ein Vorzeichen-Regler, der falsch herum läuft.
- **Ideen:**
  1. Feld zeigt die Wirkung auf den Wurf, mit Vorzeichen und Farbe wie die
     situative Modifikation (`−3` rot, `+2` grün, `±0`). `+` erleichtert, `−`
     erschwert. Der Gegner bekommt weiterhin den Betrag angesagt. Nachteil: am
     Tisch sagt man „Ansage 3", im Feld steht `−3`. **Bisheriger Favorit.**
  2. Zwei Zeilen: „Deine Ansage" (nur ≥ 0, erschwert) und „Ansage-Bonus"
     (nur ≥ 0, erleichtert). Zahl entspricht dem Gesagten, kostet aber eine
     Zeile, und `+` bei „Deine Ansage" verschlechtert weiterhin.
  3. Knöpfe nach Wirkung beschriften (`schwerer` / `leichter`) statt `+` / `−`.
     Kleinster Umbau, bricht aber das einheitliche Stepper-Aussehen.
- **Offen:** „Gegen dich angesagt" hat dasselbe Muster (`+` verschlechtert).
  Dort tippt man eine genannte Zahl ab — mit umdrehen oder als Betrag lassen?

## Erledigt

### 2 · Situative Modifikation kennt nur ±3 — erledigt

- **Wo:** Roll-Dialog, Zeile „Situative Modifikation" — `BONUS_STEP` in
  `module/apps/roll-dialog.mjs`, Knöpfe in `templates/apps/roll-dialog.hbs`.
- **Problem:** Am Tisch kam ein ±1 vor (vermutlich ein Ansage-Bonus), das sich
  nicht eintragen ließ. Bei Angriff und Parade geht das inzwischen über eine
  negative Ansage; Ausweichen und normale Fertigkeitswürfe haben kein
  Ansage-Feld und damit weiterhin keinen Weg für ±1.
- **Ideen:** Vier Knöpfe `[−3] [−1] Wert [+1] [+3]`; SL-Schwierigkeit bleibt laut
  `docs/design/dice-system-prd.md` in 3er-Stufen, das PRD bekäme nur den Zusatz,
  dass das Feld Feinjustierung erlaubt.
- **Offen:** Vier Knöpfe passen nicht mehr neben das Label (siehe 3). Vorschlag:
  Label in die erste Zeile, Stepper darunter.

### 3 · „Situative Modifikation" ist lang für den schmalen Dialog — erledigt

- **Wo:** Roll-Dialog in Standardbreite (340 px), dieselbe Zeile wie 2.
- **Problem:** Das Label wurde von „Modifikation" verlängert. Der Stepper kann
  dadurch unter das Label umbrechen. Bisher nicht im laufenden Foundry geprüft.
- **Ideen:** Zusammen mit 2 lösen (Label oben, Stepper darunter), oder das Label
  im Dialog kürzen und nur auf der Chat-Karte ausschreiben.

**Lösung (2 und 3):** Mit dem neuen Würfeldialog (Fragen oben, Beleg-Schublade
über der Schwelle) ist jede Frage eine eigene Zeile: Titel links, Stepper
rechts, `[−3] [−1] Wert [+1] [+3]`. Der Dialog ist 500 px breit. Das PRD hat den
Zusatz zur Feinjustierung bekommen (`docs/design/dice-system-prd.md`).
