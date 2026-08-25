# pts-activity-stream

Experimentelles DSH-Web-UI-Plugin (Spike 1): übersetzt die technischen
Tool-Zeilen eines DSH-Chats in ruhige, teacher-facing **Aktivitätseinheiten**
des Pedagogical Companion.

> Zeige, woran der Companion gerade arbeitet – nicht, welche technischen
> Werkzeuge er dafür benutzt.
> **Show intent and progress, hide implementation detail by default.**

Die Anzeige ist eine reine **Projektion vorhandener DSH-Ereignisse**:
keine erfundenen Prozentwerte, keine künstlichen Schritte, kein eigener
Parallelzustand, kein persistenter Workflow-State. Läuft nichts, pulsiert
nichts.

## Drei Ebenen

1. **Running** – eine ruhige Zeile mit dezentem Puls-Punkt,
   z. B. „Ich prüfe den bisherigen Denkstand …“
2. **Settled** – kompakte, visuell zurückhaltende Abschlusszeile,
   z. B. „Denkstand geprüft“
3. **Technische Details** – Aufklapper „▸ Technische Details“ pro Einheit:
   originale Toolnamen + Argumente (+ verschachtelte Subcalls), auf Fehler
   rot markiert; Link „In der Trajektorie öffnen“ springt in die shipped
   Trajectory-Ansicht des Calls. Nichts wird gelöscht.

## Verwendeter Slot / Shadowing-Entscheidung

| Slot | Art | Key | Priorität | Grund |
|---|---|---|---|---|
| `conversation.chat.node` | keyed | `tool-call` | **−1** | Takeover der shipped `ToolCallTree`-Zeilen (`@deepseek-ai/dsh-client-ui-tool`, Default-Priorität 0). Niedrigste Priorität rendert; gleiche Priorität wäre ein Boot-Fehler. |
| `conversation.chat.node` | keyed | `context` | **−1** | Takeover der shipped „Context injection“-Zeile (`ContextInjectionRow` in ui-conversation). Übersetzung über die produzentendeklarierten Metadaten der Node (`role`, `form`, `label`). |

Bewusst **nicht** verwendet:

* keine `children:`-Deklaration (Deklarationen sind exklusiv — das shipped
  Entry besitzt `tool.call.toolview`; eine eigene Deklaration würde den ganzen
  Entry beim Boot ablehnen);
* kein `renderSlot`/`renderSlotChain` (entry-gebundene Ownership);
* kein Zugriff auf den Chat-Store (nicht einmal lesend nötig — die Daten
  kommen über den Standard-Kit-Hook `useSession`);
* keine Host-Routen, kein `webServer`, keine Services (Host-Hälfte ist leer).

## Verwendete Runtime-Signale (alle gegen 0.1.1-rc.2 verifiziert)

* `snapshot.chat.order` — sichtbare Chat-Nodes in Anker-Reihenfolge;
  versteckte Nodes sind bereits herausgefiltert.
* `snapshot.chat.nodes.get(key)` → Node `kind: 'tool-call'`,
  `data.root` = Wurzel-Toolblock:
  * laufend: `RunningToolCall` (`!("kind" in root)`) mit `name`, `argsRaw`,
    `callId`, `subCalls[]`;
  * settled: `ToolResultNode` (`kind === 'tool-result'`) zusätzlich mit
    `call.{name,argsRaw}`, `isError`, `error.{name,code}`, `subCalls[]`.
* Wire-Argumente aus `argsRaw` (JSON): `file_path`/`path` (read/write/edit/
  read_image), `pattern`/`path` (glob/grep), `command` (pwsh/bash),
  `query` (web_search), `description`/`prompt` (subagent),
  `message` (send_message).
* Subagent-`description` ist echtes Runtime-Metadatum („A short (3–5 word)
  description of the delegated task, for display“) und wird als dezente
  Zusatzzeile bei laufender Recherche gezeigt.
* Assistentenschritte: `assistant-step`-Nodes trennen Gruppen nur, wenn sie
  sichtbaren Text tragen (`blocks[].kind==='text' && text.trim()!==''`).

Kein Parsing von Modell-Prosa; Klassifikation nur aus Name + Argumenten +
Settlement-/Error-Flags.

## Activity-Typen und Gruppierungslogik

Gruppierung: ein Durchlauf über `chat.order`; **aufeinanderfolgende**
`tool-call`-Nodes desselben Typs bilden genau **eine** sichtbare Einheit
(gerendert am letzten Member; frühere Member geben `null` zurück, der Flow
versteckt leere Rows). Gruppen brechen an: User-/Steering-Messages, Commands,
Turn-Tail, sichtbarer Assistant-Prosa, unklassifizierbaren Calls.

