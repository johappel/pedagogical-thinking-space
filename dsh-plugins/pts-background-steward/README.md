# pts-background-steward

Hintergrundpflege des Denkstands für das `pts-web`-Profil. Das Plugin sitzt in
der **Host-Ebene**, beobachtet abgeschlossene Nutzerdialog-Turns und startet
danach — ohne den sichtbaren Companion zu verzögern — einen nativen
In-Process-Subagent, dessen strukturiertes Ergebnis nach Validierung und
Revisionsprüfung atomar in die kanonischen Denkstand-Dateien übernommen wird.

## Architekturrolle

```text
Teacher <-> Pedagogical Companion        (sichtbar, wartet nie)
                     |  turn/end (completed), Debounce, Coalescing
                     v
          Background Steward            (unsichtbar, eigenes Modell)
                     |
                     v
   validierter, revisionsgeprüfter Workspace-Patch
```

- Der Companion ist der einzige sichtbare Gesprächspartner. Er führt keine
  routinemäßige Dateiablage mehr im Antwort-Turn aus (Kernel-Regel, siehe
  `AGENTS.md`).
- Der Steward ist kein Worker: Er braucht keine Freigabe für reversible
  Denkstandspflege, darf aber keine Materialien produzieren, keine Recherche
  starten, keine pädagogische Richtung entscheiden, keinen Planning-Board-
  Eintrag freigeben und nicht in Memory oder kuratiertes Wissen schreiben.
- Der bestehende dateibasierte Dispatcher (`harness/dispatcher.py`) bleibt für
  explizite Servicearbeit unangetastet; das Plugin läuft bewusst nicht über ihn.

## Aufbau

```text
lib/
├── index.js           Trigger-Observer, Denkraum-Auflösung, Verdrahtung, Status-Route
├── config.js          Defaults + robuste Normalisierung der Row-Konfiguration
├── scheduler.js       Debounce/Coalescing, max. 1 Lauf je Denkraum, Rerun-Puffer
├── reflection-job.js  Steward-Persona, Prompt, Subagent-Start, Ergebnisverarbeitung
├── patch-validator.js JSON-Schema (dsh-tools-Teilmenge) + Politikprüfung
└── workspace-state.js Hashes, atomare Writes, reine Texttransformationen
```

Das Paket importiert absichtlich **keine** `@deepseek-ai/*`-Module: Es wird per
Windows-Junction ins Profil gemountet; die realpath-Auflösung würde Specifier
vom Repo-Pfad suchen. Dienste kommen ausschließlich über `inject`
(`sessions`, `agents`, `subagents`) bzw. optional per `ctx.get`
(`jobs`, `webServer`). Die Row-Konfiguration wird deshalb ohne
Schemastery-Schema als rohes Objekt gelesen (`resolveConfig` in Cordis reicht
Konfiguration ohne Schema unverändert durch) und in `config.js` normalisiert.

## Ablauf eines Laufs

1. **Trigger** — globaler `session/event`-Observer filtert `turn/end` mit
   Endgrund `completed` an Top-Level-Sessions (`header.parentSession` fehlt;
   eigene Child-Sessions werden zusätzlich über eine ID-Menge ausgefiltert).
2. **Denkraum-Auflösung** — `header.cwd` muss auf genau eine Ebene unter
   `<PTS-Root>/workspace/` zeigen (Marker-validierter Root wie in
   `pts-workspaces`: `PTS_ROOT` → Modul-Vorfahren → cwd).
3. **Sammeln** — pro Denkraum fasst der Scheduler schnelle Folge-Turns
   zusammen (`debounceMs`) und startet höchstens einen Lauf; Turns während
   eines Laufs werden gepuffert und führen zu genau einem Nachlauf.
4. **Basis-Snapshot** — SHA-256-Hashes der fünf kanonischen Dateien
   (`learning-design.md`, `learning-landscape.md`, `decisions.yml`,
   `planning-board.yml`, `temporal-plan.yml`).
5. **Subagent** — `ctx.subagents.start('spawn', …)` mit:
   - `agentOptions` aus `provider`/`model`/`maxTokens` (anders Modell als der
     Companion ist der Normalfall),
   - `persona`: deutsche Steward-Persona (Shadowing der Deployment-Persona),
   - `toolFilter: { allow }`: standardmäßig nur `read`, `glob`, `grep` —
     **das Kind schreibt nie selbst**, auch nicht bei anderer Konfiguration
     (`config.js` filtert `write`/`edit` grundsätzlich heraus),
   - `outputSchema`: `ptspace.stewardship-result/v1` (siehe
     `specs/STEWARDSHIP_RESULT_SCHEMA.md`),
   - `parent`: die live Companion-Agent des auslösenden Turns (Workspace,
     Linie, Delegationstiefe); `signal`: Timeout + Fiber-Abort.
6. **Native Sichtbarkeit** — jeder Lauf wird zusätzlich als besitzloser Job
   (`kind: pts-steward`) in `ctx.jobs` registriert. Besitzlose Jobs erzeugen
   **keine** Completion-Notices in irgendein Gespräch (`owner === undefined`
   bricht im shipped Reporter ab) und erscheinen nur in `job_list`.
