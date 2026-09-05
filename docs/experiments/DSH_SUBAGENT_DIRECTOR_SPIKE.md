# Granite-4.2-3B-Einzeltest 2026-09-05

Der native Headless-Einzeltest wurde mit dem lokal erreichbaren Ollama-Modell
`granite4.2:3b` wiederholt. Das isolierte Profil enthalt nur die temporaere
Testkonfiguration; die Produktivkonfiguration blieb unveraendert. Reasoning-
Effort-Vorgaben wurden entfernt, weil der Adapter sie fuer dieses Modell mit
`UNSUPPORTED_REASONING_EFFORT` ablehnt.

| TestErgebnis | Ergebnis | Evidenz |
|---|---|---|
| Parent echter Modelllauf | PASS | DSH lief mit Ollama/Granite und erzeugte eine Parent-Antwort |
| Director Tool verfuegbar | PASS | Parent meldete den ausgefuehrten `subagent_role`-Call |
| `ctx.subagents.start` erreicht | PASS | Child-Session `927e57e8-aa92-48f6-b35a-79d7efe8ecf8` wurde erzeugt |
| Child erzeugt | PASS | Child-Session `mode: one-shot`, Label `Pedagogical Reviewer`, Laufzeit 30,6 s |
| Child nutzt konfigurierte Persona | UNVERIFIED | Rollenlauf belegt, Persona-Inhalt nicht separat ausgegeben |
| Child nutzt konfigurierte Modellroute | UNVERIFIED | Profilroute war `ollama/granite4.2:3b`; Artefakt enthaelt keine Route-Zeile |
| Ergebnis beim Parent | PASS | Parent gab das Child-Ergebnis zurueck; Child meldete eigenen Dateilesefehler |

Der native Delegationspfad fuer **einen** Child ist damit empirisch erreicht.
Der Child-Inhalt ist fachlich kein erfolgreicher Review, sondern ein
kontrollierter Fehlerfall wegen des absichtlich knappen synthetischen Prompts.
Persona-/Modellrouten bleiben bis zu einer expliziten DSH-Trace- oder
Provideraufzeichnung offen. Fan-out, Background und Continuation wurden noch
nicht gestartet.

## Offene Nachweise: Ergebnis des Folgeversuchs

Die vier Nachweise wurden in der geforderten Reihenfolge mit Granite 4.2 3B
ausgefuehrt. Persona ist FAIL: Der eindeutige Marker wurde nach dem Lauf
entfernt und erschien nicht im Child-Systemprompt bzw. Child-Ergebnis. Der
Background-Versuch lieferte eine Completion und ein Ergebnis an den Parent;
die von der Modellantwort genannten IDs `subagent-1` waren jedoch nicht als
separate DSH-Child-/Job-IDs in den Sessionartefakten belastbar zuzuordnen.
Der Continuation-Versuch wurde nicht nachweisbar mit `send_message` und
Director-Close ausgefuehrt; die Modellantwort wechselte auf eigene Spekulationen
und erzeugte keine belastbare Child-ID. Deshalb kein Drei-Rollen-Fan-out.

# Spike: DSH Subagent Director gegen PTS

Stand: 2026-09-05  
Profil: `pts-web`  
Plugin: `dsh-plugin-subagent-director` 0.5.0  
DSH: `0.1.2-rc.1`

## Ergebnis in vier Aussagen

1. **Kann Subagent Director die PTS-Rollenverwaltung ersetzen?**
   **Teilweise ja.** Rollen-ID, Anzeige-/Aufgabenbeschreibung, Persona,
   LLM-Provider/Modell, Reasoning-Effort und optionaler Toolfilter sind als
   `subagent-director.roles` konfigurierbar. Nachgewiesen ist die korrekte
   Auflösung für drei PTS-Rollen. Die PTS-spezifische Fachlogik und die
   Worker-Semantik werden dadurch nicht ersetzt.

