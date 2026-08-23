# DSH-native Workspace gegen den PTS-Kernel

## Ergebnis

**PARTIAL**

Der direkte DSH-Start aus `workspace/dsh-native-smoke/` ist technisch möglich und die aktuelle Upstream-Semantik für Projektroot und `AGENTS.md` ist verifiziert. Der Lauf erreichte das DSH-Credential-Gate, bevor ein Modellschritt stattfand. Ein echter Nachweis für das sichtbare Pedagogical-Companion-Verhalten, strukturierte Rückfragen, kontrolliertes Fortschreiben oder die tatsächliche Modelllektüre des Workspaces liegt deshalb noch nicht vor.

## Versuchsanordnung

- Repository: `johappel/pedagogical-thinking-space`
- Branch: `experiment/dsh-native-workspace`
- Repository-Root: `F:\code\pedagogical-thinking-space`
- Konkretes `cwd`: `F:\code\pedagogical-thinking-space\workspace\dsh-native-smoke`
- Betriebssystem und Shell: Windows mit PowerShell
- Lokale Laufzeit: Node `v24.19.0`, pnpm `11.5.1`
- Verwendete DSH-Version: `0.1.1-rc.2`, ermittelt mit `dsh --version`
- Verifizierter DSH-Upstream-Snapshot: Commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` auf `deepseek-ai/deepseek-harness`
- Modell: nicht erreicht; ein Modell ist eine Testparameter- und keine PTS-Anforderung

Der konkrete Smoke-Start war:

```powershell
$env:DSH_HOME = 'F:\code\pedagogical-thinking-space\.tmp-dsh-home'
dsh --profile headless 'Behandle diesen Auftrag als Pedagogical Companion, nicht als Coding-Agent. Lies zuerst learning-design.md in diesem Workspace. Die Lehrkraft fragt: Wozu braucht es Religion? Kläre knapp den Unterstützungsbedarf und stelle genau eine sinnvolle Rückfrage. Produziere kein Unterrichtsmaterial und schreibe keine Datei.'
```

Der Lauf wurde aus dem konkreten `cwd` gestartet. DSH bootete das Profil, brach aber vor dem ersten Modellschritt mit folgendem reproduzierbaren Fehler ab:

```text
dsh: MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"
```

Ein Lauf mit einer bestehenden globalen Anmeldung wurde nicht durchgeführt. Dafür wäre die Übertragung der Root-Instruktionen und Workspace-Inhalte an den externen DeepSeek-Dienst erforderlich gewesen; diese Nutzung war für dieses Experiment nicht ausdrücklich autorisiert.

## Verifizierte DSH-Semantik

Die relevante Upstream-Implementierung wurde im genannten Commit gelesen:

- [`config.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/context/agent-instructions/src/config.ts#L12-L44) definiert `.git` als Standard-Root-Marker sowie `AGENTS.md` und `CLAUDE.md` als Standardkandidaten.
- [`files.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/context/agent-instructions/src/files.ts#L170-L207) läuft von `cwd` nach oben bis zum ersten Verzeichnis mit einem Root-Marker. Existiert kein Marker, fällt die Funktion auf `cwd` zurück.
- [`files.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/context/agent-instructions/src/files.ts#L271-L306) lädt anschließend die Kandidaten in der Kette vom Projektroot bis zum konkreten `cwd`. Verschachtelte `AGENTS.md` werden daher spezifischer als die Root-Datei.
- Die [Dokumentation des Instruction-Plugins](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/context/agent-instructions/README.md#L5-L10) beschreibt dieselbe Root-zu-`cwd`-Kette.

Wichtig für die Architekturannahme: DSH injiziert nicht automatisch jedes PTS-Kerndokument. Es lädt die `AGENTS.md`-Kette als Instruktionskontext. Die Root-`AGENTS.md` dieses Repositories enthält die Boot-Reihenfolge und weist den Agenten an, die übrigen Kernel-Dokumente zu lesen. Damit bleibt DSH für den Kernel neutral; die PTS-MetaHarness-Logik liegt in der Root-Instruktion.

## Erwartete Boot-Kette

```text
DSH
  -> cwd: workspace/dsh-native-smoke
  -> project root: pedagogical-thinking-space (über .git)
  -> Root-AGENTS.md als DSH-Instruktionskontext
  -> von Root-AGENTS.md angeforderte PTS-Kerndokumente
  -> aktuelle Workspace-Artefakte in workspace/dsh-native-smoke
```

Die erste und zweite Stufe sind durch Upstream-Quelltext und den direkten Start belegt. Die Modelllektüre der letzten beiden Stufen ist wegen des Credential-Gates offen.

## Kernel-Neutralität

Die Prüfung der kanonischen Kernel-Dokumente und des lokalen Harnesses ergab:

- Keine explizite Abhängigkeit des kanonischen Kernels von `ptspace-app`.
- Keine notwendige Abhängigkeit von OpenCode, einem bestimmten LLM oder Provider in `AGENTS.md`, `README.md`, den PTS-Kerndokumenten, Services, Specs oder Capabilities.
- `.opencode/opencode.json` enthält weiterhin optionale OpenCode-/Modellkonfiguration. `harness/config/models.yml` dokumentiert optionales Level-3-Routing. Beide Dateien werden vom Kernel nicht vorausgesetzt und wurden für dieses Experiment nicht bereinigt.
- Die lokalen Harness-Skripte sind optionale Referenz-/Ausführungsinfrastruktur; sie verändern die Kernel-Semantik nicht.
- Es war keine DSH-spezifische Anpassung am Kernel nötig.

## Minimaler Testworkspace

Der Workspace enthält ausschließlich:

```text
workspace/dsh-native-smoke/
├── learning-design.md
├── learning-landscape.md
├── temporal-plan.yml
├── planning-board.yml
├── decisions.yml
└── materials/
```

Er enthält keine eigene `AGENTS.md`, keine Kernelkopie, keine OpenCode-Konfiguration, keinen `ptspace-app`-Zustand und keine fertigen Unterrichtsmaterialien. `learning-design.md` beschreibt nur den vorläufigen Referenzfall „Wozu braucht es Religion?“. Es gibt noch keine genehmigte pädagogische Entscheidung und keine Worker-Aufgabe.

## Beobachtung

### Tatsächlich funktioniert

- Der Branch war bereits `experiment/dsh-native-workspace`.
- DSH `0.1.1-rc.2` ist lokal ausführbar.
- Der Start direkt aus dem untergeordneten Workspace ist möglich.
- DSH findet die aktuelle Profil-/Runtime-Konfiguration und erreicht die LLM-Authentifizierungsprüfung.
- Der Workspace bleibt vom Kernel getrennt; es wurde dort keine `AGENTS.md` angelegt.

### Nur angenommen oder offen

- Nicht belegt ist, dass DSH im Modellkontext die Root-`AGENTS.md` tatsächlich befolgt und die PTS-Dokumente in der geforderten Reihenfolge liest.
- Nicht belegt ist das sichtbare Verhalten als Pedagogical Companion statt als Coding-Agent.
- Nicht belegt sind eine sinnvolle Unterstützungsmodus-Klärung, genau eine passende Rückfrage und die Zurückhaltung bei Materialproduktion.
- Nicht belegt ist ein kontrolliertes Lesen oder Fortschreiben des Workspace-Denkstands. Der abgebrochene Lauf schrieb keine Workspace-Datei.
- Verschachtelte Instruktionsdateien wurden aus dem Upstream-Code verifiziert, aber in diesem Workspace bewusst nicht angelegt und daher nicht als Lauf getestet.

## Sicherheits- und Datenschutzgrenze

Ein echter Modelltest würde mindestens die Root-`AGENTS.md` und den Smoke-Workspace an einen externen Provider senden. Der Test wurde an dieser Stelle nicht durch die globale Anmeldung erzwungen. Damit sind die offenen Akzeptanzpunkte sichtbar, statt einen nicht autorisierten oder nicht reproduzierbaren Modelllauf als Beleg auszugeben.

## Abgleich mit den Akzeptanzkriterien

| Kriterium | Status | Beleg |
|---|---|---|
| Branch verwendet | erfüllt | `git status --short --branch` auf `experiment/dsh-native-workspace` |
| Kernel auf Bindungen geprüft | erfüllt | Repository-Suche und Abschnitt „Kernel-Neutralität“ |
| Reale DSH-Semantik verifiziert | erfüllt | gepinnter Upstream-Commit und Quelltextlinks oben |
| Kein kopierter Kernel im Workspace | erfüllt | Workspace-Inventar oben |
| Keine eigene `AGENTS.md` im ersten Versuch | erfüllt | `Test-Path workspace/dsh-native-smoke/AGENTS.md` ergab `False` |
| Direkter Start möglich oder Blocker belegt | teilweise erfüllt | Profilstart möglich; Modellstart blockiert durch `MISSING_CREDENTIAL` |
| Companion-Charakter geprüft | offen | kein Modellschritt wegen Credential-Gate |
| Strukturierte Rückfragen geprüft | offen | kein Modellschritt wegen Credential-Gate |
| Kein unnötiger Umbau | erfüllt | nur Smoke-Workspace, Dokumentation und Git-Ausnahme |
| Klares Ergebnis | erfüllt | `PARTIAL` mit Begründung |

## Handoff

Geändert wurden:

- `.gitignore` — der reproduzierbare Smoke-Workspace wird trotz des allgemeinen Ausschlusses aktiver Workspaces versionierbar.
- `workspace/dsh-native-smoke/learning-design.md`
- `workspace/dsh-native-smoke/learning-landscape.md`
- `workspace/dsh-native-smoke/temporal-plan.yml`
- `workspace/dsh-native-smoke/planning-board.yml`
- `workspace/dsh-native-smoke/decisions.yml`
- `workspace/dsh-native-smoke/materials/.gitkeep`
- `docs/experiments/DSH_NATIVE_WORKSPACE.md`

Die maximal drei nächsten Schritte sind:

1. Eine ausdrücklich autorisierte, datensensible DSH-Modellsession mit einem Testmodell durchführen.
2. Im Laufprotokoll prüfen, ob Root-`AGENTS.md`, Kerndokumente und `learning-design.md` tatsächlich gelesen werden.
3. Das Ergebnis des Modellverhaltens als `PASS`, `PARTIAL` oder `FAIL` nachtragen; keine Kernel- oder UI-Architektur daraus vorziehen.

---

# Service Delegation Spike

## Ergebnis

**PARTIAL**

DSH bietet einen nativen, echt separaten Delegationsmechanismus (das
`subagent`-Werkzeug), der die PTS-Kette `Companion -> Service Request ->
separater Dienst -> Ergebnis zurück` sehr direkt abbildet. Die Übersetzung
braucht nur eine kleine, klar begrenzte Persona-/Instruktionsschicht, keinen
Kernel-Umbau. Ein echter, autorisierter Modelllauf, der beweist, dass ein
separater Subagent die bounded inquiry ausführt und der Hauptagent die Arbeit
vermeidet, wurde – wie im Smoke-Test – wegen des Credential- und
Datenschutz-Gates nicht erzwungen.

## Verwendeter DSH-Commit / Version

- Lokale DSH-CLI: `0.1.1-rc.2` (`dsh --version`), installiert als
  `@deepseek-ai/dsh` unter `C:\nvm4w\nodejs\node_modules\@deepseek-ai\dsh`.
- Die Delegationsmechanik wurde direkt an den installierten Plugin-Paketen und
  ihren `README.md`/`.d.ts`-Dateien verifiziert (siehe unten), nicht aus
  früheren Gesprächen angenommen.

## 1. Verifizierte PTS-Semantik

Erneut gelesen: `AGENTS.md`, `ORCHESTRATION.md`, `services/WORKER.md`,
`specs/SERVICE_REQUEST_SCHEMA.md`, `capabilities/workers/RESEARCH_PEDAGOGICAL_ALTERNATIVES.md`.

- **Wann darf der Companion delegieren?** Erst wenn ein sichtbares Mandat und
  eine Genehmigung vorliegen: ein `board_item`, ein `explicit_chat` oder eine
  `bounded_session` mit definiertem Thema, Quellumfang, Maximalscope und
  Rückgabeformat. Das Verschieben einer Board-Karte zählt nicht als Genehmigung.
- **Welches Artefakt ist ein Service Request?** Eine kleine, modell-agnostische,
  nachvollziehbare YAML-Beschreibung nach `SERVICE_REQUEST_SCHEMA.md` mit den
  Feldern `service`, `mode`, `task`, `capability`, `mandate`, `input`,
  `expected_output`, `constraints`, `epistemic_requirements`, `return_to`.
- **Welche Felder sind für diesen Research-Fall erforderlich?**
  `input.pedagogical_tension`, `input.existing_approach`,
  `input.research_scope` (`near_fit: 1`, `contrast: 1`, `maximum_sources`),
  `input.source_requirements`, `expected_output.location`,
  `epistemic_requirements.mark_uncertainty/include_source_quality`.
- **Welche Verantwortung bleibt beim Companion?** Er prüft Quellqualität,
  Annahmen, Ripple-Effekte und Relevanz und verdichtet das Ergebnis zu höchstens
  einem Impuls. Worker-Ergebnisse gehen nie direkt an die Lehrkraft oder auf
  `ready`.
- **Was darf ein Worker ausdrücklich nicht?** Lernziele/Werte definieren, die
  Richtung wählen, für Abwesende sprechen, diagnostizieren, Interpretation zu
  Fakten machen, einen ungefilterten Katalog liefern oder das Learning Design
  autonom ändern.
- **Wie kommt das Ergebnis zurück?** Als strukturiertes Ergebnis an den
  Companion (`return_to: critical_friend`), nicht direkt an die Lehrkraft.

## 2. DSH-native Delegationsmechanik (verifiziert)

Die installierte DSH-Version bringt eine vollständige Subagent-Familie mit. Die
für diesen Fall relevanten Pakete:

- `dsh-tool-subagent` — das modell-seitige Delegationswerkzeug. Der Hauptagent
  ruft es auf, um einen **echten separaten Child-Agenten** zu starten
  (one-shot oder continuable). Standardmäßig sammelt es synchron (wartet auf das
  Child-Ergebnis und entsorgt den Run); one-shot-Background läuft als Task über
  `dsh-jobs`. Start-Optionen: Modellwahl, `outputSchema` (strukturiertes
  Endergebnis erzwingen), `depthLimit`, `toolFilter` (Child-Werkzeuge
  einschränken), `persona` (Child-Rolle).
- `dsh-subagent` — der Dienst-Seam `ctx.subagents` mit Lebenszyklus,
  Descriptor, Delegationstiefe und Policy-Vererbung. Delegierte Kinder laufen mit
  fixiertem Sandbox-Scope und `approval: never`.
- `dsh-subagent-spawn-in-process` / `dsh-subagent-fork-in-process` /
  `dsh-subagent-in-process-driver` — die In-Process-Treiber. `spawn` startet ein
  Kind ohne Eltern-Historie, `fork` mit sichtbarer Eltern-Historie.
- `dsh-tool-subagent-report` — installiert im continuable Child ein
  `report`-Werkzeug als **strukturierten Rückkanal** zum startenden Agenten.
- `dsh-tool-subagent-control` — Eltern-zu-Kind-Richtung (`send_message`,
  `interrupt`, `list_agents`).
- `dsh-agent-presets` — komponiert Werkzeuge/Prompt-Abschnitte eines Subagenten;
  ein Child erbt die Preset-Komposition des Elternteils via `composeFrom()` und
  kann per `toolFilter`/`persona` eingeschränkt werden.
- `dsh-jobs` / `dsh-tool-jobs` / `dsh-client-ui-jobs` und
  `dsh-client-ui-subagent` — Background-Tasks und die zugehörige UI-Fläche.

Rückgabe zum Companion erfolgt auf zwei sichtbaren Wegen: (a) das kindseitige
`report` (nächster Schritt oder still injiziert) und (b) eine vom Runtime
erzeugte **Settlement-Notice** an den Eltern-Agenten, sobald das Kind fertig ist
(`Background subagent <id> finished …` samt Schlussnachricht). Beide sind als
Ergebnis eines separaten Dienstes erkennbar (`source: subagent-report` bzw.
`subagent-settled`), nicht als Eigenaussage des Hauptagenten.

## 3. Dünnste Übersetzung

Die kleinste notwendige Abbildung besteht aus zwei Teilen und keinem Plugin:

1. **Persona** — `docs/experiments/dsh-native-workspace/subagent-persona-research-alternatives.md`
   trägt die Regeln aus `RESEARCH_PEDAGOGICAL_ALTERNATIVES.md` in einen
   DSH-Subagenten. Empfohlener `toolFilter`: nur Lesen, Dateisuche, Websuche und
   `report`; kein Schreiben außerhalb der `expected_output.location`.
2. **Delegations-Instruktion** — die beobachtete Schwäche aus dem Smoke-Test
   (der Hauptagent kündigt Delegation an, arbeitet aber selbst weiter) wird
   dadurch adressiert, dass der Companion bei einem genehmigten
   `research_pedagogical_alternatives`-Request das `subagent`-Werkzeug aufruft,
   statt die Recherche im Hauptkontext auszuführen.

Zielkette:

```text
Pedagogical Companion
  -> erzeugt gültigen PTS Service Request (service-requests/pb-alt-perspektiven.yml)
  -> ruft DSH subagent-Werkzeug mit Persona + toolFilter auf
  -> separater DSH-Child (spawn/one-shot) führt die bounded inquiry aus
  -> Child schreibt drafts/pb-alt-perspektiven-alternatives.md und ruft report auf
  -> report + Settlement-Notice kehren zum Companion zurück
  -> Companion prüft Quellqualität/Annahmen und verdichtet
  -> erst dann ein knapper Impuls im Gespräch
```

## 4. Korrekte Ablage des Service Requests

Prüfung von Task 4: Der bisherige Pfad
`workspace/dsh-native-smoke/drafts/pb-alt-perspektiven.md` entsprach **nicht** der
kanonischen PTS-Semantik. `harness/dispatcher.py` scannt Service Requests unter
`workspace/<project-slug>/service-requests/*.yml`; `drafts/` ist laut Capability
der Ort für das **Ergebnis** (`pedagogical_alternatives_brief`).

Korrigiert:

- Kanonischer Request neu unter
  `workspace/dsh-native-smoke/service-requests/pb-alt-perspektiven.yml`
  (reines YAML, `id` + `status: approved` für den Dispatcher-Approval-Gate).
- Der alte Draft wurde durch einen Zeiger ersetzt, statt stillschweigend als
  Request verwendet zu werden.
- Keine neue dauerhafte Kernelstruktur nur für DSH eingeführt; die
  `service-requests/`-Konvention existierte bereits.

## 5. Testfall

Der laufende Fall bleibt unverändert: „Wozu braucht es Religion?“ — die Lehrkraft
möchte andere Perspektiven zum Einstieg kennenlernen. Der Worker soll je einen
nahen und einen kontrastierenden Zugang mit Annahmen und Integrationskosten
sichtbar machen. Der Companion soll danach keinen Recherchebericht dumpen,
sondern höchstens einen Impuls zurückbringen.

Ein echter Modelllauf des Subagenten wurde nicht erzwungen: Er würde – wie im
Smoke-Test – mindestens Persona, Request und Workspace an den externen
DeepSeek-Provider senden und traf im Smoke-Test das reproduzierbare
`MISSING_CREDENTIAL`-Gate. Diese Nutzung war für das Experiment nicht ausdrücklich
autorisiert. Damit bleibt der separate Ausführungsweg als DSH-Mechanik belegt,
aber nicht als durchgeführter Lauf.

## 6. Beobachtbare DSH-Stream-Events

Beim Delegationsablauf entstehen laut Plugin-Verträgen diese Events (nur
dokumentiert, keine UI gebaut):

| DSH-Event | Bedeutung | Mögliche PTS-Surface-Übersetzung |
|---|---|---|
| `subagent/provider-added` | Delegationsanbieter registriert | (intern, nicht anzeigen) |
| `subagent/start` (`runId`, `local`) | separater Child-Run beginnt | „Recherche wird vorbereitet …“ |
| `turn/start` im Child | Child arbeitet einen Schritt | „Zwei Perspektiven werden geprüft …“ |
| `subagent-report` (`report`-Werkzeug) | strukturiertes Zwischen-/Endergebnis an Parent | „Ein Zwischenstand liegt vor …“ |
| `subagent/end` + Settlement-Notice | Child fertig, Ergebnis am Parent | „Recherche abgeschlossen“ |

Bewertung: Die Events tragen genug Semantik (`start` / `report` / `end` +
`runId`), um sie später auf eine PTS-Oberfläche in pädagogische Statuszeilen zu
übersetzen, statt technische `Read/Write/Task`-Details zu zeigen. Eine
UI-Umsetzung ist ausdrücklich nicht Teil dieses Spikes.

## 7. Bekannte Brüche zur PTS-Semantik

- **Selbstausführungs-Neigung:** Ohne die explizite Delegations-Instruktion neigt
  der Hauptagent dazu, die Recherche selbst zu erledigen. Die Persona allein
  erzwingt die Delegation nicht; die Instruktion muss den Werkzeugaufruf verlangen.
- **Rückgabeformat:** DSH liefert freie Assistenz-/Report-Texte. Die PTS-Grenze
  „Companion verdichtet, Lehrkraft bekommt höchstens einen Impuls“ ist eine
  Prompt-Konvention, keine erzwungene DSH-Mechanik. `outputSchema` kann die
  Struktur des Endergebnisses erzwingen, nicht die Zurückhaltung des Companions.
- **Approval-Gate:** PTS kennt `requires_approval`/`status: approved`; DSH prüft
  das nicht selbst. Der Dispatcher-Approval-Gate bleibt PTS-seitig.
- **Credential-/Datenschutzgrenze:** Ein Lauf sendet Kernel + Workspace an einen
  externen Provider. Das bleibt eine bewusste Freigabeentscheidung.

## 8. Geänderte / neue Dateien in diesem Spike

- `workspace/dsh-native-smoke/service-requests/pb-alt-perspektiven.yml` — neu, kanonischer Request.
- `workspace/dsh-native-smoke/drafts/pb-alt-perspektiven.md` — Inhalt durch Zeiger ersetzt (war fälschlich Request).
- `docs/experiments/dsh-native-workspace/subagent-persona-research-alternatives.md` — neu, experimentelle Persona (dünnste Übersetzung).
- `docs/experiments/DSH_NATIVE_WORKSPACE.md` — dieser Abschnitt.

## 9. Bewertung und nächste Schritte

Ergebnis: **PARTIAL** — die Delegation funktioniert grundsätzlich über DSH-native
Subagents und braucht nur eine klar begrenzte Persona-/Instruktionsschicht, kein
Kernel-Redesign. Der echte separate Lauf ist als Mechanik belegt, aber nicht
autorisiert ausgeführt.

Maximal drei nächste Schritte:

1. Einen ausdrücklich autorisierten, datensensiblen DSH-Lauf durchführen und im
   Trajektorien-/Job-Log prüfen, ob wirklich ein separater `subagent/start` →
   `subagent/end` entsteht und der Hauptagent die Recherche vermeidet.
2. Die Delegations-Instruktion minimal in der Companion-Boot-Kette verankern
   (nur für `research_pedagogical_alternatives`), damit der Werkzeugaufruf statt
   Selbstausführung erfolgt — ohne globale Routing-Architektur.
3. Prüfen, ob `outputSchema` sinnvoll das `pedagogical_alternatives_brief`-Format
   erzwingen kann, ohne die Companion-Zurückhaltung zu ersetzen.
