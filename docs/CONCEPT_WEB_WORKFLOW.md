# Konzept: Web-Workflow Lernlandschaft → Stundenplanung

> Ziel: Der Denkraum wird im Browser zum Arbeitsort. Die Lehrkraft sieht die
> Lernlandschaft, arbeitet Lernmomente aus, ordnet Materialien zu, verteilt
> Lernmomente auf Schulstunden und lässt pro Stunde einen Verlaufsplan
> vorschlagen — ohne DSH zu verlassen. Der Companion behält offene Fragen und
> Entscheidungen im Blick und legt die relevanten Dokumente sichtbar „auf den
> Tisch“.

Grundsatz: **Die Lehrkraft handelt, der Companion denkt mit.** Jede direkte
UI-Handlung (Bearbeiten, Zuordnen, Verteilen) ist eine Lehrkraft-Entscheidung
und schreibt direkt in die kanonischen Dateien. KI-Aktionen (Steward,
Worker) bleiben Vorschläge (`draft`/`proposed`), bis die Lehrkraft sie
übernimmt. Es entsteht kein zweiter Dispatcher oder Registry-Mechanismus.

---

## 1. Bestehende Bausteine (Stand)

| Baustein                                             | Kann heute                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pts-denkstand` (Tab „Denkstand“)                    | Planning Board als Brett, `temporal-plan.yml` als Timeline (Fenster + Platzierungen), Entscheidungen; Auto-Refresh 5 s |
| `artifact-panel` (Tab „Artefakte“)                   | Galerie produzierter Dateien, Vorschau (md/html/pdf/Bild), Download, Chips im Chat — **kein Editieren**                |
| `pts-workspaces`                                     | Denkraum anlegen/löschen, harte Pfad-Grenze (Vorbild für Save-Routen)                                                  |
| `pts-workspace-snapshot` (Preset)                    | injiziert pro Turn Status, offene Fragen, Board, Entscheidungen in den Companion                                       |
| Worker (`pts_material`, `pts_edit`, `pts_review`, …) | Erzeugen/überarbeiten Artefakte, Verlaufspläne, Review                                                                 |

Fehlend: grafische Lernlandschaft, Artefakt-Editor, Material↔Moment-Zuordnung,
interaktive Stunden-Zuordnung (Drag&Drop), „Stundenverlauf vorschlagen“,
Offene-Fragen-Panel und prominente Dokument-Buttons.

## 2. Datenfluss (kanonisch, unverändert)

```text
learning-landscape.md   # Lernmomente (draft|stable|needs_review) + Übergänge
learning-landscape.layout.json  # nur Positionen/Gruppen (keine Semantik)
temporal-plan.yml       # windows = Stunden/Fenster; placements = Moment↔Fenster
planning-board.yml      # Lehrer-Arbeit (Klären→Vorbereiten→Auswerten→Bereit)
decisions.yml           # erkennbare Lehrkraft-Entscheidungen
materials/              # reviewte Material-Drafts (Material-IDs)
```

Jede UI-Interaktion unten schreibt ausschließlich in diese Dateien —
atomar, pfad-geprüft (Vorbild `pts-workspaces`), ohne semantische Dateien zu
streifen (Layout-Änderungen berühren nie die Landscape).

## 3. Schritt 1 — Lernlandschaft grafisch

- **Neu:** View „Lernlandschaft“ (eigener Tab oder Teil des Denkstand-Tabs):
  Moment-Karten aus `learning-landscape.md` (Titel, Typ, Funktion,
  Lernaktivität, Status-Badge, Offene Fragen) positioniert über
  `learning-landscape.layout.json`; Übergänge als Pfeile.
- Klick auf eine Karte öffnet die Details (rechte Spalte) mit den
  Pflichtfeldern + Offenen Fragen + „Bearbeiten“.
- Vorschlags-Zustände sichtbar: `draft` (Begleiter/Steward) vs. `stable`
  (Lehrkraft übernommen) vs. `needs_review` — Badge wie im Board.

## 4. Schritt 2 — Ausarbeitung im Editor (ohne DSH zu verlassen)

- **Neu:** „Bearbeiten“-Button auf jedem Artefakt (Landscape, Temporal-Plan,
  Learning Design, Materials, Proposals). Öffnet einen Inline-Editor
  (md/yml, Zeilennummern, Save/Cancel).
- **Neu:** Host-Route `POST /api/pts-artifact/save` — schreibt die
  Lehrkraft-Änderung atomar in die Datei zurück, mit derselben harten
  Pfad-Grenze und Realpath-Prüfung wie `pts-workspaces`.
- **Kein Approval-Zwischenschritt:** Es ist die Lehrkraft selbst, die
  schreibt — keine KI. Der Companion erfährt von der Änderung über den
  Denkstand-Snapshot im nächsten Turn (Hashes ändern sich) und reagiert
  darauf (z. B. „Die Stundenzuordnung sieht jetzt so aus …“).
- Grenze: Der Editor ersetzt nie die Delegation — der Companion selbst editiert
  weiterhin nur über `pts_edit` nach erkennbarer Entscheidung.

## 5. Schritt 3 — Materialien Lernmomenten zuordnen

- Im Moment-Kärtchen: „Materialbedarfe“ (offene Bedarfe) und „Materialien“
  (vergebene Material-IDs).
- **Zuordnung:** Auswahl aus der Artefakt-Galerie (`materials/`, `rendered/`)
  → schreibt die Material-ID in den Moment-Block (`- Materialien: [mat-x]`).
- Änderungen an `materials/` selbst (neue Drafts) bleiben Worker-/Lehrkraft-
  Ablage wie bisher; das Kärtchen referenziert nur.

## 6. Schritt 4 — Stunden-Zuordnung per Drag&Drop (Gesamtplanung)

- **Timeline wird interaktiv:** Links die Moment-Karten (oder ein
  „Zuordnen“-Modus im Denkstand-Tab), rechts/unterhalb die Stunden-Fenster
  (`windows` aus `temporal-plan.yml`).
- **Drag&Drop Moment → Fenster** erzeugt eine Platzierung
  (`placements`): `moment_id`, `window_id`, `start_minute`, `duration_minutes`,
  `dramaturgical_role`, `mode`.
- **Semantik:** Ein Fenster kann mehrere Momente enthalten (mehrere
  Platzierungen), ein Moment über mehrere Stunden verteilt sein (mehrere
  Platzierungen in verschiedenen Fenstern) — exakt das Platzierungs-Modell.
- **Status:** Die Lehrkraft-Handlung ist eine Entscheidung → geschriebene
  Platzierungen erhalten `status: binding`. Steward-/Backfill-Vorschläge
  bleiben `proposed` und zeigen einen „Übernehmen“-Button (Badge
  „Vorschlag“/„Verbindlich“). Fenster anlegen/umbenennen/Zeiten ändern
  direkt im Editor.
- Minuten prüfen: Platzierungen enden innerhalb ihres Fensters (45/60/90 Min.),
  Überbuchung nur mit sichtbarer Notiz.

## 7. Schritt 5 — „Stundenverlauf vorschlagen“ je Stunde

- Button unter jedem Stunden-Fenster mit mindestens einer Platzierung.

- **v1 (empfohlen):** Der Button schreibt einen konkreten Prompt in den
  Chat-Composer, z. B.:
  
  > „Erstelle einen Verlaufsplan für tw-01 (Stunde 1 – …): Lernmomente
  > lm-a (0–18′, irritation) und lm-b (18–52′, deepening) gemäß
  > learning-landscape.md und temporal-plan.yml, angepasst an die
  > Entscheidungen in decisions.yml. Ziel: konkrete Unterrichtsplanung in
  > 45 Minuten.“
  > Die Lehrkraft schickt ab → der Companion delegiert an `pts_material`
  > (sichtbar, `run_in_background: true`). Der Kreis bleibt sichtbar und die
  > Lehrkraft Autorin des Auftrags.

- **v2 (später, optional):** Direkter Subagent-Start über eine Host-Route mit
  sichtbarem Job — erst wenn v1 im Alltag zu vielen Klicks führt.

## 8. Companion hält offene Fragen/Entscheidungen im Blick

- **Bereits vorhanden:** `pts-workspace-snapshot` injiziert pro Turn den
  Denkstand (Status, Board, Entscheidungen, offene Fragen); der Steward
  liefert `next_turn_hint` (höchstens eine offene Frage).
- **Neu (UI):**
  - „Offene Fragen“-Panel (aus Landschafts-Momenten + Board-Klärungen +
    Snapshot), dezent, immer sichtbar.
  - „Nächster Schritt“-Karte: der Companion benennt genau EINEN nächsten
    notwendigen Schritt (aus Snapshot + Steward-Hint); die Karte hat den
    passenden Aktions-Button („Öffnen“, „Zuordnen“, „Vorschlagen“).
  - **Dokument-Buttons:** Nach jedem Worker-Ergebnis und Steward-Lauf zeigt
    die Antwort prominente „Öffnen“-Buttons auf die berührten Dokumente
    (Lernlandschaft, Timeline, Planungsboard, Entscheidungen, Material) —
    sie öffnen die Artefakt-/Denkstand-Ansicht direkt. Immer wenn sich etwas
    ändert (Snapshot/Activity-Stream als Auslöser für einen dezenten Hinweis).

## 9. Umsetzungsreihenfolge

1. **Landschaft + Editor:** „Lernlandschaft“-View (Karten + layout.json) und
   Artefakt-Editor mit `POST /api/pts-artifact/save` (Pfad-Grenze).
2. **Zuordnung:** Material↔Moment-Auswahl und Drag&Drop-Platzierungs-Editor
   (schreibt `windows`/`placements`, Status-Regeln wie §6).
3. **Verlaufsplan-Button v1** (Composer-Prompt) — danach optional v2.
4. **Begleit-UI:** Offene-Fragen-Panel, „Nächster Schritt“-Karte,
   Dokument-Buttons nach Turns.
5. **Wiki-Integration** (siehe `docs/CONCEPT_MEMORY_AND_KNOWLEDGE.md` §4a)
   als eigene Spur.

Jede Stufe bleibt einzeln nutzbar; die kanonischen Dateien und die
DSH-Delegation (Worker/Steward) bleiben unverändert die einzige Wahrheit.
