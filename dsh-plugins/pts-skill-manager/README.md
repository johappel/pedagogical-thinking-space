# pts-skill-manager

Verwaltet die Skill-Bibliothek des Repos (`skills/<id>/SKILL.md`) und die
Rolle↔Skill-Matrix im DSH-native Setup des PTS:

- **Host-Hälfte** (`lib/index.js`): Routen `/api/pts-skills/*` — Bibliothek
  listen, SKILL.md importieren, löschen und die Matrix in die Settings-Sektion
  `pts-worker-skills:` schreiben (atomar, fremde Sektionen bleiben erhalten).
- **Client-Hälfte** (`lib/client.js`): Tab **„Skills"** im Gesprächsraum
  (`conversation.view`, `order: 20`, links vom „Artefakte"-Tab).

Die eigentliche **Wirkung** übernimmt das Preset-Plugin
[`worker-skill-scope.mjs`](../../dsh-presets/pts-companion/worker-skill-scope.mjs):
Rollen-Erkennung über den angewandten Tool-Filter, ein harter `skill`-Guard für
nicht zugewiesene Skill-IDs und eine System-Prompt-Sektion mit den
zugewiesenen Skills. Grundlagen und Entscheidung: [DSH-Skill-Auflösung
(Spike)](../../docs/experiments/DSH_SKILL_AUFLOESUNG.md).

## Installation (einmalig pro Rechner)

1. **Junction** ins Profil (Muster der bestehenden PTS-Plugins):
   `C:\Users\Joachim\.dsh\profiles\pts-web\node_modules\pts-skill-manager`
   → `F:\code\pedagogical-thinking-space\dsh-plugins\pts-skill-manager`
2. **Patch-Row** in `C:\Users\Joachim\.dsh\profiles\pts-web\cordis.patch.yml`:
   ```yaml
   - id: pts-skill-manager
     name: pts-skill-manager
     inject: [webServer]
   ```
3. **Preset installieren**: `pwsh -File .\scripts\install-pts-preset.ps1` — das
   ersetzt `@PTS_SKILLS_DIR@` im `agent.cordis.yml` durch den absoluten
   Repo-Pfad zur Skill-Bibliothek.
4. **DSH neu starten.** Preflight-Checks des Launchers
   (`scripts/start-pts-web.ps1`) prüfen Patch-Row, Junction und Preset-Marker.

## Frontmatter-Schema

Jede Skill-Datei ist `skills/<id>/SKILL.md` (Verzeichnisname = `id` = DSH-Name):

```yaml
---
id: google-search          # slug, kebab-case, eindeutig = DSH-Name
name: google-search        # Pflicht für DSH: identisch zu id
description: Google-Suche über CDP statt nativer web_search
roles: [research]          # research | material | review | renderer
status: own                # draft | own | verified
---
```

Ohne `roles`/`status` beim Import: `roles: []`, `status: draft`. DSH verwirft
Dateien ohne gültiges kebab-`name` und ohne `description`; `name` muss `id`
entsprechen (die Matrix referenziert die `id`). Details: [`skills/README.md`](../../skills/README.md).

## Wirkungsweise

- **Katalog:** Das Preset moun­tet `skill-filesystem` mit
  `includeDefaultRoots: false` + `customSkillDirs: [<repo>/skills]` und
  `tool-skill`. Nur PTS-Agenten sehen die Bibliothek (Katalog ist
  Preset-Scope; kein globaler Skill sichtbar).
- **Harte Grenzen:** `skill` steht nur in den `toolFilter`-Allow-Listen von
  Research und Material. Review, Renderer und der Companion (Boundary-Guard)
  können `skill` strukturell nicht ausführen.
- **Zuweisung:** `worker-skill-scope.mjs` liest die Matrix je Agent-Erzeugung
  aus der Settings-Sektion `pts-worker-skills:` und lehnt `skill`-Aufrufe für
  nicht zugewiesene IDs per Guard ab (fail-closed bis die Zuweisung geladen
  ist); die Prompt-Sektion nennt die erlaubten Skills. Die Sektion liest das
  Preset-Plugin **direkt von der Platte** (Row-Config
  `settingsPath: '@PTS_SETTINGS_PATH@'`, vom Installer ersetzt): ein
  Subagent-Kontext erreicht den Host-Dienst `settings` nicht (Scope-Binding
  statt Fiber-Parenting), ein bloßer `ctx.settings`-Zugriff würde mit
  „without inject" scheitern.
- **Build-Zeit, kein Laufzeit-Toggle:** Die Komposition wird beim
  Session-Start fixiert. Eine geänderte Matrix wirkt ab der **nächsten**
  Worker-Ausführung; die Aktion **„Denkraum neu laden"** im Tab startet eine
  frische `pts-companion`-Session im aktuellen Denkraum.

## Bedienung (Tab „Skills")

- **Bibliothek:** Name/ID, Beschreibung, Status-Badge (`geprüft`/`eigene`/
  `Entwurf`), Ziel-Rollen, Löschen. `verified`-Skills brauchen eine zweite,
  bewusste Bestätigung.
- **Matrix:** Checkboxen pro Skill × Rolle; „Matrix speichern" schreibt
  `/assignment` und validiert gegen die Bibliothek (unbekannte IDs → Fehler).
- **Import:** `SKILL.md`-Datei-Upload oder Repo-relativer Pfad (z. B.
  `workspace/<slug>/drafts/skill.md`). Konflikte werden abgelehnt; `force`
  überschreibt nur nicht-`verified` Skills. Fehlt `name`, wird es ergänzt.
- **„Denkraum neu laden":** nutzt denselben Pfad wie der Workspace-Browser
  (`sessions.create({ workspaceId, agentPreset: 'pts-companion' })` + `open`),
  nie das rohe `workspaces.startSession` (Global-New-Session-Guard).

## Skill-Erstellungs-Flow (Lehrkraft-Alltag)

1. **Entwurf:** Die Lehrkraft lässt den Companion einen Skill-Entwurf über
   `pts_material` erarbeiten (Skript-Ergebnis unter
   `workspace/<slug>/drafts/…`).
2. **Review:** `pts_review` prüft den Entwurf (Mandat, Quellen, Risiken).
3. **Import:** Die geprüfte `SKILL.md` wird über den Skills-Tab importiert
   (`status: draft`).
4. **Vertrauen:** Die Lehrkraft setzt `status: verified` (Frontmatter), wenn
   der Skill tragen soll.
5. **Zuweisen:** In der Matrix dem/den Ziel-Rollen zuordnen, „Matrix speichern".
6. **Wirken lassen:** „Denkraum neu laden" — ab der neuen Session nutzen die
   Worker nur noch zugewiesene Skills.

## Grenzen

- Die Zuweisung ist pro **Worker-Rolle**, nicht pro individueller Task. Die
  Katalog-Sicht zeigt allen PTS-Agenten dieselbe Bibliothek; die Rolle
  entscheidet per Guard/Prompt, welche Skills geladen werden dürfen.
- Skills mit `bash`/`run_code` sind nicht abbildbar (kein `allow`-Eintrag in
  den Subagent-Tool-Filtern; Boundary verbietet `bash`).
- `status` und Matrix sind Steuerung, keine Sicherheitsgrenze: Skill-Inhalte
  sind Skripte, deren Ausführung an die Worker-Sandbox von DSH gebunden bleibt.

## Tests

```bash
node --test dsh-plugins/pts-skill-manager/test/*.test.mjs
```

Abgedeckt: Frontmatter-Parser (Defaults/ungültig), Matrix-Normalisierung und
-Vorvalidierung, Settings-Sektion lesen/schreiben inkl. Konvoi mit dem
Steward-Writer, Import-Pfad-Härtung (kein Escape aus `skills/`), Konflikt- und
Löschregeln sowie Rollen-Erkennung, Guard und Prompt-Sektion des
Preset-Plugins.