7. **Validierung** — Struktur (Schema-Version, Session, Turn, Basis-Hashes,
   Evidence-Fenster) plus Politik:
   - `decisions.yml` nur bei eindeutiger, belegter Lehrkraftentscheidung
     (`teacher_decisions` mit `explicit: true` + passender Evidence);
   - Lernmomente nur als vollständige Entwürfe (`Status: draft`);
   - `temporal-plan.yml` niemals Ziel; Board höchstens 1 Vorschlag/Lauf
     (erzwungen `status: proposed`, `requires_teacher_approval: true`);
   - `set-section`/`append-under-section` nur an `learning-design.md`;
   - Wertlängengrenzen.
8. **Revisionsschutz** — unmittelbar vor dem Anwenden werden die Hashes neu
   gebildet. Jede Abweichung verwirft das Gesamtergebnis (`stale`): Ein
   langsamer Hintergrundlauf kann nie einen neueren Gesprächsstand
   überschreiben. Ein frischer Trigger liefert ohnehin einen neuen Lauf.
9. **Anwendung** — überlebende Operationen werden als reine Text-
   transformationen berechnet und je Datei **atomar** geschrieben
   (Temp-Datei im Denkraum + Rename).

Fehler betreffen ausschließlich den Hintergrundjob: Sie werden geloggt und
als Job-Ergebnis (`failed`) registriert, berühren die Companion-Session aber
nicht. Erfolgreiche Pflege wird nicht im Chat erwähnt.

## Installation (pts-web-Profil)

1. Junction:

   ```powershell
   New-Item -ItemType Junction `
     -Path "$env:USERPROFILE\.dsh\profiles\pts-web\node_modules\pts-background-steward" `
     -Target "F:\code\pedagogical-thinking-space\dsh-plugins\pts-background-steward"
   ```

2. Patch-Ebene `$env:USERPROFILE\.dsh\profiles\pts-web\cordis.patch.yml`
   (vorher Backup anlegen — Repo-Konvention):

   ```yaml
   - insert:
       - id: pts-background-steward
         name: pts-background-steward
         inject: [agents, sessions, subagents]
         config:
           providerName: spawn
           provider: lmstudio            # Hintergrund-Modellroute (hier: lokal, LM Studio)
           model: ornith-1.5-9b-mtp      # bewusst ANDERS als das Companion-Modell
           maxTokens: 8192
           debounceMs: 1500
           maxConcurrentPerWorkspace: 1
           rerunAfterBusyTurns: true
           runTimeoutMs: 240000
   ```

   Modellalternativen: `provider: openrouter` mit `model:
   deepseek/deepseek-v4-flash` für reflektiertere Läufe (braucht
   `OPENROUTER_API_KEY`); leere Werte erben das Elternmodell des Companions.

3. pts-web neu starten (das Standard-Web auf Port 3080 bleibt unberührt; das
   Plugin existiert ausschließlich als Row dieses Profils).

### Konfigurationsreferenz

| Schlüssel | Default | Bedeutung |
|---|---|---|
| `enabled` | `true` | Hauptschalter (Beobachtung + Läufe). |
| `providerName` | `spawn` | Provider-Registrierungsname auf `ctx.subagents`. |
| `provider` / `model` | `''` (leer) | Leere Werte erben das Elternmodell; gesetzt ergeben sie das Hintergrund-Modellziel. |
| `maxTokens` | `8192` | Output-Limit des Kindes (`0` = erben). |
| `debounceMs` | `1500` | Sammelfenster nach Turn-Ende. |
| `maxConcurrentPerWorkspace` | `1` | Harte Obergrenze aktiver Läufe je Denkraum. |
| `rerunAfterBusyTurns` | `true` | Genau ein Nachlauf nach Turns, die während eines Laufs eingingen. |
| `runTimeoutMs` | `240000` | Gesamt-Timeout; Abbruch gilt als Job-Ereignis, nie als Chat-Fehler. |
| `recentTurnsWindow` / `recentTurnsMaxChars` | `6` / `12000` | Gesprächsausschnitt für den Prompt. |
| `maxFileChars` | `24000` | Kappung je Datei im Prompt (ehrlich markiert). |
| `minPromptChars` | `0` | Überspringt reine Begrüßungen (kürzester Nutzerbeitrag ohne `?`); `0` = aus. |
| `allowedTools` | `[read, glob, grep]` | Werkzeug-Allowlist des Kindes; `write`/`edit` werden immer entfernt. |
| `reasoningEffort` | `''` | **Geführt, aber derzeit nicht durchgereicht.** DSH 0.1.1-rc.2 kennt kein `reasoningEffort` für One-Shot-Subagent-Children (`agentOptions` trägt nur `provider`/`model`/`maxTokens`); das Kind läuft mit dem Provider-Default. Der Wert erscheint im Status als `reasoningEffortApplied: false`. |

## Modellsteuerung über die Settings (empfohlen)

