# pts-denkstand

DSH-Web-UI-Plugin: rendert die strukturierten **YAML-Denkdokumente** eines
Denkraums als teacher-facing Tab statt als Rohtext. Ergänzt die Artefakt-Galerie
(`pts-artifact-panel`, die nur `.md`/`.pdf`/Bilder/`.html` zeigt und `.yml`
deshalb auslässt) um eine sinnvolle Darstellung der drei Steuerungsdateien:

Der Denkstand ist als **Drei-Spalten-Übersicht** links→rechts aufgebaut:

| Spalte / Ansicht | Darstellung |
|---|---|
| **„Wo wir gerade gedanklich dran sind“** (links) | **Pinnwand der tragenden Aussagen** als Cards, die der User **voten** kann (▲/▼ → sortiert nach Wichtigkeit, Votes in `thoughts.json`): die **Leitideen** der Educational Intention (nummerierte Akzente wie „Rechtfertigung und Freiheit“, „Schöpfungsglaube“) + **Board-Hypothesen**. Darüber eine kompakte **„Aktueller Fokus“**-Statuszeile. Oben/Unten Link „Zum vollständigen Learning Design“ (Markdown-gerenderte Lese-Ansicht). |
| **„Klären“** (Mitte) | die **Klären-Spalte** des Planning Boards (die Klärungs-/Entscheidungs-Warteschlange) mit ✓ Annehmen / 💬 Klären; weitere Spalten (Vorbereiten/Auswerten/Bereit) einklappbar; darunter **„Geklärt (Entscheidungen)“** aus `decisions.yml` (E00N) — die **geklärten Fragen**. |
| **„Offene Fragen“** (rechts) | **trennt die Quellen klar**: (1) „Offene Fragen“ aus dem **Learning Design** (`## Open Questions`) mit **„💬 Klären“ → verschiebt in die Klären-Spalte**, „✓ Einverstanden“ → Entscheidung, „✕ Verwerfen“ → verwerfen; (2) „Fragen am **Lernmoment**“ (eingeklappt, verweisen auf die Lernlandschaft). |
| `decisions.yml` | die geklärten Fragen/Entscheidungen erscheinen **in der Mitte** unter „Geklärt“ (kein eigener Abschnitt mehr unten). |

> „Nächster Schritt“ ist bewusst **nicht** im Denkstand — der gehört in die Chat-/Companion-Fläche.

> Hinweis: Die frühere **Timeline** (temporal-plan) wird hier nicht mehr gerendert — die
> interaktive Stunden-Zuordnung (Fenster + Platzierungen) lebt im Tab **„Lernlandschaft“**.
> Der Denkstand ist damit das Dashboard für *Planung, Klärungen und Entscheidungen*.

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

- **Host-Hälfte** registriert drei Routen:
  - `GET /api/pts-denkstand?sessionId=<id>` — liest die drei YAML-Dateien plus
    `thoughts.json` (Votes) und liefert sie als JSON.
  - `POST /api/pts-denkstand/design-question` (`{ sessionId, question, action:
    'accept'|'discard' }`) — Lehrer-Entscheid zu einer Learning-Design-Frage:
    bei `accept` wird die Frage als verbindliche Entscheidung in `decisions.yml`
    geschrieben und aus den „Open Questions“ entfernt; bei `discard` nur entfernt.
  - `POST /api/pts-denkstand/thoughts` (`{ sessionId, statement, delta }`) — passt
    den Vote-Wert einer Pinnwand-Aussage in `thoughts.json` an (≥ 0).
  Atomarer Schreibzugriff, Pfad auf den Denkraum begrenzt. Der kompakte YAML-Parser
  deckt den Schemata-Subset ab (Block-Mappings, Block-Sequenzen, Verschachtelung
  über Einrückung, Flow-Sequenzen, Skalare, Kommentare) – `yaml` ist aus dem
  Profil-node_modules nicht auflösbar. **Einschränkung:** der Parser verarbeitet
  keine YAML-Fold-/Literal-Skalare (`>`/`|`); Entscheidungen deshalb einzeilig.
  Fehlende Dateien → `null`; unparsbare Dateien → kurze Fehlermeldung.
- **Client-Hälfte** registriert einen `conversation.view`-Tab (`id: denkstand`,
  `order: 40`, `label: "Denkstand"`). Er lädt die Route und rendert Brett,
  Timeline und Entscheidungen mit React.createElement (kein JSX/TS).

## Sicherheit

Pfade werden pro Anfrage über die Session-Workspace-Auflösung abgeleitet
(session.cwd, Fallback sandbox-Workspace). Die Schreib-Routen
(`/api/pts-denkstand/design-question`, `/api/pts-denkstand/thoughts`) schreiben
ausschließlich in `decisions.yml`, `learning-design.md` bzw. `thoughts.json` des
Denkraums, atomar (Temp-Datei + Rename), mit begrenzter Request-Größe.
Unveränderte Dateien werden nie angefasst.

## Abgrenzung

Der Tab **zeigt** die Denkdokumente. Er ändert nichts – Planungsbewegungen und
Entscheidungen laufen weiter über den Companion und die PTS-Worker. Für
Sichtbarkeit der *Worker-Ergebnisse im Chat* ist der Companion selbst zuständig
(die Reporting-Regel steht im Companion-Persona).
