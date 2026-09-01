# pts-artifact-panel

DSH-Plugin, das alle im Session-Workspace entstandenen Artefakte sichtbar macht:

- **„Artefakte"-Tab** im Session-Header (neben Chat/Trajectory): **Ordner-Tree**
  (links, gruppiert nach `materials/`, `drafts/`, `rendered/`, `knowledge-proposals/`
  und Denkraum-Wurzel) + **Vorschau** (rechts, PDF/HTML im gesandboxten iframe,
  Bilder als `<img>`, Markdown gerendert als HTML). Auto-Aktualisierung (5 s).
- **„Entscheidungen“ (`decisions.yml`)**: erscheint als Datei im Ordner-Tree
  (Denkraum-Wurzel) und öffnet als Vorschau eine **strukturierte, lesbare
  Entscheidungs-Liste** (Titel, Entscheidungstext, Begründung, Referenzen) —
  nicht nur den YAML-Rohtext (der bleibt als Fallback). Die strukturierte
  Darstellung wird über den `pts-denkstand`-Decoder geliefert; ist dieser nicht
  aufgelöst, fällt die Vorschau auf den Rohtext zurück.
- **„Neu erstellt“-Strip** (`shell.overlay`, oben zentriert): frisch entstandene
  Dateien (aus der geteilten `/artifacts/v2/list`-Registry, die write/edit-Tool-
  Ergebnisse sofort erfasst und per Scan auch Subagent-Ergebnisse nachzieht)
  gleiten als Mini-Cards von links ein; Klick öffnet denselben Dokument-Viewer in
  einem Modal. Cards blenden sich nach ~18 s aus. `prefers-reduced-motion` wird
  respektiert.
- **Rechte Panel-Vorschau (Details-Spalte)**: Die Spalte wird komplett übernommen
  (Slot-Priorität −1). Klick auf einen `write`/`edit`-Tool-Call zeigt den
  Dateiinhalt; alle anderen Tools behalten eine generische Eingabe-/Ergebnis-
  Anzeige. Der Call-Körper rendert unser `DetailsTool` direkt – eine
  `children`-Deklaration für `conversation.details.tool` ist unmöglich
  (Deklarationen sind exklusiv, das shipped Entry besitzt den Key) und ein
  `renderSlot`-Dispatch scheitert an der Ownership-Prüfung des Bindings.
  Die native Auswahl wird **rein lesend** beobachtet: der Chat-Store von
  ui-conversation persistiert jede Änderung nach localStorage unter
  `dsh.conversation.chat.<sessionId>`; unser Seat pollt diesen Key (300 ms).
  Schreibzugriffe auf den fremden Store finden nicht statt.
- **Produzierte-Dateien-Chips im Chat**: Der `turnTail`-Chain-Eintrag der
  Deliverables wird nur übernommen, wenn mindestens ein Pfad vorzeigbar ist
  (Chain-Priorität −1). Klick auf eine solche Datei setzt die Artefakt-Auswahl
  des Panels und öffnet es via `layout.openDetails()`; „← Zurück zum Aufruf“
  schaltet zurück zum zuletzt gewählten Call, „✕ Schließen“ schließt ohne
  Auswahl die Spalte. Nicht vorzeigbare Dateien öffnen sich weiterhin extern.
  Turns ohne vorzeigbare Dateien rendern unverändert die shipped Chips-Zeile.
- **Download**: „⬇ Herunterladen“ im Artefakt-Modus und in den Datei-Vorschauen
  der Call-Ansicht lädt über die `/artifacts/v2/file`-Route als Blob herunter
  (Objekt-URL-Anker mit Original-Dateinamen, Cleanup nach 10 s).
- **Erkennung** über Tool-Results (`tools/result`) plus Workspace-Scan
  (alle 10 s, 6 Ebenen tief, ohne `node_modules`/`.git`/…) – erfasst auch
  per Bash/Skript erzeugte Dateien.
- **Sicherheit**: Pfade werden pro Anfrage gegen den Session-Workspace
  (realpath-basiert) eingeschlossen; MIME-Whitelist, 30-MB-Limit,
  CSP-`sandbox` für HTML/SVG.

## Struktur

```
artifact-panel/
├── package.json      # dsh.client-Marker + ./client-Export (Browser-Roster)
├── lib/
│   ├── index.js      # Host-Hälfte: Route /artifacts/v2/*, Scan-Registry
│   └── client.js     # Client-Hälfte: __ModuleLoader__-Bundle (Slots, UI)
└── README.md
```

Der Workspace wird pro Anfrage aus der **Session** abgeleitet
(`sessions.get(id).header.cwd` bzw. `agent.session.header.cwd`) – das Plugin
funktioniert damit in jedem Workspace ohne Konfiguration.

> **Slot-Hinweis:** Der Takeover des Single-Slots
> `conversation.details.tool` registriert mit `priority: -1`. Bei
> Single-Slots rendert die niedrigste Priorität; das shipped ToolDetails
> liegt auf Default `0`. Ohne diese Angabe wirft der Loader beim Boot einen
> „already has a registration at priority 0“-Fehler.

## Installation (pro Rechner/Deployment)

1. Plugin-Ordner an einen beliebigen Ort klonen/kopieren (dieser Ordner genügt).

2. In das DSH-Profil einhängen – Windows-Junction (Admin nicht nötig):
   
   ```powershell
   New-Item -ItemType Junction `
     -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\pts-artifact-panel" `
     -Target "F:\code\pedagogical-thinking-space\dsh-plugins\artifact-panel"
   ```

3. Zeile in die persönliche Patch-Ebene `~\.dsh\profiles\web\cordis.patch.yml`
   eintragen:
   
   ```yaml
   - insert:
       - id: artifact-panel
         name: pts-artifact-panel
   ```

4. DSH neu starten. Der Tab erscheint danach in jeder Session jedes Workspaces;
   der Genehmigungs-Flow dynamischer Plugins entfällt.

## Bearbeiten & Weitergeben

- **Bearbeiten**: einfach die Dateien hier ändern → DSH neu starten
  (der Bundle-Rev-Hash wird beim Boot neu gelesen; HMR ist im Web-Profil
  bewusst deaktiviert).
- **Weitergeben**: diesen Ordner teilen (Git, Zip, …); Empfänger führen die
  drei Installationsschritte aus. Keine npm-Abhängigkeiten – React kommt zur
  Laufzeit aus dem Modul-Table des Web-Bundles.
- **Entfernen**: Patch-Zeile löschen und Junction entfernen.

## Beziehung zum dynamischen Prototyp

Der Prototyp läuft als *dynamisches* Cordis-Plugin nur innerhalb einer
Agenten-Session (Prozess-Speicher, Genehmigung im UI, nach Neustart weg).
Diese statische Version ist dieselbe Funktionalität als echtes Paket. **Nicht
beide gleichzeitig aktivieren** – beide belegen denselben Details-Slot und
dieselbe View-ID (`artifacts`). Vor dem Neustart auf die statische Version den
Prototyp stoppen/undefinen.
