# PTS Web Spike: Workspace-Navigation und Startzustand

> **Status:** abgeschlossen · **Ergebnis: PASS nach Fehlerbehebung**
> (die erste „PASS“-Meldung war durch einen Falsch-positiven Listentest
> verfrüht; die Nutzer-Reproduktion führte zur echten Ursache und ihrem Fix —
> siehe §13)
> 
> Vorgänger-Dokumente: `DSH_PTS_WEB_PROFILE.md` (pts-web-Profil),
> `DSH_NATIVE_WORKSPACE.md` (Kernel-Verifikation der Workspace-Struktur).

---

## 1. Verwendete Versionen

| Komponente               | Wert                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| DSH (`@deepseek-ai/dsh`) | **0.1.1-rc.2**                                                              |
| Installationspfad        | `C:\Users\Joachim\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh` |
| pts-web-Profil           | `$DSH_HOME\profiles\pts-web`, Fallback-Port **3081**                        |
| Standard-Web             | Port **3080**, während des gesamten Spikes unangetastet (PID konstant)      |
| Testwerkzeug             | CDP-gesteuertes Chrome (Temp-Profil), Treiber `scripts/pts-web-ui-test.mjs` |

## 2. Verwendete Slots und Services (aus dem installierten Code verifiziert)

| Fläche                    | Mechanik                                                                                                                                                                                                                                            | Quelle                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Linke Workspace-Liste     | Single-Slot `sidebar.workspaces` (scope root), deklariert vom shipped `ui-sidebar`; Occupant ist `WorkspaceBrowser` aus `dsh-client-ui-workspace` @ Priorität 0                                                                                     | `dsh-client-ui-sidebar/lib/client.js`, `dsh-client-ui-workspace/lib/client.js` |
| Empty-State-Picker        | Single-Slot `conversation.hero.workspace` (root), Occupant `WorkspacePicker` @ 0; Chip selbst rendert `ConversationRoot` direkt                                                                                                                     | `dsh-client-ui-conversation/lib/client.js` (~7154–7230, Deklarationen ~9993)   |
| Hero-Headline             | `t("hero.headline")` = „Into the Unknown", **kein Slot** — direkt gerendert; nur `conversation.hero.brand.mark` ist slottet                                                                                                                         | ebenda ~7095–7105                                                              |
| Composer-Platzhalter      | natives `textarea[placeholder]` in `InputBar` (`data-composer-card` sitzt am Card-Div); Placeholder-Prop kommt als `t("placeholder.hero")` von oben                                                                                                 | ebenda ~4031–4041                                                              |
| Workspace-Registry (Host) | Service `workspaceRegistry` (`dsh-workspace`): Pfade werden per `fs.realpath` kanonisch gespeichert; Session-Anbindung nur bei exakter cwd-Übereinstimmung; Registry-Speicher `~\.dsh\storages\workspace.json` ist **profilübergreifend geteilt**   | `dsh-workspace/lib/index.js`                                                   |
| Wire-API                  | `workspace.create({path})` adoptiert existierende Ordner idempotent; `session.create` nimmt `workspaceId` XOR `cwd`; Blank-Session erbt cwd = Workspace-Pfad                                                                                        | `dsh-client-connection/lib/client.js` (~5514, ~5264)                           |
| Permission-Labels         | Preset-Tabelle ist Row-Config des Host-Rows `permission` (`@deepseek-ai/dsh-permission-presets`); `optionOf()` nutzt `spec.name ?? key`, UI transformiert kebab→Title-Case; Schemastery-Schema toleriert partielle Einträge nicht-benötigter Felder | `dsh-permission-presets/lib/index.js` (~259–271)                               |

## 3. Plugin-Architektur (Trennung wie im Auftrag §9)