2. **Kann er die aktuelle Background-/Subagent-Logik teilweise oder vollständig ersetzen?**
   **Teilweise.** Der Director verwendet DSH-native `ctx.subagents.start`,
   `startContinuable`, `jobs.start` und `settleRun` und bietet Foreground,
   one-shot-Background sowie continuable-Background. Damit kann er die
   technische Delegation ersetzen. PTS-Hintergrundpflege, Schutzregeln,
   Worker-Rollenkanäle und fachliche Ergebnisprüfung bleiben PTS-Logik.
   Der reale Modelllauf mit drei Kindern konnte in dieser Umgebung nicht
   durchgeführt werden.

3. **Welche PTS-Komponenten wären danach wahrscheinlich redundant?**
   Wahrscheinlich redundant wären die sechs fest verdrahteten
   `@deepseek-ai/dsh-tool-subagent`-Instanzen in
   `dsh-presets/pts-companion/agent.cordis.yml`, soweit sie nur die technische
   Rollen-/Modellwahl und Delegation abbilden. Nicht redundant sind
   `pts-background-steward` (Denkstand-Pflege), `companion-tool-boundary`,
   `worker-skill-scope` und die PTS-Worker-Tools (`pts_research`, `pts_edit`,
   `pts_document`, `pts_material`, `pts_review`, `pts_renderer`). Eine
   Migration ist ohne Live-Nachweis nicht gerechtfertigt.

4. **Wo lässt sich später OpenRouter Batch am saubersten ergänzen?**
   Als separates DSH-Plugin, das einen Subagent-Transport-Provider mit dem
   kanonischen `ctx.subagents.start`-Vertrag und eigener Polling-/Completion-
   Logik registriert. Der Director kann diesen Provider bereits über
   `subagentProvider` nutzen; DSH-Jobs bleiben die Rückgabe-/Abbruchhülle.
   Falls Batch pro Rolle statt pro Director-Instanz wählbar sein soll, braucht
   es eine kleine upstream-Erweiterung für Transport-Auswahl (oder getrennte
   Director-Instanzen), aber keinen Fork als ersten Schritt. Die LLM-Route
   `provider: openrouter` allein ist kein Batch-Execution-Mode.

## Untersuchung des installierten Codes

Der tatsächlich installierte Code liegt unter:

`C:\Users\Joachim\.dsh\profiles\pts-web\node_modules\dsh-plugin-subagent-director`

- `lib/settings.js`: Schema und Write-Validierung; Rollen sind ein Dictionary
  mit `displayName`, `description`, `persona`, `provider`, `model`,
  `reasoningEffort` und optional `toolFilter.allow/deny`.
- `lib/route-resolver.js`: Auflösung `call args > role > plugin default >
  Parent`; Provider/Modell werden als Paar gegen die offizielle
  `subagent-model-selection.allowedModels`-Liste geprüft.
- `lib/delegation-tool.js`: registriert `subagent_role`; nimmt Rolle,
  Provider, Modell, Effort, Prompt und `run_in_background` entgegen; prüft
  Provider-Routbarkeit und Transport-Capabilities.
- `lib/orchestrate.js`: `/orchestrate` und dynamische Rollenliste; unabhängige
  Aufträge sollen parallel delegiert werden, jeder Subagent erhält einen
  selbständigen Prompt und keinen Parent-Kontext.
- `lib/close-tool.js` und `lib/bridge-entry.js`: Freigabe continuable Kinder
  und Web-Settings-Brücke. Die sichtbare UI ist keine eigene PTS-Dispatcher-
  oder Job-Lifecycle-Implementierung.
- `cordis.patch.yml`: installiert die Einträge
  `subagent-director` und `subagent-director-bridge` automatisch.

Wichtig: `subagentProvider` (Transport, etwa `spawn`) und der Rollenwert
`provider` (LLM-Route, etwa `openrouter`) sind zwei verschiedene
Namensräume.

## Drei Testrollen

