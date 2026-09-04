# DSH-Skill-Auflösung und PTS-Enforcement — Spike

> **Status:** abgeschlossen (2026-08-28) · **Ergebnis: PASS**
>
> Der Spike klärt, wie das DSH-`skill`-Tool Skills auflöst (Bibliothekspfad,
> Registrierung, Frontmatter-Format), ob die Auflösung pro Agent eingeschränkt
> werden kann, und entscheidet daraus das PTS-Enforcement. Quelle ist der
> installierte DSH-Code unter
> `C:\Users\Joachim\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\`
> (Version 0.1.1-rc.2), nicht geraten.

---

## 1. Fragen

1. Wie löst das `skill`-Tool einen Skill-Namen auf?
2. Wo sucht DSH nach Skill-Dateien (Bibliothekspfade)?
3. Welches Frontmatter-Format wird erwartet?
4. Kann die Auflösung pro Agent eingeschränkt werden?
5. Entscheidung: Pfad A (Composition-Filter pro Worker) oder Pfad B
   (Skill-IDs in die Worker-Persona)?

## 2. Auflösungsweg des `skill`-Tools

**`@deepseek-ai/dsh-tool-skill`** (`lib/index.js`) registriert das modellseitige
`skill`-Tool. Sein `execute(args, exec)` läuft über den Skill-Dienst:

```
ctx.skills.list({ cwd, signal, scope: exec.agent })   // Katalog
ctx.skills.get(name, { cwd, signal, scope: exec.agent }) // voller Body
```

Der **`ctx.skills`-Dienst** ist `SkillRegistry` aus **`@deepseek-ai/dsh-skill`**
(`lib/index.js`): ein geschichteter Provider-Registrier-Dienst (Muster des
Tool-Registry). Provider registrieren sich per `ctx.skills.registerProvider(factory)`
in die Layer ihres registrierenden Kontexts:

- Host-Zeilen und Repository-Plugins landen im **globalen Layer**.
- Eine Row, die ein Agent-Preset in seiner Standing-Komposition moun­tet,
  landet im **Preset-Layer** (Scope des Agents).
- Jeder Agent liest die gemischte Katalog-Sicht seines Scope-Chains.

Ein `agent/pre-step`-Listener injiziert den Katalog als `<available_skills>`-
System-Reminder **nur** wenn für genau diesen Agenten die `skill`-Tool-Zeile
sichtbar ist (`ctx.tools.get(skillTool.name, agent) === skillTool`). Der Aufruf
selbst rendert den Skill als `<skill_content>`-Block.

Zusätzlich erkennt das Tool `/name`-Gesten in Nutzertexten und injiziert den
Skill bei direkter Nutzer-Invocation.

## 3. Dateisystem-Provider und Bibliothekspfade

**`@deepseek-ai/dsh-skill-filesystem`** (`lib/index.js`) ist der lokale
Provider. `roots(cwd)` liefert die gescannten Wurzeln (cwd = `agent.session.header.cwd`):

| Wurzel | Quelle | Rank |
|---|---|---|
| `<gitRoot>/.dsh/skills` | `project-dsh` (git root via `.git`-Walk ab cwd) | 100 |
| `<gitRoot>/.agents/skills` | `project-agents` | 200 |
| `config.customSkillDirs[]` | `custom` | 300 |
| `$DSH_HOME/skills` | `user-dsh` | 400 |
| `~/.agents/skills` (bzw. `DSH_AGENTS_HOME`) | `user-agents` | 500 |
| `DSH_BUNDLED_SKILL_DIR` | `bundled` | 600 |

Ein Verzeichnis-Eintrag `<root>/<name>/SKILL.md` ist ein Skill (flat `<name>.md`
ebenso). Kandidaten werden nach `(rank, providerOrder, localOrder)` sortiert,
der erste Gewinner pro Name, Layer-Namen überschreiben Global-Namen (nearest
wins).

**Frontmatter** (`parseSkillFile`): erfordert `name` (kebab-case,
`^[a-z0-9]+(?:-[a-z0-9]+)*$`) und nicht-leeres `description`; Invocation über
`disable-model-invocation` / `user-invocable` (Booleans). Alle anderen Felder
werden ignoriert — nur ein `metadata:`-Objekt wird durchgereicht. Unser
`id`/`roles`/`status`-Schema stört DSH also nicht (für DSH zählt nur `name` +
`description`; deshalb führen wir `id` als DSH-`name` 1:1).

**Konsequenz für PTS:** Der Repo-Ordner `skills/` ist **kein** gescannter
Standard-Pfad. Er wird sichtbar, sobald das Preset eine `skill-filesystem`-Row
mit `customSkillDirs: ['<absolut>/skills']` moun­tet (Rank 300). Mit
`includeDefaultRoots: false` bleibt der PTS-Katalog streng auf die eigene
Bibliothek begrenzt (auch `~/.agents/skills` der Lehrkraft bleibt außen vor).

## 4. Profil-Situation: wer moun­tet den Skill-Stack

- `dsh-base` moun­tet `skill` (Registry), `skill-filesystem`, `tool-skill`.
- `dsh-web-app` **deaktiviert** Host-`skill-filesystem` und Host-`tool-skill`:
  „presets own local discovery", „tool-skill is what a preset mounts to give its
  agent the catalog and loader at all".
- Das pts-companion-Preset moun­tet aktuell **keine** Skill-Rows → PTS-Agenten
  haben heute weder Katalog noch `skill`-Tool.

⇒ Damit PTS-Worker `skill` nutzen können, muss das Preset beide Rows moun­ten:

```yaml
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    includeDefaultRoots: false
    customSkillDirs:
      - '<absolute repo skills dir>'   # Installer ersetzt den Platzhalter
- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'
```

Die Komposition wird beim **Session-Start** gelesen und danach nie neu gelesen
(`dsh-agent-presets`: „the composition was read at creation and is never
re-read"), die Discovery ist aber unmemoized → eine geänderte Preset-Datei
greift für die **nächste** Session ohne Neustart.

## 5. Frontmatter-/Namensregeln für die PTS-Bibliothek

- Verzeichnis-`id` = DSH-`name` = kebab-case slug (unsere `id`). Nur solche IDs
  darf der Manager importieren („nur legitime IDs").
- DSH braucht `name` + `description`; ohne beides wird die Datei ignoriert.
- `disable-model-invocation: true` schließt einen Skill vom Katalog/`skill`-Tool
  aus — global, nicht pro Agent.
- Fehlende `roles`/`status` beim Import → `status: draft`, `roles: []`.

## 6. Kann die Auflösung pro Agent eingeschränkt werden? — Nein (Katalog)

Der Katalog ist eine **Vereinigung** über `[global, ...chainLayers(scope)]`
(nearest wins pro Name). Es gibt **keinen Ausschluss-Mechanismus**: ein
agentenspezifischer Provider kann einen gleichnamigen Skill shadowen, aber
nicht fremde Namen ausblenden. Ein gemeinsamer `skill-filesystem` im Preset
zeigt allen PTS-Agenten denselben Katalog.

Zusätzlich ist die **Rolle eines Subagents nicht im Session-Header**:
`childSessionMeta` trägt nur `{cwd, agentPreset, parentSession, origin,
delegationDepth}` — kein Tool-Name. Die Persona ist der einzige
rollenspezifische Unterschied.

**Harte Grenzen, die DSH trotzdem bietet:**

1. **`toolFilter` pro Worker-Instanz**: `skill` nur in den `allow`-Listen von
   research/material → Review/Renderer und der Companion (Boundary-Guard)
   können `skill` strukturell nicht ausführen.
2. **`tools.guard()` pro Agent** (Muster `companion-tool-boundary`): ein
   per-Agent installierter Guard erhält das Execution-Objekt inkl.
   `arguments` (`{name, arguments}`) und kann einzelne `skill`-Aufrufe mit
   einer Begründung **hart ablehnen**.
3. **Prompt-Ebene**: die zugewiesenen Skill-IDs lassen sich als
   System-Prompt-Sektion pro Worker einspeisen (Muster: `systemPrompt.section`
   wie `dsh-tool-subagent`).

## 7. Entscheidung

**Pfad B, implementiert als Preset-lokales Plugin `worker-skill-scope.mjs`**
(analog `companion-tool-boundary.mjs`), kombiniert mit den harten Grenzen:

- **`toolFilter.allow`** erhält `skill` nur bei `pts-research` und
  `pts-material` (Preset-Änderung, Task 2).
- Das Preset moun­tet `skill-filesystem` (scoped auf die Repo-Bibliothek) +
  `tool-skill`.
- `worker-skill-scope.mjs` hängt an `agent/created` (Standing-Mount, Muster
  Boundary):
  - **Rollen-Erkennung** über den angewandten Tool-Filter: Subagent mit
    sichtbarem `skill` **und** sichtbarem `web_search`/`web_fetch` =
    research; mit `skill` ohne Web-Tools = material; ohne `skill` = review/
    renderer (kein Eingriff). Für die feste PTS-Komposition ist das deterministisch.
  - **Enforcement:** installiert pro Worker einen `tools.guard`, der
    `skill`-Aufrufe für **nicht zugewiesene** Skill-Namen ablehnt
    („nicht zugewiesen") — hart, testbar.
  - **Guidance:** registriert eine `systemPrompt.section`, die die
    zugewiesenen Skill-IDs nennt (leer: „keine Skills zugewiesen").
  - Die Zuweisungen liest das Plugin je Agent-Erzeugung frisch aus der
    Settings-Sektion `pts-worker-skills:`. Wichtig (Laufzeit-Fund): ein
    Subagent-Kontext kann den Host-Dienst `settings` **nicht** auflösen —
    der Preset-Mount verbindet per Scope-Binding, nicht per Fiber-Parenting
    (`mountPreset`/`bindScopeParent`), und nur `tools` lebt in der
    Kind-Komposition. Deshalb erhält das Plugin den Settings-Dokument-Pfad
    über die Row-Config (`settingsPath: '@PTS_SETTINGS_PATH@'`, vom Installer
    ersetzt) und liest die Datei direkt (gleiches Dokument, gleicher Parser
    wie der Steward). Fallback: `ctx.get('settings')` — nie ein bloßer
    `ctx.settings`-Zugriff, der „without inject" wirft.
- **Nachweis:** Tool-Aufruf-Log (`skill google-search` gelingt, `skill ppt-builder`
  im Research-Worker wird vom Guard abgelehnt) + Persona-Wirkung.

**Bewusste Grenze (dokumentieren):** Die Zuweisung ist pro Worker-Rolle
(research/material), nicht pro individueller Task. Die Katalog-Sicht zeigt
allen PTS-Agenten dieselbe Bibliothek; die Rolle entscheidet, welche Skills
geladen werden dürfen.

## 8. Implikationen für Installer/Scripts

Der absolute `customSkillDirs`-Pfad ist maschinenabhängig. Der Installer
(`scripts/install-pts-preset.ps1`) ersetzt beim Kopieren die Platzhalter
`@PTS_SKILLS_DIR@` (→ `<repo>\skills`) und `@PTS_SETTINGS_PATH@` (→
`<profil>\settings.yaml`) im `agent.cordis.yml` durch die aufgelösten
Repo-Pfade. `start-pts-web.ps1` prüft im Preflight, dass beide ersetzt
wurden. Die Plugin-Host-Hälfte löst die Bibliothek relativ zu sich selbst auf
(Junction im Repo), schreibt also immer ins Repo-`skills/`.

## 9. Verifikationen aus dem installierten Code

- `dsh-tool-skill/lib/index.js`: `ctx.skills.list/get` + `isModelInvocable` +
  Catalog-Injektion pro Agent, `invokedSkillNames` (`/name`-Gestus).
- `dsh-skill/lib/index.js`: `SkillRegistry`, `registerProvider`,
  `collectFresh` = `[global, ...chainLayers]` + `merged.set` (nearest wins),
  `isSkillName`-Regex, `validateCandidate` (rank/provider/source).
- `dsh-skill-filesystem/lib/index.js`: `roots(cwd)`, `parseSkillFile`,
  Frontmatter-Regeln, `customSkillDirs`, `includeDefaultRoots`.
- `dsh-web-app/cordis.patch.yml`: Host-`skill-filesystem`/`tool-skill` disabled,
  Kommentar „presets own local discovery".
- `dsh-subagent/lib/index.js`: `applyChildComposition` =
  `composeFrom(childCtx, parent.ctx)` → Kinder **erben** die Preset-Komposition;
  `childSessionMeta` trägt keine Rolle.
- `dsh-tools/lib/index.js`: `tools.restrict({allow})` filtert die geerbte
  Oberfläche (restricted-away global = absent), `tools.guard(fn)` erhält
  `{name, arguments}`, `tools.get(name, scope)`.
- `dsh-agent-presets/lib/index.js`: `COMPOSITION_FILE = agent.cordis.yml`,
  Discovery unmemoized, Komposition pro Session einmal gelesen.