| Paket (Repo)                 | Version               | Zuständigkeit                                                                                                                                                       |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dsh-plugins/pts-web-brand`  | **0.2.0** (erweitert) | Titel/Logo/Mark + **Start-/Empty-State-Sprache**: exakte String-Map über MutationObserver + Backstops; zusätzlich Takeover `conversation.hero.brand.mark` @ −1      |
| `dsh-plugins/pts-workspaces` | **0.1.0** (neu)       | Workspace-Liste, Create/Open, Pfadgrenzen: Takeover `sidebar.workspaces` + `conversation.hero.workspace` @ −1, Host-Route `/api/pts-workspaces/*`, Boot-Scope-Wache |

Beide rein Client-UI bzw. UI+Route; keine monolithische PTS-Datei. Mounting bleibt
ausschließlich im pts-web-Profil (Junction + Patch-Zeile), Standard-Web ohne PTS-Zeilen.

## 4. Workspace-Scope

- Die PTS-Browserkomponente filtert `workspaces.items` auf **direkte Kinder**
  von `<PTS>/workspace/` (Normalisierung der Pfadseparatoren, case-insensitive).
- Fremde Registry-Einträge (`deepseek-harness`, `headless`, `theme`,
  `systemisch-sim`, Repo-Root) bleiben im geteilten Store, werden aber **nicht
  gerendert**. Bewusst kein `registry.delete()`: Der Registry-Speicher wird mit
  Standard-Web 3080 geteilt; Löschen würde dort Workspaces entfernen.
- **Boot-Scope-Wache:** Einmal pro Seitenladung, nach Baseline-Empfang: Zeigt
  die automatisch wiederaufgenommene Session außerhalb `<PTS>/workspace/`,
  wird die Auswahl gelöst (Startseite statt fremdem Verzeichnis; Session
  bleibt erhalten). Ohne sie würde pts-web wegen `recentWorkspaceId` in den
  zuletzt aktiven — fremden — Workspace booten.

## 5. „Ordner +“ → „Neuen Denkraum anlegen“

Ablauf (Sidebar-Header-Button und Hero-Picker-Fußaktion nutzen denselben Dialog):

```text
Name eingeben
  → POST /api/pts-workspaces/create {name}          (Host: Slug + Struktur)
  → ctx.workspaces.create({path})                    (normale DSH-Adoption, Frames)
  → ctx.workspaces.rename(workspaceId, Name)         (Lehrersprache als Titel)
  → Sidebar: startSession(id) · Hero: onPick(id)     (Blank-Session, cwd = Denkraum)
```

- Kein Explorer, keine freie Pfadauswahl (die shipped Directory-Flow-Holes
  werden von den Übernahme-Entries nicht mehr deklariert/gemalt).
- Konfliktfall: HTTP 409 mit deutscher Rückmeldung, kein stilles Überschreiben.
- Slug: Umlaut-Transliteration, NFKD, `[a-z0-9-]`, max. 60 Zeichen;
  `"Wozu braucht es Religion?" → wozu-braucht-es-religion`.

## 6. Pfadgrenze (Host)

- Der Client sendet **nur einen Namen**, niemals einen Pfad.
- Ziel = `<realpath(<PTS>/workspace)>/<slug>`; Slug schließt Punkte/Separatoren
  aus; nach `mkdir` wird Containment gegen den kanonischen Elternteil geprüft.
- PTS-Root-Auflösung: `PTS_ROOT` env → Ahnengang von `import.meta.url`
  (Junction real-path't ins Repo) → `process.cwd()`; jeder Kandidat muss
  `AGENTS.md` + `workspace/` enthalten, sonst 503 statt Rateversuch.

## 7. Erzeugte Minimalstruktur (gegen den Kernel verifiziert)

Quellen: `LEARNING_DESIGN.md`, `ORCHESTRATION.md`, `specs/LEARNING_LANDSCAPE_SCHEMA.md`,
`specs/TEMPORAL_PLAN_SCHEMA.md`, `specs/PLANNING_BOARD_SCHEMA.md` und das reale
Muster `workspace/dsh-native-smoke`. Nicht blind die Auftragsliste übernommen:

```text
workspace/<slug>/
├── learning-design.md        # Kernel-Skeleton, Status: in-reflection
├── learning-landscape.md     # ptspace.learning-landscape/v1, noch ohne Momente
├── temporal-plan.yml         # ptspace.temporal-plan/v1, windows/placements leer
├── planning-board.yml        # ptspace.planning-board/v1, items: []
├── decisions.yml             # decisions: []
├── materials/
└── drafts/
```

Kein `AGENTS.md` im Workspace — der Boot läuft über die Root-`AGENTS.md`-Kette
(verifizierte DSH-Semantik, siehe `DSH_NATIVE_WORKSPACE.md` §„Verifizierte Semantik“).

## 8. Startzustand / Composer-Sprache

| Shipped                           | PTS                                               |
| --------------------------------- | ------------------------------------------------- |
| „Into the Unknown"                | „Pedagogical Thinking Space"                      |
| „Describe what you want to build" | „Woran möchtest du heute weiterdenken?"           |
| „Choose a workspace to start"     | „Wähle einen Denkraum – oder lege einen neuen an" |
| „Choose workspace" (Chip + Aria)  | „Denkraum wählen"                                 |
| „New Session"                     | „Neue Sitzung"                                    |
| „Message the agent"               | „Nachricht schreiben"                             |
| Preview-Badge am Hero             | ausgeblendet (nur neben der Headline)             |

Mechanik: exakte Match-Map (Textknoten, `placeholder`, `aria-label`) via
MutationObserver + Boot-Retry + 5-s-Backstop; React-Werte bleiben unberührt.
Fail-safe: Ändert DSH die englischen Originale, erscheinen wieder diese.

## 9. Realtests (CDP gegen die echte Oberfläche)

Treiber: `scripts/pts-web-ui-test.mjs`; Screenshots unter
`docs/experiments/pts-web-ui-tests/`. **9/9 bestanden**, keine Konsolenfehler:

| Test                             | Ergebnis | Evidenz                                                                                                                                                                                                                           |
| -------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: nur PTS-Denkräume sichtbar    | **PASS** | `.ptsw-root` gerendert; `theme/headless/deepseek-harness/systemisch-sim` nirgends im Text                                                                                                                                         |
| B: Ordner+ öffnet PTS-Dialog     | **PASS** | Input mit Placeholder „Name des Denkraums"; kein Explorer                                                                                                                                                                         |
| C: Anlegen + Konflikt            | **PASS** | 200 `{slug:test-religion-10}` (API) bzw. Anlegen per UI mit strenger Listen-Zeilen-Prüfung; Konflikt → 409 + deutsche Meldung im Dialog; Ordnerstruktur am Datenträger verifiziert                                                |
| D: Session-cwd = Denkraum        | **PASS** | Neue Session `--…-workspace-oekologie-7b--/session-87f19280…`, Header-cwd `F:\code\pedagogical-thinking-space\workspace\oekologie-7b`; Registry-Titel „Ökologie 7b". Root-`AGENTS.md` greift über die verifizierte Root→cwd-Kette |
| E: Startzustand PTS              | **PASS** | Headline „Pedagogical Thinking Space", Placeholder deutsch, keine englischen Ship-Texte, Preview-Pill weg                                                                                                                         |
| F: Standard-Web 3080 unverändert | **PASS** | Englische Ship-Texte + fremde Workspaces sichtbar, keine PTS-Route/kein PTS-Bundle auf 3080                                                                                                                                       |

Zusätzlich live bestätigt: Permission-Chip zeigt **„Schreiben im Denkraum"**
(Anzeige-Only-Rename, `/permission`-Werte und Semantik unverändert).

## 10. Bekannte DSH-Update-Risiken

1. **Slot-Verträge:** `sidebar.workspaces` / `conversation.hero.workspace`
   sind shipped Single-Slots; ändert DSH Kind-Slots oder Props (z. B. Chip-
   Rendering), müssen die Takeovers nachgezogen werden (Boot-Fehler wäre laut).
2. **Sprachschicht:** Die Map hängt an exakten englischen Originaltexten. Neue
   Copy → Ship-Text sichtbar wieder (degradierend, nicht brechend).
3. **Klassen-Hashes:** bewusst NICHT verwendet (keine `pXSMma_*`-Selektoren).
4. **Priority-Kollisionen:** eigene Entries liegen bei −1; führt DSH selbst
   −1-Occupants ein, bootet der Loader mit `already has a registration`-Fehler
   (sichtbar, nicht still).
5. **`inject`-Face-Regel:** Entry-eigene Faces müssen an der Registrierung
   hängen (`register({..., inject: factory})`), nicht nur im Apply-Scope —
   genau dieser Fehler kostete eine Debug-Runde (siehe §11).

## 11. Nachträge für die nächste Iteration

- Vorhandene, noch nicht registrierte Ordner (z. B. ein per API erzeugter
  Denkraum) können aktuell nur durch Neuanlegen mit gleichem Namen adoptiert
  werden; ein „Vorhandenen öffnen"-Pfad im Konfliktfall wäre Lehrer-freundlich.
- „Creator mode" (Label des shipped Agent-Preset-Wählers, `presetCordisName`)
  bleibt sichtbar — funktionaler Selector, Umbenennen würde das Menü inkonsistent machen.
- Optionale Dialogfelder (Thema/Fach/Lerngruppe) sind vorbereitet einfach
  ergänzbar (Host validiert derzeit nur `name`).

## 12. Geänderte Dateien

| Datei                                                    | Änderung                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `dsh-plugins/pts-workspaces/**`                          | **Neu**: package.json, lib/index.js (Host-Route, Slug, Scaffold, Pfadgrenze), lib/client.js (Takeovers, Dialog, Boot-Guard) |
| `dsh-plugins/pts-web-brand/lib/client.js`                | Sprach-Assertion + Hero-Mark-Takeover; `package.json` → 0.2.0                                                               |
| `$DSH_HOME/profiles/pts-web/cordis.patch.yml`            | Zeile `pts-workspaces`, permission-Anzeige-Override (presets restated), Kommentar                                           |
| `$DSH_HOME/profiles/pts-web/node_modules/pts-workspaces` | Junction → Repo-Paket                                                                                                       |
| `scripts/pts-web-ui-test.mjs`                            | Neu: CDP-Realtest-Treiber (A/E/B/C/F)                                                                                       |
| `docs/experiments/pts-web-ui-tests/*.png`                | Screenshots als Testbelege                                                                                                  |

Keine shipped-Datei editiert; Standard-Web 3080 zu jedem Zeitpunkt unverändert.

## 13. Nachbesserung: „Anlegen erscheint wirkungslos" (Nutzer-Reproduktion)

### Reale Fehlerursache

`derivePtsWorkspaces()` filterte mit dem Präfix `normPath(cfg.root) + "/"`,
also `<repo>/`. Der Rest eines jeden Kandidaten ist aber
`workspace/<slug>` — enthält also immer einen Schrägstrich — und fiel durch
die „direkte Kinder"-Prüfung (`rest.indexOf("/") !== -1`) weg. Folge:
**die Arbeitsraumliste konnte nie einen Eintrag zeigen**, obwohl Anlegen,
Registry-Eintrag, Titel-Rename und Session-Anschluss korrekt durchliefen.
Aus der Lehrer-Sicht: Ordner+ tut scheinbar nichts.

Verdeckt wurde das von zwei Test-Schwächen, beide inzwischen behoben:

1. Der Suite-Check griff auf `document.body.innerText` zu und matchte den
   **Hero-Chip** statt einer Listenzeile → Falsch-positiv. Jetzt: strenge
   Prüfung auf `.ptsw-wsrow .ptsw-wstitle` innerhalb von `.ptsw-list`.
2. Der frühe „leere Liste"-Zustand war zum Zeitpunkt A korrekt; nach dem
   Anlegen wurde die Liste nie erneut gegen echte Zeilen geprüft.

Zusätzlich hatte ein früherer Zwischenstand (Entry-`inject`-Faces fehlten an
der Registrierung → `createDenkraum is not a function`) in Browsern mit altem
Bundle-Cache weiterbestanden, weil der Bundle-Cache-Buster bootgebunden ist;
nach pts-web-Neustart bzw. hartem Reload greift der Fix auch dort.

### Fix (dsh-plugins/pts-workspaces/lib/client.js)

- Die Grenze wird aus `cfg.workspaceDir` (= `<PTS>/workspace/`, liefert die
  Config-Route bereits) gebildet; Fallback `root + "/workspace"`.
- Die Boot-Scope-Wache nutzt dieselbe workspaceDir-Grenze (statt nur Repo-Root).

### Manuell getestete Klickstrecke (echte Eingabeereignisse, kein element.click())

Treiber: `scripts/cdp-real-ui-test.mjs "Test Denkraum"` — alle Klicks über
`Input.dispatchMouseEvent` (reale Koordinaten), Texteingabe über fokussierten
Klick + `Input.insertText`/keyEvents; Network- und WebSocket-Frames mitgeloggt.

| Stufe                  | Beobachtung                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Ordner+ klicken        | Dialog „Neuen Denkraum anlegen", Placeholder „Name des Denkraums"                          |
| „Test Denkraum" tippen | Slug-Vorschau `Ordner: workspace/test-denkraum`                                            |
| Anlegen klicken        | `POST /api/pts-workspaces/create` → **200**                                                |
| Adoption               | WS-Frames `host/workspace-changed` mit neuer Workspace-ID                                  |
| Liste links            | Zeile „Test Denkraum" nach ~0,5 s sichtbar (strenge Zeilen-Assertion)                      |
| Öffnen                 | Composer gerendert, Chip zeigt „Test Denkraum", Sitzungszähler 1                           |
| Ordner                 | `workspace/test-denkraum/` mit voller Minimalstruktur (§7) am Datenträger                  |
| Session-cwd            | Neue Session unter `--…-workspace-test-denkraum--`, Header-cwd `…\workspace\test-denkraum` |
| Explorer               | keiner — ausschließlich In-App-Dialog                                                      |
| 3080                   | unverändert (keine PTS-Reste, Prozess-PID konstant)                                        |

Belege: `docs/experiments/pts-web-ui-tests/repro-1-start.png`,
`repro-2-dialog.png`, `repro-3-typed.png`, `repro-4-after-create.png`;
Konfliktfall erneut verifiziert: 409 + deutsche Meldung im Dialog.

### Betriebshinweis

Der Bundle-Cache-Buster ändert sich nur beim pts-web-Neustart. Nach jedem
Plugin-Datei-Update gilt: pts-web neu starten (`scripts\start-pts-web.ps1`)
oder mindestens einmal hart neu laden (Strg+F5), sonst bedient der Browser
den alten Bundle-Stand weiter.

## 14. Denkräume entfernen / löschen (Nachtrag auf Nutzerrückmeldung)

### Produktverhalten (Schutz von Lehrerinhalten vor stiller Vernichtung)

Jede Arbeitsraumzeile hat beim Hover einen Papierkorb-Button
(Aria: `Denkraum „<Titel>“ entfernen`). Er öffnet einen Bestätigungsdialog mit
Titel, Ordnerpfad und zwei klar getrennten Handlungen:

| Aktion                                                   | Mechanik                                                                                                                                    | Folge                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **„Entfernen und Ordner in den Papierkorb verschieben“** | erst `workspaces.delete(id)` (offizielle Wire-API; Sitzungsprotokolle bleiben Host-seitig erhalten), dann `POST /api/pts-workspaces/delete` | Zeile verschwindet sofort; Ordner wandert nach `workspace/.trash/<slug>--<Zeitstempel>/` — **wiederherstellbar**, nie hart gelöscht |
| „Nur aus der Liste entfernen – Ordner behalten“          | nur `workspaces.delete(id)`                                                                                                                 | Ordner bleibt unverändert im Dateisystem                                                                                            |

Zusatz-Konsistenz: War die aktuell geöffnete Session im entfernten Denkraum
beheimatet, kehrt die Oberfläche automatisch in den Startzustand zurück
(`sessions.clear()`), statt eine tote Workspace-Ansicht zu zeigen.

Sicherheit: Die Host-Route akzeptiert ausschließlich **direkte Kinder** des
kanonischen `<PTS>/workspace/` (realpath-Containment, Dot-Ordner ausgenommen);
Fehlschläge durch Windows-Sperren (offene Sitzung) antworten 409 mit deutscher
Handlungsanweisung statt halbem Zustand. Die Liste überspringt Dot-Ordner,
sodass `.trash` nie als Denkraum erscheint.

### Verifizierte Kette (echte Eingabeereignisse, `scripts/cdp-real-ui-test.mjs`)

1. „Aufräum Test“ per UI angelegt → 200, Zeile in 0,5 s sichtbar, Session offen.
2. Hover auf die Zeile → Papierkorb-Klick → Dialog zeigt Titel + Pfad.
3. „Entfernen und Ordner in den Papierkorb verschieben“ → `POST …/delete` 200.
4. Zeile sofort weg, Dialog zu, Rückkehr zum Startzustand (Chip „Denkraum wählen“).
5. Datenträger: `workspace/.trash/aufraeum-test--<stamp>/` mit voller Struktur;
   Originalpfad nicht mehr vorhanden; Registry ohne Eintrag.

Belege: `repro-5-delete-dialog.png`, `repro-6-after-delete.png`. Die
Regressionssuite ist damit auch selbstreinigend: Test G legt „Klima 8a“ an und
entfernt es wieder (**10/10 PASS**, `test-G-delete-dialog.png`,
`test-G-after-delete.png`).