Für den isolierten Spike wurden dieselben kurzen Vorgaben für diese Rollen
vorbereitet:

- `pts-pedagogy-reviewer`
- `pts-theology-reviewer`
- `pts-critical-reviewer`

Pädagogik und kritisches Review verwenden
`openrouter/deepseek/deepseek-v4-flash`; Theologie verwendet
`openrouter/google/gemma-4-26b-a4b-it:free`. Die Rollen sind in der isolierten
Test-Settings-Datei getrennt konfiguriert.

## Tests und Evidenz

| Test | Ergebnis | Evidenz |
|---|---|---|
| Installiertes Plugin und Paketversion | PASS | `package.json`, Plugin `0.5.0` |
| DSH-Komposition lädt Director + Bridge | PASS | `dsh --profile pts-web --dump-config` im isolierten DSH_HOME; beide Einträge sichtbar |
| Drei Rollen getrennt auflösen | PASS | `node tmp/dsh-director-spike/director-pure-test.mjs`; drei `layer: role`-Ergebnisse, drei Personas, zwei Modelle |
| Foreground / one-shot / continuable entscheiden | PASS | derselbe Pure-Test; alle drei Modi korrekt |
| DSH-Jobs für one-shot vorhanden | PASS | Kompositionsdump zeigt `@deepseek-ai/dsh-jobs-local` |
| Echter PTS-Drei-Agentenlauf mit identischem Denkstand | BLOCKED/FAIL | DSH-Boot scheitert in Sandbox bei Profil-Symlinkpflege mit `EPERM`; lokales Ollama scheitert am Log-Zugriff und hat keinen nutzbaren Bestand |
| Paralleler Lauf, Kontexttrennung, echte Persona-/Modellnutzung, Ergebnisrückgabe | UNVERIFIED | erfordert einen laufenden DSH-Webprozess und Modelladapter; Pure-Tests/Mocks zählen hierfür nicht als Abnahme |

Reproduzierbare lokale Befehle:

```powershell
node tmp/dsh-director-spike/director-pure-test.mjs
$env:DSH_HOME = (Resolve-Path tmp/dsh-director-spike).Path
dsh --profile pts-web --dump-config
```

Der erste Befehl endet mit `status: PASS` und listet alle drei Rollen. Der
zweite isolierte Dump zeigt den DSH-Jobs-Dienst sowie die beiden Director-
Einträge. Für die echte Abnahme muss DSH außerhalb der restriktiven
Sandbox/mit reparierter Profil-Symlinkpflege gestartet werden; danach ist der
kurze Drei-Rollen-Prompt mit vollständiger Session-/Job-Historie zu prüfen.

## Vergleich mit PTS aktuell

| Fähigkeit | PTS aktuell | Subagent Director | Bewertung |
|---|---|---|---|
| Rollen definieren | feste sechs Tool-Instanzen | dynamische Settings-Rollen | Director flexibler |
| Modell pro Rolle | fest im Preset | Rolle/Call/Default/Parent | Director flexibler |
| Persona pro Rolle | fest im Preset | Rollenfeld | funktional gleich, Director dynamischer |
| Tool-Konfiguration | feste Filter + Guards | optional `allow/deny` | PTS fachlich sicherer |
| Background | DSH one-shot + Steward-Scheduler | one-shot oder continuable | Director technisch breiter |
| mehrere parallele Agents | mehrere native Worker möglich | `isConcurrencySafe`, Fan-out vorgesehen | live noch unbestätigt |
| Fortsetzen | Worker one-shot; kein allgemeiner Rollen-Child | continuable-ID + `send_message`/close | Director stärker |
| Ergebniszuordnung | typisierte `pts_*`-Kanäle | Job-/Subagent-ID + Tool-Ergebnis | beide, PTS fachlich eindeutiger |
| UI/Transparenz | PTS-Aktivitätsstream und Fach-Tabs | Director-Settings, Child-Route-Anzeige | unterschiedliche Zwecke |
| PTS-Fachlogik | Schutz, Denkstand, Teacher-Gate | keine PTS-Kenntnis | PTS bleibt erforderlich |