**Achtung: Eine Änderung der Plugin-Dateien erfordert einen pts-web-Neustart;
eine Modellwahl über die Oberfläche/den Settings-Block wirkt ab dem nächsten
Steward-Lauf ohne Neustart.**

Die Modellwahl wird aus einem eigenen Abschnitt der **Profil-Settings-Datei**
gelesen (gleiche Stelle, an der du ohnehin Modelle pflegst) — statt die
Patch-Row anzufassen:

```yaml
# profiles/pts-web/settings.yaml
pts-background-steward:
  provider: lmstudio
  model: ornith-1.5-9b-mtp
  maxTokens: 8192
  reasoningEffort: low   # derzeit NICHT an das One-Shot-Child durchgereicht
```

Vorrang: **Settings-Block > Patch-Row > Default**. Der Wert wird pro Lauf und
pro Status-Abfrage frisch aus `settings.documentPath` gelesen, sodass eine
Änderung ohne Neustart beim nächsten Lauf wirkt (praktisch hot-reloaded). Der
Status-Endpunkt zeigt `modelSource: "settings"` bzw. `"patch-row"` und
`reasoningEffortApplied: false`.

Warum nicht `ctx.settings.get(ns)`? Der Settings-Seam liefert nur Werte
**registrierter** Namespaces, und `register()` verlangt ein Schemastery-Schema —
das dieses Paket (kein `@deepseek-ai`-Import) nicht bauen kann. Das Plugin
extrahiert deshalb die eigene, kontrollierte Sektion aus dem Settings-Dokument
(`lib/settings-source.js`, unit-getestet).

## Modell-Schalter in der Oberfläche (Tab „Steward")

Das Plugin registriert einen `conversation.view`-Tab **„Steward"** (rechte
Spalte neben „Artefakte") mit einem Modell-Picker: Provider-Dropdown (aus dem
Settings-Provider-Katalog `llm-pi-ai.providers`), Modell-Dropdown,
`maxTokens`-Feld und Speichern-Button. Die Auswahl wird über
`POST /api/pts-background-steward/config` in die Settings-Sektion geschrieben
und gilt ab dem nächsten Steward-Lauf. `reasoningEffort` wird nur als
Hinweis angezeigt („nicht an das One-Shot-Child durchgereicht"), nicht editiert.
Ein Doppelklick/Browser-Hart-Refresh (Strg+Umschalt+R) nach dem Neustart
spült den Bundle-Cache.

Host-Endpunkte: `GET /api/pts-background-steward/config` (effektive Wahl +
Provider-Katalog), `POST …/config` (persistiert), `GET …/status` (Laufzustand).

## Status-Oberfläche

`GET /api/pts-background-steward/status` liefert JSON (Zustand je Denkraum,
letztes Ergebnis, aktive Child-Sessions, effektive Konfiguration). Bewusst
gibt es **keine** Chat-Darstellung einzelner Hintergrundaktivitäten;
`pts-activity-stream` bleibt reine UI-Projektion und könnte später einen
einzigen dezenten Hinweis („Denkstand wird im Hintergrund gepflegt") allein
auf dieser echten Job-Basis anzeigen.

## Warum kein owned Job und keine Client-Hälfte?

Ein Job mit dem Companion als Besitzer würde über den shipped `tool-jobs`-
Reporter eine Completion-Nachricht **in die sichtbare Unterhaltung** einspeisen
(`owner.followup(...)` bzw. `owner.inject(...)`) — genau das, was die
Hintergrundarchitektur ausschließt. Deshalb: besitzloser Job (nur Beobachtung)
oder direkter Lauf, wenn keine Registry dient. Eine Client-Hälfte braucht das
Plugin nicht; alles Sichtbare bleibt bei den bestehenden UI-Plugins.

## Preset-Frage (pts-steward)

Der Child erzeugt sich heute über den `spawn`-Provider und erbt die
Preset-Komposition des Elternteils (`pts-companion`) plus Persona-Shadowing und
Toolfilter — Modell, Persona und Werkzeuge sind damit bereits vollständig vom
Companion entkoppelt. Ein eigener picker-sichtbarer Preset `pts-steward` ist
erst sinnvoll, wenn ein Spike bestätigt, dass DSH 0.1.1-rc.2 Children zuverlässig
mit einer konkreten Preset-ID erzeugen kann; die dokumentierte Subagent-
Schnittstelle garantiert das derzeit nicht.

## Tests

```powershell
npm test   # node --test test/
```

Die Tests sind rein (keine DSH-Abhängigkeiten): Text-Transformationen,
Politik-/Schema-Prüfung, Scheduler-Verhalten mit Fake-Timern sowie die
Konfigurationsnormalisierung. Laufzeit-Abnahmekriterien (z. B. „Companion-
Text erscheint vor Jobabschluss", „Child-Turns lösen nichts aus", „anderes
Modell nachweislich verwendet") werden gegen eine live pts-web-Instanz
geprüft; die Schaltkreise dafür sind oben beschrieben
(Observer-Filter, `agentOptions`, Child-Session-Provenienz in
`assistant/message`-Events).

