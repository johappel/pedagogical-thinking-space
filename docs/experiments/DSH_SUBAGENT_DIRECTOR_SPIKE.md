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
