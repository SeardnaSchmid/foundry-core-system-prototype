# Inventory System Redesign — Strukturierter Arbeitsauftrag

## 📋 Anforderungen (vom User strukturiert)

### Phase 1: UI/UX Redesign — Slot-Grid

#### 1.1 Platznutzung optimieren
- **Problem**: Drag-Drop-Symbol & Text sind zu groß
- **Ziel**: Mehr Inhalte pro Box, kompaktere Layout
- **Betroffen**: `templates/actor/parts/actor-slot-grid.hbs` + `src/scss/components/_inventory.scss`

#### 1.2 Item-Stats im Hover anzeigen
- **Ziel**: Auf Hover/Fokus wichtigste Stats sichtbar (Type, Slots, Weight, Quantity)
- **Option A**: Tooltip/Popover
- **Option B**: Inline-Vorschau
- **Betroffen**: `templates/actor/parts/actor-slot-grid.hbs`, ggfs. neuer Template

#### 1.3 Slot-Overflow-Visualisierung (gelb/rot-Warnung)
- **Regel**: Wenn Items über das Limit gehen:
  - **Grün**: Slots 1-N innerhalb des Limits (normal)
  - **Gelb/Warning**: Slots N+1, N+2... die überlaufen
  - **Sichtbar**: Überlaufende Items müssen immer noch angezeigt werden
- **WICHTIG — Kein Offset**: 
  - Es wird NICHT ein Slot freigehalten, wenn ein 2er-Item nicht mehr komplett reinpasst
  - Beispiel: 3 Slots total, 2 Items à 1 Slot, 1 Item à 2 Slots → Slot 3+4 sind beide Teil des Items (3: grün, 4: gelb)
  - Alle Slots werden aufgefüllt, Überlauf wird sichtbar
- **Bestehendes Label bleibt**: „überlädt eins läuft mehr..."
- **Betroffen**: Slot-Rendering-Logik in `actor-sheet.mjs` (Zeilen 522-554), Styles in `_inventory.scss`

#### 1.4 Drag-Drop Sortierungs-Visualisierung
- **Problem**: Beim Ziehen eines Items ist nicht klar, wo es landen wird
- **Ziel**: Visuelles Feedback (z.B. Placeholder, Highlight, Zwischen-Position)
- **Gilt für**: 
  - Items mit Slots
  - Items ohne Slots (Trinkets-Band)
  - Items ohne Gewicht
- **Betroffen**: `actor-sheet.mjs` (Drag-Handler, Zeilen 1087-1115), CSS Hover-States

---

### Phase 2: Dialog-Verbesserungen

#### 2.1 Delete-Button in Item-Dialogen
- **Ort**: Basic-Tab des Item-Sheets
- **Anforderung**: 
  - Button mit Bestätigungsdialog
  - Nur wenn Item nicht vom Actor getragen wird (?)
- **Architektur-Note**: Item-Dialoge sind Item-Level (nicht Actor-Level), also braucht es `.item.delete()` Aufruf
- **Betroffen**: 
  - `templates/item/item-sheet.hbs` (Header oder Tab-Footer)
  - `module/sheets/item-sheet.mjs` (Click-Handler)

#### 2.2 Waffen- & Item-Dialog Struktur (später)
- **Status**: Vorerst ausklammern?
- **Notiz**: Dialog-Architektur erkannt, kann später optimiert werden

---

### Phase 3: Inventory-Tab Erweiterungen

#### 3.1 Zahlungsmittel-Komponente
- **Aktuelle Basis**: Trinkets-Band existiert bereits (Items mit `slots: 0`)
- **Ziel**: Spezialisierte Anzeige für Währung/Geld
- **Frage**: Sollen Credits/Gold als separater Block oder in Trinkets integriert sein?
- **Betroffen**: `actor-items.hbs`, ggfs. neue Komponente