## Entscheidung

Der Spike rechtfertigt **keine Architekturänderung**. Der Director ist ein
guter Kandidat für technische Rollen- und Delegationsverwaltung, aber die
entscheidende reale Fan-out-/Background-Abnahme fehlt. Nächster sicherer
Schritt wäre ein isolierter Live-Test mit einem ausdrücklich freigegebenen,
laufenden Modelladapter; erst danach ein kleiner Migrationsplan für die
nachweislich redundanten festen Subagent-Instanzen.

## Live-Abnahme-Versuch 2026-09-05

**BLOCKED** – Es wurden keine Modellaufrufe als erfolgreich gewertet.

- Die drei temporären Rollen wurden im Profil aktiviert und danach aus der
  gesicherten Settings-Datei vollständig wiederhergestellt.
- DSH initialisierte `pts-activity-stream` und `pts-background-steward`; der
  Server auf 3081 war lokal erreichbar.
- Ein zweiter Start scheiterte mit `EADDRINUSE`, weil der erste Start einen
  laufenden DSH-Prozess hinterlassen hatte. Dieser testgestartete Prozess wurde
  anschließend beendet.
- Der vorhandene Webserver antwortete ohne Browser-Session mit HTTP `401`.
  Kein CDP-Endpunkt auf 9222 oder 9223 war verfügbar; deshalb konnten Parent-
  Nachricht, drei echte Delegationen, Continuation und Session-Historie nicht
  ausgeführt bzw. nachgewiesen werden.
- Relevante reproduzierbare Befehle waren `dsh --profile pts-web --port 3081`,
  `netstat -ano | Select-String ':3081'` und der lokale HTTP-Aufruf auf
  `http://127.0.0.1:3081/`.

### Abschlussentscheidung

**B. Live-Nachweis reicht noch nicht aus; bestehende PTS-Struktur bleibt unverändert.**

## Headless-Nachtrag 2026-09-05

Der Browser/CDP-Pfad wurde ausdrücklich nicht verwendet. Ein isoliertes
Headless-Profil mit `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-headless`,
native jobs, `dsh-plugin-subagent-director` und der PTS-Testrollen-Konfiguration
wurde erfolgreich komponiert. Die Web-Bridge wurde nur in diesem isolierten
Profil deaktiviert.

| TestErgebnis | Ergebnis |
|---|---|
| Parent echter Modelllauf | FAIL/BLOCKED: vor dem Parent-LLM-Aufruf `NO_ADAPTER` |
| Director Tool verfügbar | PASS in der Komposition; Lauf konnte wegen Providerfehler nicht beginnen |
| `ctx.subagents.start` erreicht | nicht erreicht |
| Child erzeugt | nicht erzeugt |
| Child nutzt konfigurierte Persona | nicht verifiziert |
| Child nutzt konfigurierte Modellroute | nicht verifiziert |
| Ergebnis beim Parent | nicht verifiziert |

Reproduktion:

```powershell
$env:DSH_HOME = (Resolve-Path tmp/dsh-director-spike).Path
dsh --profile pts-web "... kurzer isolierter Testprompt ..."
```

Beobachteter Fehler:
`dsh: NO_ADAPTER: no adapter registered for provider "openrouter"`.
Der lokale Credential-Store enthält keine eingerichtete Provider-Referenz;
Ollama auf `127.0.0.1:11434` war ebenfalls nicht erreichbar. Es wurde kein
Secret in den Workspace kopiert und kein PTS-Bestand verändert. Der kleinste
nächste Fix ist ein separat bereitgestellter, funktionierender DSH-Provider im
isolierten Profil (mit vom Betreiber freigegebener Authentifizierung), danach
ist exakt derselbe Einzelrollen-Test erneut auszuführen.
