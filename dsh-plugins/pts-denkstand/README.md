# pts-denkstand

DSH-Web-UI-Plugin: rendert die strukturierten **YAML-Denkdokumente** eines
Denkraums als teacher-facing Tab statt als Rohtext. Ergänzt die Artefakt-Galerie
(`pts-artifact-panel`, die nur `.md`/`.pdf`/Bilder/`.html` zeigt und `.yml`
deshalb auslässt) um eine sinnvolle Darstellung der drei Steuerungsdateien:

| Datei | Darstellung |
|---|---|
| `planning-board.yml` | **Kanban-Brett** (Spalten Klären / Vorbereiten / Auswerten / Bereit) mit Art-, Status- und Freigabe-Badges, `description` als Kartentext und klickbaren Karten |
| `temporal-plan.yml` | **Timeline**: Unterrichtsfenster mit ihren Platzierungen (Start, Dauer, Dramaturgie-Rolle, Modus) |
| `decisions.yml` | **Entscheidungsliste** |

### Klickbare Karten & Aktionen direkt auf der Karte

- **Karte anklicken** markiert sie als aktiv (deutlicher grüner Rahmen). Die
  Auswahl ist über einen internen `Spalte::Index`-Schlüssel eindeutig, nicht
  über die Board-ID — denn `planning-board.yml` kann duplizierte IDs enthalten
  (der Steward hat in `hoffnung` alle vier Klärungen mit derselben
  `pb-steward-20260828-1` abgelegt). Nur die tatsächlich angeklickte Karte wird
  markiert.
- **„✓ Annehmen"** und **„💬 Klären"** liegen **direkt auf jeder Karte** und
  brauchen keinen Copy-Paste-Umweg: Sie rufen `inputActions.setDraft(prompt)`
  auf. Das ist die **offizielle** öffentliche Draft-API des Chat-Composers
  (`InputActions.setDraft` in `dsh-client-ui-conversation`, gereicht an jede
  Session-Scope-Slot-Komponente über das Standard-Kit `sessions.provide`).
  Der fertige teacher-ready Prompt („Ich akzeptiere den Vorschlag …" bzw.
  „Lass uns die offene Klärung entscheiden …") landet damit **direkt im
  Chat-Inputfeld**; die Lehrkraft prüft und sendet ihn. Der Companion setzt die
  Freigabe/Doku anschließend um (über pts_edit/pts_document).
- Fallback: Ist `inputActions` nicht erreichbar (kein aktiver Session-Scope),
  wird der Prompt stattdessen in die Zwischenablage kopiert — die Lösung
  degradiert, statt zu scheitern.

So werden offene Klärungen, die weitere Planung blockieren, auf einen Blick
sichtbar und klickbar – das Problem, das die Lehrkraft erlebt hat, als die
planning-board-Inhalte nicht angezeigt wurden.

## Struktur

```
pts-denkstand/
├── package.json          # dsh.client-Marker + ./client-Export (Roster)
├── lib/
│   ├── index.js          # Host-Hälfte: Route /api/pts-denkstand, YAML-Parser
│   └── client.js         # Client-Hälfte: conversation.view-Tab "Denkstand"
├── test-denkstand.mjs    # Logik-Smoke-Test (Parser + Board/Timeline)
└── README.md
```

## Installieren (pro Rechner/Deployment, pts-web-Profil)

1. Plugin-Ordner liegt im Repo (`dsh-plugins/pts-denkstand`).

2. Windows-Junction ins `pts-web`-Profil anlegen (Admin nicht nötig):

   ```powershell
   New-Item -ItemType Junction `
     -Path "$env:USERPROFILE\.dsh\profiles\pts-web\node_modules\pts-denkstand" `
     -Target "F:\code\pedagogical-thinking-space\dsh-plugins\pts-denkstand"
   ```

3. Zeile in `$env:USERPROFILE\.dsh\profiles\pts-web\cordis.patch.yml` ergänzen
   (unter dem bestehenden `- insert:` Block; nichts Bestehendes entfernen):

   ```yaml
       # PTS Denkstand: planning-board als Brett + temporal-plan als Timeline.
       - id: pts-denkstand
         name: pts-denkstand
         inject: [webServer]
   ```

4. **DSH neu starten** (im Web-Profil ist HMR deaktiviert; der Bundle-Rev-Hash
   wird beim Boot neu gelesen). Danach erscheint der Tab **„Denkstand“** neben
   Chat/Trajectory/Artefakte.

## Testen (vor Neustart)

```
node --check lib/client.js
node test-denkstand.mjs        # Parser + Board/Timeline (15 Checks)
node --input-type=module -e "await import('file:///F:/code/pedagogical-thinking-space/dsh-plugins/pts-denkstand/lib/index.js')"
```

## Wie es funktioniert

- **Host-Hälfte** registriert die Route `/api/pts-denkstand?sessionId=<id>`.
  Sie leitet den Workspace aus der Session ab (`sessions.get(id).header.cwd`),
  liest die drei YAML-Dateien und liefert sie als JSON zurück. Der mitgelieferte
  kompakte YAML-Parser deckt den Schemata-Subset ab (Block-Mappings,
  Block-Sequenzen, Verschachtelung über Einrückung, Flow-Sequenzen, Skalare,
  Kommentare) – `yaml` ist aus dem Profil-node_modules nicht auflösbar.
  Fehlende Dateien → `null`; unparsbare Dateien → kurze Fehlermeldung, damit die
  Lehrkraft das *Warum* sieht statt eines leeren Bretts.
- **Client-Hälfte** registriert einen `conversation.view`-Tab (`id: denkstand`,
  `order: 40`, `label: "Denkstand"`). Er lädt die Route und rendert Brett,
  Timeline und Entscheidungen mit React.createElement (kein JSX/TS).

## Sicherheit

Pfade werden pro Anfrage über die Session-Workspace-Auflösung aus der Session
abgeleitet; es wird nur gelesen. Keine Schreib-Route, kein gefährlicher Content.

## Abgrenzung

Der Tab **zeigt** die Denkdokumente. Er ändert nichts – Planungsbewegungen und
Entscheidungen laufen weiter über den Companion und die PTS-Worker. Für
Sichtbarkeit der *Worker-Ergebnisse im Chat* ist der Companion selbst zuständig
(die Reporting-Regel steht im Companion-Persona).
