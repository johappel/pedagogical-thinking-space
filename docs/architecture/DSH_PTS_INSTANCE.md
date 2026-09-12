# PTS Core auf DSH — Architektur, Umsetzung und Befunde

Stand: 2026-09-11 · Instanz `pts` (DSH 0.1.5-rc.2, Windows, Node v24.19.0) ·
DSH-Home `F:\dsh-instances\pts\.dsh` · Repo `F:\code\pedagogical-thinking-space`

> **Verdikt: PASS WITH CONDITIONS.**
> PTS Core ist als Komposition gebaut und läuft: eigenes Profil, eigenes
> Agent-Preset, sichtbarer Companion, sieben native DSH-Rollen, dünne
> preset-lokale Module, UI-unabhängig, ohne eigene Session-, Tool- oder
> Worker-Infrastruktur. Der Preset-Mount ist live bewiesen, ebenso die Abnahme
> an einer echten Companion-Session (§9.5: Werkzeuggrenze, Delegation,
> dynamischer Denkstand-Kontext). Es bleiben zwei Bedingungen: der
> Domain-Store-Spike und das Entfernen der `pts-web`-Altlasten nach der
> Freigabe.

> **Fragenkatalog §21.** Die 15 Fragen sind in **§12** eins zu eins beantwortet;
> die Abschnitte 3–11 liefern die Belege dazu.

---

## 1. Ergebnis in einem Absatz

`dsh --profile pts` startet eine eigenständige, isolierte PTS-Instanz. Sie
besteht aus **einem Profil** (`dsh/profiles/pts`, Host-Ebene: Port,
Sandbox-Fallback, Roster-Default, Capability-Inserts), **einem Agent-Preset**
(`dsh/presets/pts-companion`, Session-Ebene: Persona, Methodik-Sektion,
Denkstand-Projektion, Toolmenge, Autoritätsgrenze, sieben Rollen) und **zwei
eigenständig installierbaren Capabilities** (`plugins/pts-demo-capability`
bewusst inaktiv, `dsh-whiteboard` als Fremd-Capability). Es gibt kein
`pts-core`-Plugin, keinen eigenen Worker-Runtime, keinen Domain-Store, keine
eigene Persistenz und keine eigene Tool-Pipeline: alles davon ist DSH.

## 2. Die drei Ebenen

| Ebene | Ort | Inhalt | Regel |
| --- | --- | --- | --- |
| **DSH-Plattform** | installiertes `@deepseek-ai/dsh` | Sessions, Agent-Loop, Tools, Subagents, Jobs, Persistenz, Web-Client, Modellroute, Sandbox | nicht angefasst; keine Änderung unter `packages/` |
| **PTS Core** | `dsh/profiles/pts/cordis.patch.yml` (Host) · `dsh/presets/pts-companion/` (Agent) | Identität, Denkmethode, Rollen, Delegationsgrenze, Instanz-Defaults | kennt keine Capability; keine Capability kennt PTS Core |
| **Optionale Capabilities** | `plugins/*` + eigene Insert-Zeile im Profil | eigene Tools, eigene Prompt-Kontexte, später eigene UI | additiv; Entfernen ändert PTS Core nicht |

### 2.1 Wo was liegt — Definition, Bestand, Entwicklung, Persönliches

PTS trennt die **Definition** vom **Bestand**. Das ist keine Ordnungsfrage,
sondern eine Sicherheitsentscheidung: der Sandbox-`workspaceRoot` zeigt auf den
Bestand, damit ist das Repo für jede Session nur lesbar. Ein Worker mit `write`
im `toolFilter` kann seinen Denkraum ändern — aber nicht das Preset, den Patch,
die Vertragsdokumente oder `.git`.

| Ort | Inhalt | Versionierung | Schreibzugriff |
| --- | --- | --- | --- |
| **Definition** `<repoRoot>` (`F:\code\pedagogical-thinking-space`) | `dsh/` (Profil + Preset), `plugins/`, `scripts/`, `tests/`, `docs/`, `specs/`, Vertragsdokumente (`CRITICAL_FRIEND.md`, `SYSTEMIC_STANCE.md`, …) | Git | Mensch (Installer) schreibt; Sessions lesen |
| **Bestand** `<dataRoot>` (diese Instanz: `F:\dsh-instances\pts`) | `denkraeume/<slug>/` (Arbeitsräume), `knowledge/` (Curricula, Methoden, Quellen), `skills/` (gewachsene Skills) | keine — lokal, gesichert statt versioniert | Sessions schreiben hier (Sandbox-Wurzel = `<dataRoot>/denkraeume`) |
| **Persönlich/übergreifend** `F:\knowledge` | OKF-Wissensbibliothek (`belegen`, `wissensdokumentar`) | eigene Pflege | außerhalb beider |
| **Entwicklung** (kein Teil der Instanz) | Autorenbereich: Bau-Spiegel und Verifikation; derzeit `<dataRoot>/Denkraum` | keine | nur der Autoren-Agent |

Beide Wurzeln stehen zusammen im nativen Settings-Dokument
(`<DSH_HOME>/settings.yaml` → `pts: { repoRoot, dataRoot }`); der Installer
liest, validiert und materialisiert sie. `customSkillDirs` nennt **beide**
Skill-Wurzeln, damit das Repo Startskills ausliefern kann, ohne den gewachsenen
Bestand einer Lehrkraft zu überschreiben. Eine Folge der Trennung ist bewusst:
die `AGENTS.md`-Discovery des Repos erreicht einen Denkraum nicht mehr; die
Instanz-Orientierung trägt die Methodik-Sektion des Presets (§7), nicht die
Repository-Datei.

Die Datenwurzel leitet sich aus dem Home ab (`<dataRoot>` ist der Elternordner
von `<DSH_HOME>`, so der Installer-Default; sie enthält also auch `.dsh` selbst).
In sie gehört **kein** Entwicklungsartefakt: der Autorenbereich dieser Instanz
liegt zurzeit noch unter `<dataRoot>/Denkraum` — ein Repo-Spiegel (17 Dateien,
vollständig und hash-identisch im Repo enthalten, damit verwerfbar). Für
PTS-Sessions ist er unerreichbar, weil deren Sandbox-Wurzel
`<dataRoot>/denkraeume` ist; begrifflich gehört er nach außen. Ein Umzug ist
vorgemerkt, aber nicht entschieden.

Der Beweis für die Additivität ist `plugins/pts-demo-capability`: eine Zeile im
Profil, ein Tool, keine Änderung an Preset oder Persona (siehe §9.4).

## 3. OLD PTS → CURRENT DSH (Mechanismus-Mapping)