| Typ | Trigger (Wire-Signal) | Running | Settled |
|---|---|---|---|
| `workspace-review` | read/read_image/glob/grep mit PTS-Zielpfad oder -Muster | „Ich prüfe den bisherigen Denkstand …“ | „Denkstand geprüft“ |
| `workspace-update` | write/edit im PTS-Baum; **Read+Write desselben Pfades ohne Trennung wird zu EINER Update-Einheit zusammengefasst** (Aufgabenbeispiel 2) | „Ich halte den neuen Stand im Denkraum fest …“ | „Denkstand aktualisiert“ |
| `delegated-research` | subagent, web_search, web_fetch sowie Delegationskanäle send_message/interrupt_agent/list_agents/job_* | „Recherche läuft …“; ab ≥2 subagent-Spawns „Ich lasse unterschiedliche Perspektiven parallel untersuchen …“; `description` als Zusatzzeile | „Eine zusätzliche Perspektive ist zurückgekommen.“ bzw. „<n> zusätzliche Perspektiven …“; ohne Spawn: „Recherche abgeschlossen“ |
| `draft-production` | write/edit unter `…/drafts/…` oder `…/rendered/…` (nur wenn der Pfad es zuverlässig belegt) | „Ein Entwurf wird vorbereitet …“ | „Entwurf angelegt“ |
| `generic-work` | pwsh/bash, todo_write→`plan` („Nächste Schritte sortiert“), Reads ohne PTS-Bezug u. a. | „Ich arbeite gerade daran …“ | „Schritt abgeschlossen“ |
| Frage | ask_user_question (nie gruppiert) | „Ich habe eine Frage an dich …“ | „Frage geklärt“ |
| Fallback | unklassifizierbar → kleine technische Einzelzeile (Originalname), nie semantisch behauptend | — | — |

### Context-Injections (keyed Seat, key `context`)

Übersetzt anhand der Node-Metadaten (`provenance.role`, `form`,
`provenance.label`) und des Textinhalts – nie durch Interpretation des
Inhalts:

| Signal (Runtime) | Ruhige Zeile |
|---|---|
| `form: relay` | „Rückmeldung aus der Hintergrundarbeit eingegangen“ (z. B. Subagent-Berichte) |
| `form: notice` | „Hinweis: <erste Textzeile aus dem Inhalt>“ |
| `form: instructions` | „Arbeitsgrundlage geladen“ |
| `form: catalog` | „Werkzeugkatalog geladen“ |
| `form: snapshot` | „Lagebericht geladen“ |
| `role: recall` | „Frühere Session herangezogen“ |
| sonst/unbekannt | „Systemmeldung aufgenommen“ |

Aufklapper zeigt Meta-Zeile (`context · role · form · Produzent`, z. B.
`context · inject · notice · goal`) plus Originaltext (auf 4000 Zeichen
begrenzt). Die form-speziischen Rich-Bodies des shipped Views (z. B.
InstructionsBody) sind intern und werden nicht reproduziert – der
Volltext des Contents bleibt zugänglich. Keine Gruppierung von
Context-Nodes (jede Meldung eine Zeile).

PTS-Erkennung (Client-seitig): Pfade/Muster mit Segmenten `workspace/`,
`services/`, `specs/`, `capabilities/`, `knowledge/`, `memory.local/`
bzw. Kernel-Dateien `AGENTS.md`, `README.md`, `MANIFEST.md`,
`CRITICAL_FRIEND.md`, `SYSTEMIC_STANCE.md`, `LEARNING_DESIGN.md`,
`ORCHESTRATION.md`.

Fehler: irgendein Member mit `isError === true` → „Das hat leider nicht
geklappt.“ (rot-matt); Details zeigen `error.name/code`. Läuft parallel noch
ein Member, bleibt die Einheit running bis alles settle ist.

## Installation

```powershell
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\pts-activity-stream" `
  -Target "F:\code\pedagogical-thinking-space\dsh-plugins\pts-activity-stream"
```

Eintrag in der persönlichen Patch-Ebene `$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml`
(nur ergänzen, nie bestehende Einträge entfernen):

```yaml
- insert:
    - id: pts-activity-stream
      name: pts-activity-stream
