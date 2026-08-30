# pts-landscape

**Lernlandschaft-View + Artefakt-Editor + interaktive Stunden-Zuordnung** für
das pts-web-Profil (Umsetzung Stufe 1–3 aus `docs/CONCEPT_WEB_WORKFLOW.md`).

- **Tab „Lernlandschaft“** (`conversation.view`, order 30), zweispaltig:
  - **links** eine **Lernlandschaft-Canvas**: Moment-Karten frei verschiebbar
    (vertikal **und** horizontal; Positionen landen nur in
    `learning-landscape.layout.json`, nie in der Semantik). Standard-
    Anordnung ist ein **vertikal versetzter Fluss** (weil die linke Spalte
    höher als breit ist); die Lehrkraft kann frei umsortieren. Übergänge
    (Pfeile) visualisieren den Lernfluss — **Phasen-Bänder sind daher
    entfernt** (der Fluss ist durch die Pfeile ablesbar).
    Jede Karte hat **„💬 Chat“** (Prompt für genau diesen Lernmoment ins
    Chat-Input, um ihn mit dem Companion zu besprechen) und **„✎ Edit“**
    (**strukturierter Editor nur für diesen Moment** — Titel, Typ, Funktion,
    Lernaktivität, Erwartete Lernerfahrung, Materialbedarfe, Offene Fragen;
    Materialien/Status/Herkunft bleiben erhalten). Ein „Gesamtdokument“-
    Editor für `learning-landscape.md` wird bewusst nicht mehr prominent
    angeboten (fehleranfällig);
  - **rechts** eine feste **Stunden-Zuordnung-Sidebar** (kein Scroll-
    Zusammenspiel beim Ziehen).
- **Kein Genehmigungs-Gate:** Ein Lernmoment wird dadurch akzeptiert, dass
  die Lehrkraft ihn in ein Stundenfenster zieht (die Platzierung wird damit
  `binding`); Übergänge sind als Visualisierung des Flusses direkt gesetzt.
  Es gibt **weder „ENTWURF“- noch „Vorschlag → Übernehmen“-Schritte** im UI —
  die Handlung der Lehrkraft ist die Entscheidung. Der interne `status`
  (`proposed`/`binding`) bleibt im Datenmodell, wird aber nicht als Hürde
  präsentiert; ein Timeline-Save übernimmt den sichtbaren Fluss als
  verbindlich.
- **Übergänge (gerichtet):** Karte auf Karte ziehen öffnet den Übergangs-
  Dialog (`Von → Zu`, Typ, Begründung). Typen nach Schema: `required`,
  `prerequisite`, `choice`, `parallel`, `return`, `meeting_point` — damit
  lassen sich z. B. parallele Einstiege verschiedener Lerngruppen und ihr
  Treffpunkt im Produkt abbilden. Die Übergangs-Liste zeigt alle Pfeile
  (mit Entfernen-Button); erzeugt wird `### tr-<von>-<zu>` unter
  `## Übergänge` in `learning-landscape.md`.
- **Interaktive Stunden-Zuordnung (Stufe 2):** Lernmomente per Drag&Drop auf
  ein Stundenfenster in der Sidebar ziehen erzeugt eine Platzierung in
  `temporal-plan.yml` (Start folgt dem letzten Platzierungsende, Rolle/Modus/
  Dauer direkt editierbar). Mehrere Momente pro Stunde, ein Moment über
  mehrere Stunden — genau das Platzierungs-Modell. Lehrkraft-Züge werden
  `binding` geschrieben; Steward-/Backfill-Vorschläge bleiben `proposed` und
  sind per „✓ Übernehmen“ adoptierbar. „+ Stundenfenster“ liegt direkt über
  der Stunden-Zuordnung.
- **Zeitbedarf + Vollständigkeits-Status:** Jeder Lernmoment kann eine
  Zeitschätzung bekommen (`- Zeitbedarf: <min>`, Feld im aufklappbaren
  Detail). Zugeordnete Momente bekommen einen farbigen Rand: **grün**, wenn
  die zugeordnete Zeit den Zeitbedarf deckt (eine Stunde reicht oder die
  Summe über mehrere Stunden genügt); **orange**, wenn noch etwas fehlt
  (keine Schätzung oder Unterdeckung). Unzugeordnete Momente bleiben neutral.
- **Stunden-Budget:** Jedes Fenster zeigt „Budget X / Y min“; wird das
  Zeitbudget der Stunde überschritten, bekommt das Fenster eine **rote
  Umrandung** mit Hinweis „⚠ Zeitbudget um N min überzogen“.
- **„Stundenverlauf vorschlagen“ (Stufe 3):** Button je Stunde schreibt
  einen konkreten Prompt (Fenster + Platzierungen + Momente) ins
  Chat-Input (`inputActions.setDraft`); die Lehrkraft schickt ab, der
  Companion beauftragt `pts_material`.
- **Material↔Moment-Zuordnung (Stufe 2):** „Material wählen“ im Moment-Kärtchen
  listet Dateien aus `materials/` und `rendered/` mit Metadaten (Titel, Art,
  Status) — **vorgefiltert auf passende** (über `related_moments` der
  Material-Metadaten), mit „alle Materialien zeigen“ als Übersteuerung. Die
  Zuordnung steht im Moment (`- Materialien: […]`); die passenden Material-
  Metadaten kommen aus der YAML-Frontmatter der Materialdateien.
- **Materialentwürfe erzeugen (mit Varianten):** Knopf im Moment-Detail
  schreibt einen Prompt ins Chat-Input (2–3 Varianten aus den
  Materialbedarfen, Ablage unter `materials/` mit Metadaten inkl.
  `related_moments`); der Companion beauftragt `pts_material`.