| Alter Mechanismus | Heutiges DSH-Primitiv |
| --- | --- |
| `pts-web`-Client/Server (`dsh-plugins/*`, `start-pts-web.ps1`, `pts-web-profile.settings.example.yaml`) | DSH-Web-App des Profils (`dsh --profile pts --port 3030`); Phase 1 ohne UI-Eingriff |
| Worker-Register + Routen-Rendering (`worker-routes.mjs`, `scripts/render-worker-routes.mjs`, `pts-skill-manager/lib/worker-routes-source.js`) | sieben `dsh-tool-subagent`-Zeilen: Rolle = Konfiguration (Persona, Modell, `toolFilter`, `maxDepth`, `backgroundMode`) |
| eigener Subagent-Lebenszyklus, eigene Queue | `provider: spawn` (in-process), continuable Kinder, `maxDepth: 1`; DSH startet, hält und beendet sie |
| `pts_edit_legacy` über eigenes Tool-Modul (`direct-pts-edit.mjs`) | `pts_edit` als **one-shot**-Subagent (`backgroundMode: one-shot`) — Übergangslösung bis zum Domain-Store-Spike |
| Worker-Skill-Scoping (`worker-skill-scope.mjs`, `pts-skill-manager`, `scripts/render-worker-routes.mjs`) | `dsh-skill-filesystem` mit `customSkillDirs` + `dsh-tool-skill`; Skills liegen in der Preset-Schicht, nicht im Agenten |
| Boot-Dokumente (`boot-docs.mjs`) | `dsh-agent-instructions` liest `AGENTS.md` ab der Projektwurzel (`.git`-Marker) |
| Workspace-Snapshot + Focus (`workspace-snapshot.mjs`, `focus-context.mjs`) | `ctx.systemPrompt.context()` (budgetierte, bei jeder Assemblierung frische Projektion); der Focus-Slot entfällt, weil eine Auswahl erst mit einer Capability eine Quelle hat |
| Companion-Tool-Grenze (`companion-tool-boundary.mjs`, alt) | dieselbe Absicht über `agent.ctx.tools.restrict/guard` — aber am **Standing-Mount-Vertrag** (§5) |
| monolithische Persona im Preset (`dsh-persona` mit `text:`) | `dsh-persona` mit `prefix:` + `prompt/persona.md` (Identität/Haltung) + `prompt/framework.md` (Methode) |
| `sandbox-workspace-scope`, `pts-workspaces`, `pts-workspace-git` | `dsh-sandbox-policy` (`mode`, `workspaceRoot`) + Session-cwd = Denkraum; Workspace-Registry führt DSH |
| Domain-Store und Client-Plugins (`pts-denkstand`, `pts-landscape`, `pts-moment-workshop`, `pts-activity-stream`, `artifact-panel`, `pts-conversation-binding`, `pts-web-brand`) | Phase 2: DSH-Client-Plugin + Slot-Architektur; in Phase 1 bewusst nicht ersetzt |
| `install-pts-preset.ps1`, `install-pts-web-plugins.ps1` | `scripts/install-pts-instance.ps1` rendert **Profil und Preset** in den Home |

## 4. Die Komposition im Detail

### 4.1 Host-Ebene — `dsh/profiles/pts/cordis.patch.yml`

| Zeile | Inhalt | Warum dort |
| --- | --- | --- |
| `webserver` | `host`/`port` aus dem App-Argument, Fallback 3030 | Port ist instanzweit, nicht sitzungsbezogen |
| `sandbox-policy` | `mode` aus `DSH_PERMISSION_MODE`, `workspaceRoot` = `<dataRoot>/denkraeume` | Fallback für Aufrufe ohne Session-cwd; der echte cwd ist der Denkraum. **Nicht** das Repo: die Definition bleibt lesbar, nicht schreibbar (§2.1) |
| `agent-presets` | `default: pts-companion` | Deployment-Default; **Startartefakt** (§9.2) |
| `insert: pts-demo-capability` | absoluter Pfad, `disabled: true` | optionale Capability, ohne PTS Core zu berühren |
| `insert: dsh-whiteboard` | `inject: [webServer]` | Fremd-Capability; nur Koexistenz, keine Integration |

Bundles bleiben `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`
(`dsh.profile.bundles`); das ist die kleinste Web-Instanz ohne eigene Pakete.

**Wo der Repopfad herkommt.** Die Komposition ist statisch: `customSkillDirs`,
die Referenzwurzel und die gerenderten Zeilen werden beim Installieren
festgeschrieben. Diese Werte kann deshalb kein Laufzeitdienst liefern — ein
Settings-Namespace wäre das falsche Werkzeug, und er ist ohne Registrierung
nicht einmal lesbar: `settings.update('pts', …)` antwortet
`namespace "pts" is not registered`, `settings.get('pts')` liefert `undefined`,
und die Registrierung verlangt ein Schema (`z.object(…)`), das ein repo-lokales
Plugin nicht importieren kann (kein `node_modules` im Repo). Die Einstellung
liegt daher im nativen Settings-Dokument und wird vom **Installer** materialisiert:

```yaml
# $DSH_HOME/settings.yaml
pts:
  repoRoot: 'F:/code/pedagogical-thinking-space'
```

Vorrang: ein ausdrücklich übergebenes `-RepoRoot` gewinnt, sonst gilt das
Dokument; zeigt es nicht auf ein PTS-Repo (kein
`dsh/presets/pts-companion/agent.cordis.yml`), warnt der Installer, nutzt seinen
eigenen Skriptpfad und repariert den Eintrag. `start-pts.ps1 -Sync` erzwingt den
Pfad bewusst nicht mehr.

### 4.2 Agent-Ebene — `dsh/presets/pts-companion/agent.cordis.yml`

Reihenfolge und Absicht (23 Zeilen, flach plus zwei Gruppen):