```

## Restart-Anforderung

Jede Änderung (auch client-only) erfordert einen **Neustart von DSH-Web**:
der Bundle-Roster und der Rev-Hash werden beim Boot neu gelesen; HMR ist im
Web-Profil bewusst deaktiviert. Die Junction macht Repo-Edits danach sofort
sichtbar — es muss nichts kopiert werden.

## Testablauf

Vor Neustart:

```
node --check lib/client.js
node test-activity.cjs        # Logik: Gruppierung/Klassifikation (20 Checks)
node --input-type=module -e "await import('file:///F:/code/pedagogical-thinking-space/dsh-plugins/pts-activity-stream/lib/index.js')"
```

Nach Neustart (Checkliste):

1. Kein GUI-Banner „Failed to load plugins …“.
2. Normales Gespräch funktioniert.
3. Reale `read`-Operationen erzeugen eine sinnvolle Activity Unit.
4. Mehrere Reads erscheinen als **eine** Einheit, nicht als Spam.
5. Reale Subagent-Recherche als laufende Aktivität erkennbar
   (`subagent`-Args `description` als Zusatzzeile).
6. Nach Settlement ruhige Abschlusszeile statt Laufanzeige.
7. „▸ Technische Details“ zeigt originale Calls inkl. Subcalls;
   „In der Trajektorie öffnen“ erreicht die shipped Ansicht.
8. Fehlgeschlagene Tools rendern als Fehler, nie als Erfolg.
9. Bestehende DSH-Toolansichten bleiben erreichbar (Trajektorie; Details-
   Spalte via Klick in anderen Views).
10. `prefers-reduced-motion`: Puls-Punkt steht still, Funktion intakt.

Logik-Testszenarien (test-activity.cjs): Glob+3×Read = 1 Review-Einheit;
Read+Write gleicher Datei = 1 Update-Einheit; subagent mit description +
verschachtelten web_search; unbekanntes Werkzeug → Fallbackzeile; Prosa
trennt, stille Steps nicht; isError; pwsh → generic.

## Bekannte Fragilitäten gegenüber DSH-Updates

* **Slot-Keys `tool-call` und `context` auf `conversation.chat.node`**:
  interne Contracts von `dsh-client-ui-tool` bzw. `dsh-client-ui-conversation`.
  Benennt DSH einen Key, das Slot-Muster oder die Prioritätsregeln um,
  schaltet unser Takeover still auf Fallback um oder wirft beim Boot
  (Prioritätskonflikt steht dann wörtlich im Loader-Banner).
* **Context-Forms** (`instructions|catalog|snapshot|notice|relay|recall`):
  geschlossene Menge dieser UI-Version; neue/unbekannte Forms degrudieren
  zu „Systemmeldung aufgenommen“ — nichts verschwindet.
* **Snapshot-Form** (`chat.order`, `nodes.get(key).data.root`, Feldnamen
  `callId/name/argsRaw/call/isError/subCalls`): Runtime-intern; Feldumbenennungen
  brechen die Klassifikation (Fallback-Zeilen erscheinen, nichts crashet —
  alle Zugriffe defensiv).
* **`.flowItem:empty { display:none }`**: unser „null für frühere Members“
  nutzt dieses shipped CSS; verschwindet die Regel, entstehen Leerzeilen.
* **Subagent-Auflösung**: Hintergrund-subagents kehren im Eltern-Stream sofort
  zurück; die eigentliche Kinderarbeit läuft in deren eigener Session. Der
  Elterncanonical kann deshalb „zurückgekommen“ zeigen, während im Hintergrund
  noch gearbeitet wird — ehrlich gegenüber dem Eltern-Eventstrom, aber nicht
  die ganze Wahrheit; Folgeabfragen (send_message/job_*) erscheinen als
  weitere Recherche-Einheiten.
* PTS-Pfaderkennung ist Konvention, kein Contract: benennt der PTS-Kernel
  Verzeichnisse um, fällt Klassifikation auf `generic-work` zurück
  (generisch und wahr statt spezifisch und falsch).

## Screenshot-/Beobachtungsnotizen

* Vorher: `Glob workspace/**`, `Read learning-design.md`, `Read decisions.yml`,
  `subagent`, `web_search` … als einzelne technische Rows.
* Nachher: eine laufende Zeile mit Puls-Punkt pro Bewegung, danach matte
  Abschlusszeile; Details hinter dem Aufklapper.
* **Realtest nach Neustart (diese Installation):**
  - Roster/Boot: `GET /plugins/pts-activity-stream/client.js` → HTTP 200;
    Boot-Payload listet die Loader-Row neben `artifact-panel`.
  - Bewegung 1 (echt): `glob workspace/dsh-native-smoke/**` +
    2×`read` + `grep` am Stück → erwartbar **eine** Review-Einheit
    („Ich prüfe den bisherigen Denkstand …“ → „Denkstand geprüft“).
  - Bewegung 2 (echt): Hintergrund-`subagent` (description „Kontrastperspektive
    zur Ausgangsfrage“) mit zwei web_search-Perspektiven → „Recherche läuft …“
    über mehrere Minuten realer Laufzeit; Übergang bei Settlement.
  - Bewegung 3 (echt): `write` nach
    `workspace/dsh-native-smoke/drafts/2026-xx-activity-stream-spike-note.md`
    → „Ein Entwurf wird vorbereitet …“ → „Entwurf angelegt“.
  - Visuelle Bestätigung durch die Lehrkraft: siehe Handoff-Bericht im
    Session-Verlauf.

## Struktur

```
pts-activity-stream/
├── package.json          # dsh.client-Marker + ./client-Export (Roster)
├── lib/
│   ├── index.js          # Host-Hälfte: absichtlich leer (pure UI)
│   └── client.js         # Takeover conversation.chat.node/tool-call @ −1
├── test-activity.cjs     # Logik-Smoke-Test (vm-basiert, ohne Browser)
└── README.md
```