- **Zugeordnete Materialien editierbar / im Chat:** Jedes zugeordnete
  Material erscheint als Chip (Titel aus den Metadaten) mit „💬 Chat“ —
  das Material lässt sich so direkt mit dem Companion besprechen oder
  überarbeiten lassen.
- **Artefakt-Editor**: „✎ Bearbeiten“ öffnet einen Inline-Editor (md/yml)
  für die fünf kanonischen Dateien. Speichern schreibt die Datei **atomar**
  in den Denkraum zurück — eine Lehrkraft-Handlung, kein
  Approval-Zwischenschritt, kein KI-Schreibpfad.

## Host-Routen

| Route | Zweck |
| --- | --- |
| `GET /api/pts-landscape?sessionId=` | Landscape (Momente, Übergänge, Layout), Temporal-Plan, Entscheidungen als JSON |
| `POST /api/pts-landscape/temporal` | `{ sessionId, title, windows, placements }` — validiert + serialisiert die komplette Timeline |
| `GET /api/pts-landscape/materials?sessionId=` | Dateiliste unter `materials/` + `rendered/` |
| `POST /api/pts-landscape/materials` | `{ sessionId, momentId, materials }` — schreibt `- Materialien: [...]` |
| `POST /api/pts-landscape/moment-estimate` | `{ sessionId, momentId, minutes }` — setzt/löscht `- Zeitbedarf: <min>` |
| `POST /api/pts-landscape/moment` | `{ sessionId, momentId, fields }` — strukturierte Aktualisierung **eines** Moments (Materialien/Status/Herkunft bleiben erhalten) |
| `POST /api/pts-landscape/transitions` | `{ sessionId, from, to, type, rationale }` — legt `### tr-…` unter `## Übergänge` an |
| `POST /api/pts-landscape/transitions/remove` | `{ sessionId, id }` — entfernt einen Übergang |
| `POST /api/pts-landscape/layout` | `{ sessionId, layout }` — nur Positionen in `learning-landscape.layout.json` |
| `GET /api/pts-artifact/raw?sessionId=&file=` | Rohtext einer Datei für den Editor |
| `POST /api/pts-artifact/save` | `{ sessionId, file, content }` — atomarer Schreibzugriff mit harter Pfad-Grenze |

Der Denkraum wird pro Anfrage aus der Session abgeleitet
(`sessions.get(id).header.cwd`, Fallback `sandboxPolicy.workspaceRoot` bzw.
`process.cwd()`), wie bei `pts-denkstand` und `pts-artifact-panel`. Die
Save-/Raw-Routen prüfen realpath-basiert, dass die Zieldatei innerhalb des
Denkraums liegt (`..`/absolute Pfade/fehlende Eltern → abgelehnt), erlauben
nur `md/yml/yaml/json/txt` und begrenzen die Größe (512 KB). Die
Temporal-Route validiert Schemas (Fensterarten, Rollen, Modi, IDs, Minuten)
und schreibt atomar im kanonischen Format — Kommentare aus
Steward-/Backfill-Schrieben gehen bei einer Lehrkraft-Speicherung verloren
(Status `proposed` bleibt erhalten).

## Installation (einmalig pro Rechner)

1. **Junction** ins pts-web-Profil (Muster der bestehenden PTS-Plugins):

   ```powershell
   New-Item -ItemType Junction `
     -Path "$env:USERPROFILE\.dsh\profiles\pts-web\node_modules\pts-landscape" `
     -Target "F:\code\pedagogical-thinking-space\dsh-plugins\pts-landscape"
   ```

2. **Patch-Row** in `$env:USERPROFILE\.dsh\profiles\pts-web\cordis.patch.yml`
   (in den bestehenden `- insert:`-Block):

   ```yaml
   # PTS Lernlandschaft: Moment-Karten + Artefakt-Editor
   # (conversation.view-Tab "Lernlandschaft", order 30; Host-Routen
   # /api/pts-landscape, /api/pts-artifact/raw|save, /api/pts-landscape/layout).
   - id: pts-landscape
     name: pts-landscape
     inject: [webServer]
   ```

3. **DSH neu starten.** Kein HMR im Web-Profil; nach dem Neustart ggf.
   hart aktualisieren (Strg+Umschalt+R).

## Tests

```bash
node dsh-plugins/pts-landscape/test-landscape.mjs
```

Abgedeckt: Host-Modulform, Landscape-Parser (reale Datei + synthetische
Vorlage mit Flow-Listen, Übergängen und `Zeitbedarf`), Layout-Parsing
(Positionen + Phasen-Bänder), Pfad-Grenze der Save-Route (Traversal,
absolute Pfade, Dateityp, fehlender Elternordner), atomarer Schreibzugriff,
Temporal-/Decisions-Parser inkl. `proposed`, Timeline-Serializer-Roundtrip,
Timeline-Validierung, Material-Zuordnung (`setMomentMaterials`), Zeitbedarf
(`setMomentEstimate`), Übergänge (`addTransition`/`removeTransition`) und
strukturierte Moment-Aktualisierung (`updateMoment`).

## Grenzen (bewusst)

- Der Editor und die Drag&Drop-Zuordnung ersetzen keine Delegation: Der
  Companion selbst schreibt weiterhin nur über `pts_edit` nach erkennbarer
  Entscheidung; die UI ist das Werkzeug der Lehrkraft.
- Die Temporal-Route schreibt die komplette Timeline deterministisch neu
  (Kommentare gehen verloren, `status` bleibt erhalten).
- Offene-Fragen-Panel, „Nächster Schritt“-Karte und Dokument-Buttons sind
  Stufe 4 (`docs/CONCEPT_WEB_WORKFLOW.md`).