#### 3.2 Power-User Tabellenansicht (optional/später?)
- **Umfang**: Waffen, Armor, Items (organisiert nach Type)
- **Features**: Sortierbar, Filter nach Typ, Inline-Quantität-Edit
- **Implementierungs-Optionen**:
  - **A**: Toggle-View in `actor-items.hbs` (Listenansicht ↔ Tabellenansicht)
  - **B**: Separate Dialog/App (wie `TnoHeatmapLab`)
  - **C**: Neue Actor-Sheet-Tab
- **Status**: MVP-Frage an User

---

### Phase 4: Regelsystem-Integration (Später — separate Anforderungen)

#### 4.1 Papier-Doll Regeln
- **Aktueller Stand**: Papier-Doll existiert, Suit + 4 Zonen (Kopf, Torso, Arme, Beine)
- **Fehlt**: Kleidungs-/Unterkleidungs-Regeln für Berechnung & Anzeige
- **Status**: **User muss Regeln beschreiben** → separater Ticket

#### 4.2 Waffen ausklammern (für Phase 1)
- ✓ Erkannt & ausgeschlossen

---

## 🗂️ Code-Anatomie (recherchiert)

### Kernkomponenten & Dateipfade

| Feature | Template | Logik | Styles |
|---------|----------|-------|--------|
| **Slot-Grid** | `templates/actor/parts/actor-slot-grid.hbs` | `module/sheets/actor-sheet.mjs:522-554`, `module/helpers/inventory.mjs` | `src/scss/components/_inventory.scss` |
| **Papier-Doll** | `templates/actor/parts/actor-paperdoll.hbs` | `actor-sheet.mjs:522-554` | `css/tno.css:1814-1933` |
| **Trinkets (0-Slots)** | `actor-slot-grid.hbs:84-103` | `inventory.mjs:buildSlotGrid()` | `_inventory.scss:.slot-trinkets` |
| **Item-Dialog** | `templates/item/item-sheet.hbs` + Type-spezifisch | `module/sheets/item-sheet.mjs` | `css/tno.css` |
| **Inventory Admin** | `templates/actor/parts/actor-items.hbs` | `actor-sheet.mjs` (Event-Handler) | `css/tno.css` |

### Aktuelle Slot-Farben (SCSS)
```scss
$c-zone-filled: #7f9a62;           // Grün (gefüllt)
$c-zone-filled-bg: #dfe8d5;        // Helles Grün (BG)
$c-zone-bare: #b0b2ad;             // Grau (leer)
$c-warning: (rot — needs lookup)   // Überlastung
```

### Zwei orthogonale Achsen
1. **Carrying** (`item.system.carried` Boolean): Slot-Budget (0-Items = kostenlos)
2. **Wearing** (`actor.system.equipment` Zone→ItemID): Papier-Doll Rüstung

---

## ✨ Entscheidungen (User-Input)

✅ **Slot-Grid Phase 1**: ALLES dabei
- Platznutzung optimieren
- Slot-Overflow-Visualisierung (Gelb)
- Drag-Drop Sortierungs-Feedback
- Item-Stats auf Hover

✅ **Delete-Button**: Nur für freie Items (wenn nicht vom Actor getragen)

✅ **Power-User Tabellenansicht**: Separates Ticket später (out-of-scope Phase 1)

✅ **Zahlungsmittel**: Auch separates Ticket später (out-of-scope Phase 1)

---

## ✅ Verifikation (wenn umgesetzt)

1. **Slot-Overflow**: Item mit 2 Slots auf Char mit 3 verfügbar → Slot 3 in Gelb
2. **Drag-Visualisierung**: Beim Ziehen eines Items sichtbar, wo es sortiert wird
3. **Item-Stats Hover**: Stats sichtbar ohne Dialog zu öffnen
4. **Delete-Button**: Dialog mit Bestätigung, Item wird gelöscht
5. **Zahlungsmittel**: Sichtbar im Inventory-Tab
6. **Kein UI-Bruch**: Bestehende Funktionalität (Wear/Unwear, Carry/Stow) intakt