| Zeile | Zweck |
| --- | --- |
| `persona` | `prefix` aus `prompt/persona.md` (`!!js` liest die Datei über `baseUrl`); `suffix` bewusst weggelassen, damit der Deployment-Suffix („working directory …") verschwindet |
| `pts-context` | preset-lokales Modul: stabile Methodik-Sektion + dynamische Denkstand-Projektion |
| `tool-fs`, `tool-fs-search` | Lesen/Suchen (Schreiben delegiert der Companion) |
| `tool-web`, `tool-jobs`, `tool-ask-user`, `present` | Recherche-Ergebnisse einsammeln, Hintergrundjobs, Rückfrage, Anzeige |
| `tool-subagent-control` (+ `list-agents`) | continuable Kinder steuern |
| `agent-instructions` | `AGENTS.md` des Denkraums/Repos, 16 KiB Deckel |
| `skill-filesystem` (`customSkillDirs: <repo>/skills`) + `tool-skill` | Skills aus der Preset-Schicht |
| Gruppe `pts-workers` | sieben `dsh-tool-subagent`-Zeilen (§6) |
| Gruppe `compaction` (isoliert) | `compaction-basic` + `tool-result-pruner`; Realm, weil beide Dienste publizieren |
| `companion-tool-boundary` | preset-lokales Modul: Sichtbarkeit und Ausführung der Werkzeuge des Companion |

Zwei Zeilen sind Preset-lokal und **keine** Capabilities: ein Modul, das relativ
zur Komposition aufgelöst wird, gehört neben sie (Abweichung von der Skizze
§17, die `plugins/` für Capabilities reserviert).

**Pfadregel der Preset-Komposition.** Jeder Pfad, der ins Repository zeigen
muss, läuft über den Platzhalter `@PTS_ROOT@`, den der Installer beim Rendern
ersetzt (Referenzwurzel für `pts-context`, `customSkillDirs` für
`skill-filesystem`). `!!js … new URL(…, baseUrl)` ist nur für Pfade
**innerhalb** des Preset-Verzeichnisses zulässig (z. B. `prompt/persona.md`).
Grund: die Komposition liegt im DSH-Home, ein Aufstieg mit `../` landet dort und
nicht im Repository (§9.5, Befund c). Der Installer prüft die Wertzeilen und
bricht ab, wenn ein Platzhalter stehenbleibt.

## 5. Die zwei preset-lokalen Module

`pts-context.mjs`
* Stabile Sektion `pts:framework` (Order 400, also nach der Deployment-Persona,
  vor der Tool-Anleitung) aus `prompt/framework.md`.
* Dynamischer Kontext `pts:denkstand` (Order 200, also nach Policy-/Delegations-
  Kontexten): liest die kanonischen Denkstand-Dateien
  (`learning-design.md`, `learning-landscape.md`, `planning-board.yml`,
  `decisions.yml`, `temporal-plan.yml`), parst die `##`-Abschnitte
  (`specs/LEARNING_DESIGN_SCHEMA.md`), kürzt auf 4000 Zeichen, nennt
  Verzeichnisse nur mit Namen. Reine Leseoperation, kein Store, kein Write-Pfad.
* Beide Beiträge werden **pro Root-Companion** in dessen eigenen Scope
  installiert, über den Agent-Registry-Seam.

`companion-tool-boundary.mjs`
* Entfernt `skill`, `web_search`, `web_fetch`, `write`, `edit` aus der sichtbaren
  Menge (`tools.restrict`) und verweigert `bash`, `pwsh`, `run_code`, `workflow`,
  `subagent`, `subagent_fork` zusätzlich per `tools.guard` mit Delegationshinweis.
* Arbeitet **nur** für Root-Agenten auf `pts-companion`
  (`agent.session.header.origin !== 'subagent'` plus `composedPreset`), damit die
  Subagenten genau die Autorität ihres `toolFilter` behalten.
* Begründung „restrict statt nur guard": ein sichtbares, aber blockiertes
  `skill` würde den Katalog in jeden Turn injizieren und zum Direktaufruf
  einladen.

**Der Standing-Mount-Vertrag** ist die zentrale Lehre dieses Baus: ein Preset
wird **einmal pro Prozess** unter einem Standing-Scope gemountet, jede Session
tritt ihm bei. Es gibt dort *kein* `ctx.agent`; ein Zugriff darauf lässt den
**gesamten** Mount scheitern. Per-Session-Arbeit hängt deshalb am
Agent-Registry-Seam (`inject: ['agents']`, `agents.list()`,
`ctx.on('agent/created' | 'agent/disposed')`).

## 6. Rollen (§7 des Briefs)

| Rolle | Zweck | Provider/Modell | Tool-Allowlist | Hintergrund | Continuable | Grenze |
| --- | --- | --- | --- | --- | --- | --- |
| `pts_research` | öffentliche, quellengestützte Recherche | openrouter/`deepseek/deepseek-v4.1-flash` | `read, glob, grep, web_search, web_fetch, write, edit, skill` | ja | ja | keine pädagogischen Entscheidungen |
| `pts_edit` | kleine, geklärte Denkstand-Änderungen | wie oben | `read, glob, grep, write, edit` | **one-shot** | nein | nur die beauftragte mechanische Änderung |
| `pts_document` | Abläufe/Ergebnisse faktisch festhalten | wie oben | `read, glob, grep, write, edit` | ja | ja | nur Fakten |
| `pts_documentarian` | Vollständigkeit, Konsistenz, Herkunft | wie oben | `read, glob, grep, write, edit` | ja | ja | nur belegte Evidenz |
| `pts_material` | überprüfbare Materialentwürfe | wie oben | `read, glob, grep, web_search, web_fetch, write, edit, skill` | ja | ja | setzt gelieferte Intention um |
| `pts_review` | pädagogische und faktische Gegenprüfung | wie oben | `read, glob, grep` | ja | ja | ändert nichts |
| `pts_renderer` | Konvertierung in ein Zielformat | wie oben | `read, glob, grep, write, edit` | ja | ja | nur freigegebenen Entwurf |

Alle sieben: `provider: spawn` (in-process), `maxDepth: 1`, `agentOptions` mit
`maxTokens` 12000 bzw. 16000, deutsche Rollen-Persona, `run_in_background`
erlaubt. `maxDepth: 1` ist nicht kosmetisch: `resolveChildDepth` erlaubt einem
Kind genau Tiefe 1 über dem Elternagenten — **`maxDepth: 0` macht eine Rolle
unstartbar** (genau das war im alten Preset bei `pts_documentarian` gesetzt).

## 7. Persona, Methodik, Denkstand — drei getrennte Dinge

| Was | Wo | Lebensdauer | Warum getrennt |
| --- | --- | --- | --- |
| Identität und Haltung | `prompt/persona.md` → `dsh-persona.prefix` | stabil über die Session | wird bei jeder Assemblierung identisch vorangestellt (Cache-freundlicher Prefix) |
| Denkmethode (Phasen, Rollen, Denkstand-Prinzipien) | `prompt/framework.md` → `pts:framework`-Sektion (Order 400) | stabil | Methode ist keine Identität; sie darf sich ändern, ohne die Persona zu berühren |
| Denkstand des Raums | `pts-context.mjs` → `pts:denkstand`-Kontext (Order 200) | dynamisch, pro Assemblierung | Zustand, nicht Charakter; budgetiert und damit vorhersehbar |

Damit ist die im Brief (§4) geforderte Trennung von *stabiler Persona* und
*dynamischem PromptContext* umgesetzt, und **kein** Rollen- oder Haltungsprosa
liegt mehr in `AGENTS.md`: die Datei ist Workspace-Orientierung (drei Ebenen,
Instanzdaten, Rollentabelle, Referenzpfade, Regeln), nicht Persona.

## 8. Was bewusst nicht gebaut wurde

| Nicht gebaut | Begründung |
| --- | --- |
| eigenes `pts-core`-Bundle/-Paket | die Profil-Patch-Schicht **ist** die Host-Core-Schicht; ein Paket wäre eine zweite Wahrheit |
| eigener Service `ctx.ptsContext` | kein Konsument in Phase 1; der native Seam für Capability-Beiträge ist `ctx.systemPrompt.context(...)` in der jeweiligen Capability |
| Domain-Store (strukturierte Erfassung, `record_denkstand`, `record_decision`) | eigene Domäne, eigener Spike; Phase 1 hält den Denkstand als Dateien im Denkraum |
| eigene Session-Persistenz | DSH persistiert Sessions native (inkl. Resume und Verlauf) |
| eigene Tool-Pipeline, eigener Dispatcher | `ctx.tools.register/restrict/guard`, `toolFilter`, `output`-Schemata sind DSH-Primitive |
| eigenes Polling/Reconciliation | `inject` + `ctx.on` statt Abfrageschleifen |
| Eingriff in die Web-UI | Phase 1: UI unangetastet; PTS Core ist UI-unabhängig |
| Whiteboard-Integration | nur Koexistenz geprüft; PTS Core kennt `dsh-whiteboard` nicht |

## 9. Verifikation und Befunde

### 9.1 Bestanden

* `node --test tests/pts-context.test.mjs tests/pts-companion-composition.test.mjs`
  → **23/23** (auch im Repo). Geprüft werden unter anderem: `prefix` statt `text`,
  sieben Rollen, `maxDepth: 1` ×7 und nie 0, sechs continuable + ein one-shot,
  genau ein `isolate`-Realm, Standing-Mount-Vertrag der Module (kein
  `ctx.agent`, `inject: ['agents']`, `agent/created`), Skript-Auflösung des
  Skriptverzeichnisses, Preset-Id = Verzeichnisname, Prompt-Budgets.
* `dsh --profile pts --dump-config` → alle sechs Marker gesetzt
  (Roster-Default, PTS-Preset-Id, Demo-Capability, Whiteboard, Webserver,
  Sandbox-Mode).
* Live-Mount-Audit über ein dynamisches Host-Plugin
  (`agentPresets.standingKeyFor('pts-companion')`, ohne Session):
  `defaultId: pts-companion`, Roster mit `pts-companion*`, **`MOUNT: ok`**.
  Vor dem Fix lieferte derselbe Aufruf den exakten Fehler aus §9.2.
* Vor dem Fix (Fehlernachweis, nicht mehr gültig):
  `preset "pts-companion" failed to mount: loader entries failed to apply …
  cannot get property "agent" without inject`.

### 9.2 Die fünf harten Befunde (alle belegt)

1. **`ctx.agent` zerstört den Preset-Mount.** Ein Preset wird einmal pro Prozess
   unter einem Standing-Scope gemountet; dort existiert `ctx.agent` nicht, und
   der Guard verbietet den Zugriff. Fehlerbild: der ganze Mount scheitert, die
   Session wäre nicht zustande gekommen. Lösung: Agent-Registry-Seam.
2. **`agent-presets` ist ein Startartefakt.** Wird die `config` dieser Zeile im
   laufenden Betrieb neu angewendet, wird der Roster-Dienst neu instanziiert;
   die Standing-Mounts hängen an seinem Kontext und werden abgeräumt. Bereits
   beigetretene Sessions verlieren ihre Preset-Ebene, bis sie neu erzeugt
   werden (beobachtet: die Session des Autors verlor mitten in der Arbeit alle
   Datei-, Shell- und Cordis-Werkzeuge). Konsequenz: Installation nur im
   gestoppten Zustand; der Preset-*Default* lässt sich live über das
   Settings-Dokument ändern (das ist ausdrücklich hot-reload-fähig).
3. **Preset-lokale ES-Module werden pro Prozess gecacht.** Eine Codeänderung am
   Modul wirkt erst nach einem Neustart, während eine geänderte
   `agent.cordis.yml` sofort als neue Generation greift. Beweis: nach dem Fix
   schlug der Mount unter derselben Id weiter fehl, unter einer frischen
   Preset-Id (`pts-probe`, identische Dateien) sofort erfolgreich.
4. **Presets werden nur vom Web-Surface gemountet.** Einziger Aufrufer von
   `agentPresets.mount(...)` ist `@deepseek-ai/dsh-webhook` (Session-Anlage im
   Web); ein headless-Lauf komponiert aus der Host-Ebene und zeigt deshalb nie
   die Preset-Werkzeuge. Ein headless-„Preset-Test" ist damit blind — der
   Mount-Audit braucht Web-Session oder `standingKeyFor`.
5. **`$PSScriptRoot` ist im `param()`-Default leer**, wenn ein Skript per
   `powershell -File` startet; `Split-Path -Parent $PSScriptRoot` bricht dann ab,
   bevor die erste Zeile läuft. Beide Skripte lösen das Skriptverzeichnis jetzt
   im Body auf (`$PSScriptRoot` → `$PSCommandPath` → klarer Fehler).

Zusätzlich belegt: die *neue* Session, die der Mensch nach der Installation
anlegte, protokollierte `agentPreset: "pts"` in ihrem Header — der Host-Default
war zu diesem Zeitpunkt bereits `pts-companion`. Die Preset-Wahl kam also aus
der Auswahl im Browser, nicht vom Deployment; ein Neuladen der Seite bzw. die
explizite Wahl „PTS Companion" im Picker führt auf den Companion.

### 9.3 Zwei Defekte des alten Presets (Reparaturbeleg)

* `dsh-persona` mit `text: >-` (Zeile 7) — das aktuelle Feld heißt `prefix` und
  ist Pflicht; die Zeile wäre bei der Konfigurationsvalidierung gescheitert.
* `pts_documentarian` mit `maxDepth: 0` (Zeile 501) — `childDepth = 1 > 0`,
  die Rolle wäre nie startbar gewesen.

### 9.4 Abnahmeprüfung der Additivität

`plugins/pts-demo-capability` liegt als Insert-Zeile im Profil, `disabled: true`
und registriert genau ein Tool (`demo_capability`) über `ctx.tools.register` in
einem `ctx.effect`. Zum Beweis genügt `disabled: false` plus Neustart: das Tool
erscheint in der nächsten Session, und **weder** das Preset **noch** PTS Core
wurden dafür geändert. Das Plugin importiert kein Harness-Paket.

### 9.5 Abnahme an einer echten Companion-Session (2026-09-11)

Eine Lehrkraft-Session auf `pts-companion` (Workspace `F:\dsh-instances\pts\denkraeume\…`)
wurde mit drei Aufträgen geprüft: Werkzeug-Selbstauskunft, „lege
learning-design.md an", „recherchiere zur Religion der KI".

**Bestanden**

* **Werkzeuggrenze greift**: die Session nannte Lesen/Suchen/Bilder, Rückfragen,
  die Whiteboard-Werkzeuge und die sieben `pts_*`-Rollen — **kein** `write`,
  `edit`, `web_search`, `web_fetch`, `skill`, `bash`, `pwsh`, `workflow`,
  `subagent`.
* **Delegation greift**: `pts_edit` und `pts_research` liefen als eigene Kinder
  (`origin=subagent`, `agentPreset=pts-companion`, cwd geerbt); das Ergebnis
  wurde per `job_output` gelesen und im Gespräch sichtbar gemacht.
* **Der dynamische Kontext ist wirklich dynamisch**: unmittelbar nach dem
  Anlegen von `learning-design.md` meldete die Session eine
  `@deepseek-ai/dsh-system-prompt`-Kontextinjektion mit dem neuen Stand —
  die Denkstand-Projektion wurde also mitten im Gespräch neu gelesen.
* **Haltung**: eine Frage pro Antwort, Trennung von Beleg und Vermutung,
  „in den Denkstand schreibe ich nichts, solange du es nicht bestätigst",
  kein erfundener Inhalt (Gerüst mit „— offen —").

**Zwei Befunde aus dem Lauf — beide behoben**

* **(a) Relative Pfade und blinde Rollen.** Ein Worker adressierte
  `LEARNING_DESIGN.md` relativ, scheiterte und startete danach eine rekursive
  `**/*.md`-Suche, die nach 30 s abbrach. Ursache, mit einem eigenen Kind-Agenten
  nachgewiesen: relative Pfade werden gegen den **Agenten-Workspace** aufgelöst
  (`read('LEARNING_DESIGN.md')` → `…\Denkraum\LEARNING_DESIGN.md`), und die
  sieben Rollen erhielten **keinen** Kontext, der die absolute Referenzwurzel
  nennt. Behebung: `renderWorkerContext()` und der Kontext
  `pts:arbeitsumgebung` für jede Rolle (Denkraum, absolute Referenzwurzel,
  Pfad- und Suchregel, Rollengrenze) — die Methodik-Sektion bleibt dem
  Companion vorbehalten.
* **(b) Referenzwurzel war nur mittelbar bekannt.** Das Framework nennt sie
  jetzt ausdrücklich als das, was in der Projektion unten steht, und verlangt
  absolute Pfade in Worker-Aufträgen.
* **(c) Die gerenderte Komposition zeigte ins DSH-Home.** `pts-context.repoRoot`
  und `skill-filesystem.customSkillDirs` wurden mit
  `!!js new URL('../../', baseUrl)` gebildet — richtig, solange das Preset im
  Repository lag, falsch seit dem Umzug in den Home: die Referenzwurzel im
  Companion-Kontext lautete `F:\dsh-instances\pts\.dsh`, und `<home>\skills`
  existierte nicht, sodass die Skills der Rollen nie geladen wurden. Gefunden hat
  das der Companion selbst, indem er die Gegenprüfung verweigerte und den
  Widerspruch meldete. Behebung: `@PTS_ROOT@` in der Komposition plus Ersetzung
  und Wertzeilen-Prüfung im Installer.

## 10. Altlasten-Klassifikation

| Artefakt | Klasse | Begründung |
| --- | --- | --- |
| `dsh/presets/pts-companion/*` (neu) | **KEEP** | kanonische Agent-Ebene |
| `dsh/profiles/pts/*` (neu) | **KEEP** | kanonische Host-Ebene |
| `plugins/pts-demo-capability` (neu) | **KEEP** | Additivitätsbeweis |
| `scripts/install-pts-instance.ps1`, `scripts/start-pts.ps1` (neu) | **KEEP** | einziger Installations-/Startweg |
| `tests/pts-context.test.mjs`, `tests/pts-companion-composition.test.mjs` (neu) | **KEEP** | Invarianten der neuen Komposition |
| `AGENTS.md` | **ADAPT** | auf Workspace-Orientierung reduziert; Persona/Rollen liegen im Preset |
| `skills/` (`google-search`, `ppt-builder`) | **KEEP/ADAPT** | über `skill-filesystem` der Preset-Schicht angebunden |
| `dsh-presets/pts-companion/companion-tool-boundary.mjs` | **ADAPT** | Absicht übernommen, Vertrag neu (Standing-Mount) |
| `dsh-presets/pts-companion/workspace-snapshot.mjs` | **REPLACE** | ersetzt durch `pts-context.mjs` (budgetierte Projektion statt Vollsnapshot) |
| `dsh-presets/pts-companion/agent.cordis.yml` (603 Zeilen) | **REPLACE** | ersetzt durch die neue, 23-zeilige Komposition |
| `dsh-presets/pts-companion/worker-routes.mjs`, `worker-skill-scope.mjs`, `boot-docs.mjs`, `focus-context.mjs`, `conversation-bindings.mjs`, `moment-impact.mjs`, `teaching-product.mjs`, `workspace-parsers.mjs` | **LEGACY** | Rollen, Skills, Doku, Focus und Domänenlogik sind heute DSH-Rows bzw. Phase-2-Themen |
| `dsh-presets/pts-companion/direct-pts-edit.mjs` | **LEGACY** (unangetastet) | ersetzt durch `pts_edit` als one-shot; Datei ist im Arbeitsbaum geändert und bleibt unberührt |
| `dsh-plugins/*` (12 Client-Plugins) | **LEGACY** | Phase-2-Stoff; die Client-Architektur hat sich seither geändert |
| `scripts/install-pts-preset.ps1`, `install-pts-web-plugins.ps1`, `start-pts-web.ps1` | **REMOVE** nach Abnahme | durch `install-pts-instance.ps1` / `start-pts.ps1` ersetzt |
| `scripts/pts-cdp-*.mjs`, `pts-web-ui-test.mjs`, `check-dsh-client-contract.mjs`, `scripts/cdp-*.mjs` | **REMOVE** nach Abnahme | Werkzeuge der alten UI-Experimente |
| `scripts/render-worker-routes.mjs`, `pts-companion-question-test.mjs` | **REMOVE** nach Abnahme | Routen-Rendering entfällt; Fragetest gehört in `tests/` |
| `tests/companion-tool-boundary.test.mjs`, `architecture-boundary.test.mjs`, `kernel-contracts.test.mjs`, `teaching-product*.test.mjs`, `pts-web-plugin-install.test.mjs`, `conversation-binding.test.mjs`, `moment-impact.test.mjs`, `companion-response-guard.test.mjs`, `tests/support/*` | **LEGACY/REMOVE** nach Abnahme | testen die alte Mechanik; `direct-pts-edit.test.mjs` bleibt unangetastet |
| `docs/experiments/*`, `docs/architecture/dsh-0.1.2-client-module-contract.md`, `pts-plugin-client-matrix.md`, `*_MIGRATION*.md` | **KEEP** | Belege und Herkunft; als Historie wertvoll |
| `LEARNING_DESIGN.md`, `CRITICAL_FRIEND.md`, `SYSTEMIC_STANCE.md`, `MANIFEST.md`, `ORCHESTRATION.md`, `services/`, `specs/` | **KEEP** | Referenzdokumente, die Persona und Rollen bei Bedarf per absolutem Pfad lesen |
| `knowledge/`, `capabilities/`, `chat-only/`, `config/`, `examples/`, `implementation-examples/` | **KEEP** (Referenz) | Domänenmaterial bzw. Konzeptstände |
| `tmp/pts-dsh-live/` | **REMOVE** | Live-Experiment der alten Architektur |
| `.tmp-pts-web.stdout.log`, `.tmp-pts-web.stderr.log` | **entfernt** | Logs des alten `pts-web`-Laufs |

## 11. Abnahmetest (§18 des Briefs)

| # | Prüfung | Status |
| --- | --- | --- |
| 1 | `dsh --profile pts` startet ohne Fehler | **bestanden** |
| 2 | `--dump-config` zeigt Roster-Default, Preset, Capabilities | **bestanden** (6 Marker) |
| 3 | Preset `pts-companion` mountet fehlerfrei | **bestanden** (Mount-Audit, live) |
| 4 | Neue Session zeigt den Companion als sichtbare Rolle | **bestanden** (zwei laufende Root-Agenten komponieren `pts-companion`) |
| 5 | Persona/Methodik erscheinen (deutsch, systemisch, ohne Gutachterton) | **bestanden** (§9.5) |
| 6 | Sichtbare Werkzeuge ohne `web_search`, `web_fetch`, `write`, `edit`, `skill` | **bestanden** (§9.5) |
| 7 | `pts_research` als continuable Kind im Hintergrund startbar | **bestanden** (§9.5) |
| 8 | `pts_documentarian` startbar (nicht `maxDepth: 0`) | **strukturell bestanden**, Lauf offen |
| 9 | Ergebnis eines Worker-Laufs wird im Gespräch sichtbar gemacht | **bestanden** (§9.5) |
| 10 | Denkstand-Projektion nennt den Raum, kürzt auf 4000 Zeichen | **bestanden** (Unit-Tests) |
| 11 | Session schließen und wieder öffnen erhält den Verlauf | **bestanden** (diese Session) |
| 12 | `pts-demo-capability` bleibt inaktiv; Preset unverändert | **bestanden** (`disabled: true`) |
| 13 | Whiteboard-Capability koexistiert, PTS Core kennt sie nicht | **bestanden** (Boot-Meldung, keine Referenz im Preset) |
| 14 | Kein Eingriff in die Web-UI | **bestanden** |
| 15 | Keine Änderung am Harness-Installationsbaum | **bestanden** (nur Profil-/Preset-Home) |
| 16 | Tests der neuen Komposition grün | **bestanden** (23/23) |

## 12. §21-Fragenkatalog — die 15 Antworten

**1. Welche aktuelle DSH-Version wurde untersucht?**
DSH **0.1.5-rc.2** auf Windows, Node **v24.19.0**, Installation unter
`C:\Users\Joachim\…\node_modules\@deepseek-ai\dsh` (nur `lib/` +
`node_modules`, kein Quellbaum). Gelesen wurden die Typdeklarationen und
Implementierungen der Pakete `dsh-agent-presets` (Roster, Mount, Standings),
`dsh-system-prompt` (Sektionen, Kontexte, Ordinalen), `dsh-tools`
(`register/restrict/guard`, `schemas`), `dsh-scope` (`ScopeKey`, `scopeOf`),
`dsh-agent-loop` (Fabrik, `create/resume`), `dsh-app-boot` (Patch- und
Loader-Semantik), `dsh-web-app`/`dsh-webhook` (Session-Anlage = einziger
Preset-Mount-Aufrufer), `dsh-sandbox-policy`, `dsh-persona`,
`dsh-skill-filesystem`, `dsh-agent-instructions`, `dsh-tool-subagent`. Der
Installationsbaum wurde **nicht** verändert.

**2. Wie ist das neue PTS-Profil aufgebaut?**
`dsh/profiles/pts/` mit drei Dateien: `package.json` (Bundles, `dsh.profile.*`,
`patchReload: live`), `cordis.yml` (leere Wurzel) und `cordis.patch.yml` — der
eigentliche Kern. Der Patch hat fünf Einträge: `webserver` (Port-Fallback 3030),
`sandbox-policy` (`mode`, `workspaceRoot: <dataRoot>/denkraeume`), `agent-presets`
(`default: pts-companion`) und zwei `insert:`-Zeilen (`pts-demo-capability`,
`dsh-whiteboard`). Er nutzt ausschließlich bestehende Pakete; `@PTS_ROOT@` wird
beim Rendern durch den Repo-Pfad ersetzt.

**3. Welche Bundles werden verwendet?**
`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`. Keine eigenen Pakete,
kein eigenes Bundle — die PTS-Instanz ist eine reguläre DSH-Web-Instanz mit
eigenem Home, eigenem Port und eigenem Workspace-Root.

**4. Welche alten PTS-Komponenten konnten übernommen werden?**
Als Absicht und Inhalt: die Persona- und Methodik-Prosa (neu geschnitten), die
Semantik der Companion-Tool-Grenze, die Denkstand-Dateikonventionen samt
`##`-Abschnittsparser, die sieben Rollenbeschreibungen, `skills/`,
`AGENTS.md` (auf Workspace-Orientierung reduziert) und die Referenzdokumente
(`LEARNING_DESIGN.md`, `CRITICAL_FRIEND.md`, `SYSTEMIC_STANCE.md`,
`MANIFEST.md`, `ORCHESTRATION.md`, `specs/`, `services/`). Vollständige
Zuordnung: §3, §10.

**5. Welche wurden verworfen?**
Die Worker-Routen- und Skill-Scoping-Maschinerie, der eigene
Subagent-Lebenszyklus, der Domain-Store und alle `dsh-plugins`-Client-Plugins,
der eigene Webserver, die Boot-Dokument- und Focus-Slot-Mechanik, das
`direct-pts-edit`-Toolmodul und die Installations- und Testskripte der alten
Architektur. Klassen und Begründungen: §10.

**6. Wie wird der Companion-Prompt zusammengesetzt?**
Aus vier Schichten des System-Prompt-Dienstes: (1) Harness-Identität,
(2) `deployment:persona-prefix` aus dem `dsh-persona`-Row, also
`prompt/persona.md` (Order 0), (3) `pts:framework` aus `prompt/framework.md`
(Order 400), (4) `pts:denkstand` (Order 200, dynamisch) plus die Kontexte der
Host-Ebene (`sandbox:policy`, `approval:policy`). Der Persona-**Suffix** ist
bewusst nicht gesetzt. Belegprobe aus der laufenden Instanz (Assembly einer
Session): Sektionen `harness:identity`, `deployment:persona-prefix`,
`ui:deliverable-file-references`, `harness:source`, `app:web-surface`,
`deployment:persona-suffix`; Kontexte `sandbox:policy`, `approval:policy`.

**7. Was ist statische Persona, was dynamischer Prompt Context?**
Statisch: Identität und Haltung (`prompt/persona.md` im Prefix) und die
Methodik (`pts:framework`, Order 400) — pro Session unverändert. Dynamisch:
`pts:denkstand` — bei jeder Assemblierung frisch aus dem Denkraum gelesen
(feste Dateiliste, 4000-Zeichen-Budget, Verzeichnisse nur mit Namen). Die
Ordinalen sind so gewählt, dass Methodik nach der Deployment-Persona und der
Denkstand nach den Policy-Kontexten liegt. Test: §9.1, §10 der Testdatei
`tests/pts-context.test.mjs`.

**8. Wie wird das Agent Preset geladen?**
Der Roster liest seine Roots: mitgelieferte Presets **plus**
`$DSH_HOME/.agent-presets` (dorthin rendert der Installer `dsh/presets/<id>`).
Er mountet ein Preset **einmal pro Prozess** unter einem Standing-Scope; jede
Session, die das Preset nennt, tritt per Scope-Elternschaft bei. Der Default
kommt aus `agent-presets.config.default` (Profil) und wird vom
Settings-Dokument (`settings.yaml`, hot-reload) überstimmt. Gemountet wird im
**Web-Surface** (`dsh-webhook` bei der Session-Anlage); ein Headless-Lauf
komponiert aus der Host-Ebene und zeigt nie Preset-Werkzeuge. Live-Belege:
`agentPresets.defaultId = pts-companion`, `standingKeyFor('pts-companion')`
→ ok, und eine nach der Installation angelegte Session trägt
`agentPreset: pts-companion`. Beobachtete Feinheit: eine ältere Session, deren
Header `pts` protokolliert, komponiert live `pts-companion` — die Eröffnung
bzw. die Auswahl im Client entscheidet neu, der Header ist historisch. Der
Installer rendert die Komposition in den Home und ersetzt dabei `@PTS_ROOT@`
durch den absoluten Repo-Pfad.

**9. Wie werden PTS-Subagents konfiguriert?**
Als sieben Zeilen vom Typ `@deepseek-ai/dsh-tool-subagent` mit `toolName`,
`label`, Rollen-Persona, Route (`provider` + `model`), `toolFilter`,
`agentOptions` (`maxTokens`) und `maxDepth: 1`. Der Tool-Name ist die Rolle,
die Sichtbarkeit ihres Werkzeugkastens ist die Autoritätsgrenze. Tabelle mit
allen sieben Rollen: §6. Warnung aus der Praxis: `maxDepth: 0` bedeutet
Kind-Tiefe 1 > 0 und macht die Rolle **unstartbar** (Fehler des Altpresets).

**10. Wie funktionieren continuable Worker?**
`dsh-tool-subagent` mit `provider: spawn` läuft in-process und liefert ein
durable Kind (Session). Continuable Kinder bleiben nach dem Lauf ansprechbar:
der Companion steuert sie über `tool-subagent-control` (`list_agents`,
`send_message`, `interrupt_agent`), DSH hält Lebenszyklus, Zustellung und
Ergebnis und meldet den Abschluss in die Session zurück. Sechs Rollen sind
continuable, `pts_edit` ist `one-shot`. Es gibt keinen eigenen Runtime, keine
Queue und keinen Dispatcher.

**11. Welche Komponenten sind agent-scoped?**
Agent-gebunden ist alles, was eine Preset-Zeile pro Session komponiert: die
Persona, die Prompt-Sektionen und -Kontexte, die sichtbare Toolmenge, die
Skills und die sieben Rollen. Die beiden preset-lokalen Module hängen ihre
Beiträge über den Agent-Registry-Seam an genau den Agenten, der
`composedPreset(agent.ctx) === 'pts-companion'` erfüllt und dessen
`session.header.origin` kein Subagent ist — deshalb bleibt die Autorität der
Rollen unangetastet. Host-scoped (bewusst nicht agent-scoped) sind Roster,
Sandbox- und Approval-Stack, Jobs, Persistenz und Modellroute; Dienste einer
Preset-Zeile stehen in einem `isolate`-Realm (hier die Compaction-Gruppe),
damit zwei Presets sich nicht dieselbe Dienstinstanz teilen.

**12. Wie können fremde Plugins zusätzliche Tools beisteuern?**
Ein Plugin registriert sein Werkzeug über `ctx.tools.register(definition)`
innerhalb eines `ctx.effect(...)` — damit ist es beim Stop wieder weg. Es wird
als eigene Zeile in die Komposition aufgenommen (Profil-`insert` oder
Preset-Zeile, mit `disabled` als Schalter) und braucht **keine** Änderung an
Persona oder Preset. Genau das ist `plugins/pts-demo-capability`: eine Zeile
plus ein Tool (`demo_capability`), ausgeliefert inaktiv. Dasselbe Muster gilt
für Prompt-Beiträge (`ctx.systemPrompt.section/context`) und für
Sichtbarkeits- und Ausführungsgrenzen (`tools.restrict/guard`).

**13. Kann dsh-whiteboard parallel laufen?**
Ja. Die Instanz meldet beim Start `[dsh-whiteboard] host half ready — route
/dsh-whiteboard/api` und neun `whiteboard_*`-Werkzeuge sind in einer Session
sichtbar; der Profil-Patch fügt die Capability unabhängig vom Preset ein. PTS
Core kennt sie nicht: keine Preset-Zeile verweist auf sie, keine Persona nennt
sie. Eine Integration wäre eine eigene, additive Capability — der Koexistenz-
Test ist damit erbracht, die Integration bewusst nicht gebaut (Auftrag §15).

**14. Welche Altlasten des bisherigen pts-web können anschließend gelöscht
werden?**
Nach der Abnahme: `dsh-presets/pts-companion/` (das alte Preset samt seiner
`.mjs`-Module), `dsh-plugins/` (zwölf Client-Plugins der alten UI),
`scripts/install-pts-preset.ps1`, `scripts/install-pts-web-plugins.ps1`,
`scripts/start-pts-web.ps1`, die CDP-/UI-Testskripte, die alte
`render-worker-routes`-Kette, die Tests der alten Mechanik sowie
`tmp/pts-dsh-live/`. **Behalten** werden `skills/`, `AGENTS.md`, die
Referenzdokumente, `knowledge/`, `docs/experiments/` und die
Client-Architektur-Notizen; **unangetastet** bleibt
`dsh-presets/pts-companion/direct-pts-edit.mjs` (im Arbeitsbaum geändert).
Vollständige Tabelle mit Klassen: §10.

**15. Welche Risiken bleiben für den nächsten Whiteboard-PTS-Spike?**
(i) Preset-**Code** wird pro Prozess gecacht, Kompositionen nicht — Spike-Code
braucht Neustarts. (ii) Ein Live-Install in eine laufende Instanz entkernt
Sessions (Roster-Zeile = Startartefakt). (iii) Preset-Werkzeuge eines *fremden*
Agenten sind von außen nicht beobachtbar: `ScopeKey` ist ein nicht-globales
`Symbol("dsh.scope")`, `tools.schemas()` ohne ScopeKey liefert die
Root-Sicht — die Abnahme der Toolmenge bleibt menschlich. (iv) Presets mounten
nur im Web-Surface; Tests brauchen eine Web-Session oder `standingKeyFor`.
(v) Inhaltlich: das Whiteboard hat seinen eigenen Zustand (tldraw-Dokument im
Browser, Host-Route + Client-Slot). Zu klären ist, wer Autor ist (Mensch oder
Agent), wie Notizen in den Denkstand zurückfließen, und wie der Denkstand die
Wahrheit bleibt, wenn zwei Orte ihn zeigen. (vi) Die Rollen hängen an der
Verfügbarkeit von `deepseek/deepseek-v4.1-flash` über die Modellroute.
(vii) Sessions außerhalb von `<dataRoot>/denkraeume` (z. B. unter
`F:\dsh-workspaces\…`) liegen außerhalb des Sandbox-`workspaceRoot`: sie dürfen
lesen, aber Schreibzugriffe drohen abgelehnt zu werden. Denkräume gehören nach
`<dataRoot>/denkraeume/<slug>`; das Repo ist die Definition und bleibt
absichtlich schreibgeschützt.

**Abschlussurteil: PASS WITH CONDITIONS.** Bedingungen: (1) Domain-Store-Spike
für strukturierte Denkstand-Erfassung und einen direkten `pts_edit`,
(2) Altlasten erst nach der Freigabe entfernen. Die menschliche Abnahme der
Companion-Session ist erbracht (§9.5); die Werkzeug-Selbstauskunft stammt aus der
Session selbst, nicht aus einem Schema-Dump — ein Schema-Dump eines fremden
Agenten ist von außen nicht erreichbar (`ScopeKey` ist ein nicht-globales
`Symbol("dsh.scope")`).

## 13. Bedingungen und Risiken

**Bedingungen (Verdikt „PASS WITH CONDITIONS")**

1. **Menschliche Abnahme in der GUI** (Prüfungen 4–9): eine neue Session
   explizit auf „PTS Companion" starten und Haltung, Toolmenge, Delegation und
   Wiederaufnahme beurteilen. Host-Default und Mount sind bewiesen, die
   *Wirkung* der Persona auf das Gespräch ist es nicht.
2. **Domain-Store-Spike**: strukturierte Denkstand-Erfassung und ein direkter,
   begrenzter `pts_edit` (heute ein one-shot-Subagent als Übergangslösung).
3. **Altlasten erst nach der Abnahme entfernen** (§10, Spalte „nach Abnahme").

**Risiken**

* *Preset-Codeänderungen brauchen einen Neustart* (Modul-Cache, §9.2/3) —
  Kompositionsänderungen nicht. Für die Weiterentwicklung heißt das: Persona und
  Framework ändern ist sofort wirksam, Moduländerungen nicht.
* *Ein Live-Install ist nicht sicher* (§9.2/2). Der Installer warnt, wenn auf
  dem Port eine Instanz lauscht; der gesegnete Weg bleibt `start-pts.ps1 -Sync`
  bei gestoppter Instanz.
* *Ein Worker-Modell `deepseek/deepseek-v4.1-flash` wird über openrouter
  geroutet*; bei fehlender Modellverfügbarkeit schlägt zuerst die Rolle fehl,
  nicht der Companion.
* *`modeSelectionEnabled: true`* lässt den Menschen das Preset pro Session
  wählen — die sichtbare Wahl im Browser kann vom Deployment-Default abweichen
  (genau das wurde beobachtet, §9.2/6).

## 14. Anhang — Dateien und Befehle

```
dsh/profiles/pts/package.json              Bundles: dsh-base + dsh-web-app, patchReload: live
dsh/profiles/pts/cordis.yml                [] (leere Wurzel; alles ist Patch)
dsh/profiles/pts/cordis.patch.yml          Host-Ebene (Rendered: @PTS_ROOT@ -> Repo-Pfad)
dsh/presets/pts-companion/agent.cordis.yml Agent-Ebene (23 Zeilen)
dsh/presets/pts-companion/preset.yml       Anzeigename + Beschreibung
dsh/presets/pts-companion/prompt/persona.md      ~2 KB, deutsch
dsh/presets/pts-companion/prompt/framework.md    ~3 KB, deutsch
dsh/presets/pts-companion/pts-context.mjs        Methodik-Sektion + Denkstand-Kontext
dsh/presets/pts-companion/companion-tool-boundary.mjs  restrict + guard
plugins/pts-demo-capability/{package.json,lib/index.js}
scripts/install-pts-instance.ps1           rendert Profil + Preset, prüft Marker
scripts/start-pts.ps1                      DSH_HOME + Denkraum-cwd + --profile pts (-Sync)
tests/pts-context.test.mjs                 Parser/Projektion/Budgets
tests/pts-companion-composition.test.mjs   Invarianten der Komposition
```

```powershell
# Installation (Instanz gestoppt!) und Start in einem Schritt
powershell -File scripts\start-pts.ps1 -Sync

# Nur rendern / verifizieren
powershell -File scripts\install-pts-instance.ps1
$env:DSH_HOME='F:\dsh-instances\pts\.dsh'; dsh --profile pts --dump-config

# Komposition prüfen
node --test tests/pts-context.test.mjs tests/pts-companion-composition.test.mjs
```
