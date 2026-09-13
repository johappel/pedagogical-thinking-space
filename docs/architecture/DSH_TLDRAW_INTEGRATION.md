# Integrationsworkflow: dsh-tldraw → PTS-Renderer

Dieses Dokument beschreibt, wie neue generische Whiteboard-Fähigkeiten oder
Verhaltensänderungen aus `F:\code\dsh-tldraw` in den PTS-Renderer gelangen.
Die Kurzregel steht in der Root-`AGENTS.md` und ist für jeden Coder Agent
verbindlich.

## Verantwortungsgrenze

```text
dsh-tldraw
  tldraw-Schema, Editor-Aufrufe, Browser-Mounting, Sidebar, Links,
  Snapshot-/Versionspersistenz, generische Host↔Client-Seams und deren E2E
        │ dokumentierter Vertrag
        ▼
PTS
  pädagogische Rollen, RenderPlan, Referenzauflösung, erlaubte Operationen,
  Companion-Fassade und fail-closed Domain-/Semantikgrenzen
```

PTS übernimmt keine private tldraw-Implementierung. Der Renderer kompiliert
einen semantischen Plan zu einem dokumentierten generischen Auftrag. Der
Companion darf die read-only Projektion `whiteboard_state` direkt lesen und
überprüfen; `pts_whiteboard_render` bleibt die einzige sichtbare Schreib- und
Semantik-Fassade. `whiteboard_render_plan` und die Whiteboard-Primitiven bleiben
interne Gegenstellen.

### Ausführungsbestätigung und Nacharbeit

`whiteboard_render_plan` liefert eine sessiongebundene `commandId`. Die Annahme
des Befehls (`accepted: true`) bedeutet nur, dass der Host ihn an den
zuständigen Browser weitergeben konnte. Erst ein Folge-Snapshot mit passendem
`commandResults[].commandId` und `ok: true` ist `verified` und darf als sichtbar
erledigt beschrieben werden. Der Client puffert frühe Events während des
asynchronen tldraw-Ladens und behandelt eine bereits erfolgreiche `commandId`
idempotent. Bei ausbleibendem oder negativem Ack wird derselbe Auftrag mit
derselben ID genau einmal nachgeliefert; danach bleibt der Zustand `pending`
oder `failed`. Der Companion liest dann `whiteboard_state`, vergleicht den
beabsichtigten exakten Inhalt und berichtet bzw. korrigiert begrenzt. Es gibt
keinen zusätzlichen PTS-Queue- oder Scheduler-Lifecycle.

## Entscheidungsablauf für eine neue Fähigkeit

### 1. Kandidat erfassen

Vor einer Änderung folgende Quellen in dieser Reihenfolge prüfen:

1. `F:\code\dsh-tldraw\AGENTS.md`
2. `F:\code\dsh-tldraw\docs\WHITEBOARD-SPEC.md`
3. `F:\code\dsh-tldraw\docs\TESTING.md`
4. `F:\code\dsh-tldraw\docs\SPIKE-REPORT.md`
5. `F:\code\dsh-tldraw\docs\vendor\tldraw\SOURCE.md` und bei Bedarf
   `llms-full.txt`
6. tatsächlich installierte DSH-/tldraw-Pakete und den aktuellen
   `plugin/dsh-whiteboard`-Code

Die Upstream-Referenz ist eine technische Quelle, aber kein Beweis dafür,
dass die lokale Runtime die API bereits anbietet. Version, Host-/Client-Seam
und Neustartbedarf werden ausdrücklich notiert.

### 2. Zuständigkeit entscheiden

| Frage | Zuständig |
| --- | --- |
| Muss tldraw- oder Browser-Code geändert werden? | dsh-tldraw zuerst |
| Ist es eine generische Page-, Link-, Asset-, Snapshot- oder Sidebar-Fähigkeit? | dsh-tldraw |
| Ist es nur eine PTS-Rolle oder eine semantische RenderPlan-Regel? | PTS |
| Werden Lernmomente, Entscheidungen oder Lehrkraftbestätigungen kanonisch verändert? | separater PTS-Domain-Spike |
| Fehlt der generische Seam? | dsh-tldraw-Spike, danach PTS-Anschluss |

Eine Fähigkeit darf nicht zweimal implementiert werden. Besonders unzulässig
sind ein PTS-seitiger Ersatz für fehlende tldraw-Editor-Aufrufe und direkte
Zugriffe des PTS-Renderers auf private Client- oder Store-Strukturen.

## Konkrete Feature-Kandidaten

Die folgenden beiden Beispiele konkretisieren, wie ein neuer Wunsch erfasst
und zwischen den Repositories aufgeteilt wird. Sie sind Anforderungen an
spätere Spikes, keine stillschweigend vorhandenen Funktionen.

### A. Sichtführung auf neu gerenderte Inhalte

Wenn ein RenderPlan mehrere neue Zettel oder Frames anlegt, soll die
Whiteboard-Ansicht die erzeugten Inhalte unmittelbar sichtbar machen:

- bei wenigen oder zusammenhängenden neuen Shapes: Kamera auf deren Bounds
  fokussieren, mit definiertem Padding und einem sinnvollen Zoom-Limit;
- bei vielen, stark verteilten oder zu kleinen Inhalten: begrenztes
  `editor.zoomToFit()` für die relevante Inhaltsmenge, nicht blind für das
  gesamte Board;
- die relevante Inhaltsmenge muss aus dem Renderauftrag bzw. den erzeugten
  IDs/`renderKey`s stammen, niemals aus einer geratenen Auswahl oder einem
  globalen Board-Scan;
- der Kamerabefehl erfolgt erst nach erfolgreicher Shape-/Frame-Erzeugung;
  bei Teilfehlern darf die Kamera keinen unvollständigen Erfolg vortäuschen;
- Kamera-Position und Zoom sind Ansichtszustand, keine PTS-Domainpersistenz.

Die Editor-API, Bounds-Berechnung, Padding-/Zoom-Grenzen und der Zeitpunkt der
Ausführung gehören in `dsh-tldraw`. PTS darf später lediglich einen
dokumentierten Präsentationswunsch wie `fit_created_content` angeben. Der
Nachweis braucht mindestens: mehrere neu erzeugte Shapes, viele bestehende
Shapes außerhalb des Fokus, Reload-Verhalten und eine menschliche
Sichtprüfung, dass alle neuen Inhalte erreichbar und lesbar sind.

### B. Änderungen für die Lehrkraft sofort erkennbar machen

Nach einer Agentenänderung soll die Lehrkraft die betroffenen Shapes ohne
Suche erkennen können. Geeignete, zurückhaltende Mittel sind beispielsweise:

- neue Shapes kurz und nicht-blockierend einfliegen oder sanft erscheinen
  lassen;
- editierte Shapes kurz pulsieren oder einen dezenten Fokus-Hinweis zeigen;
- die Anzeige nur für tatsächlich geänderte Agenten-Shapes verwenden, nicht
  für jeden Poll und nicht für unveränderte menschliche Inhalte;
- `prefers-reduced-motion` und eine abschaltbare, zugängliche Alternative
  (z. B. Fokusrahmen oder Änderungsmarkierung) unterstützen;
- Animationen nicht in den tldraw-Snapshot schreiben und keine semantischen
  Shape-Daten verändern.

Die Animation, Diff-Erkennung, Dauer, Unterbrechung und Accessibility gehören
in `dsh-tldraw`. PTS darf nur die Herkunft bzw. den Anlass eines Render-
Auftrags liefern, sofern dies bereits Teil des dokumentierten Meta-/Seam-
Vertrags ist. Es darf keine pädagogische Bedeutung aus einer Animation
abgeleitet werden. Die E2E-Abnahme muss mindestens neues Shape, editierte
Shape, reine menschliche Änderung, mehrere schnelle Agentenänderungen und
Reduced-Motion abdecken; Ergonomie und Nicht-Störung werden zusätzlich
menschlich bewertet.

### Gemeinsame Reihenfolge

Für A und B gilt dieselbe Reihenfolge: dsh-tldraw-Spike mit generischem
Vertrag und Tests, Live-Boot, Browser-E2E und Dokumentation; erst danach ein
kleiner PTS-Anschluss, falls der semantische RenderPlan dafür tatsächlich ein
neues Feld benötigt. Ein `queued`-Ergebnis ohne sichtbare Abnahme darf weder
die Kameraänderung noch die Änderungsanzeige als erledigt melden.

### 3. Generischen Vertrag nachweisen

Vor der PTS-Änderung muss mindestens feststehen:

- Name und Form des verwendeten dsh-tldraw-Seams;
- zulässige Eingaben, Ergebnis und Fehlerverhalten;
- Session-, Workspace- und Persistenzbezug;
- installierte DSH-/tldraw-Version;
- Schema- und Sicherheitsgrenzen, insbesondere bei Assets, Links und Pfaden;
- Verhalten bei `live=false`, Timeout, Versionskonflikt und unbekannter
  Fähigkeit;
- erforderlicher Neustart und Cache-/Browserzustand.

Unbekannte, unvollständige oder nur aus `llms-full.txt` abgeleitete Fähigkeiten
werden als `candidate` behandelt und fail-closed abgewiesen.

### 4. PTS-Anschluss minimal halten

Wenn der generische Vertrag nachgewiesen ist, sind nur die betroffenen PTS-
Schichten anzupassen:

- JSON-Schema für den öffentlichen semantischen Auftrag;
- `DESIGNER_CAPABILITIES` und `validateRenderPlan`;
- deterministischer Designer/Resolver in `render-plan.mjs`;
- Kompilierung in `renderer.mjs`;
- `RENDER_PLAN_GUIDANCE` und Toolgrenze;
- fokussierte Tests und die passende Architektur-Dokumentation.

Jede neue Fähigkeit braucht eine negative Prüfung: fehlender Seam,
unpassende Version, ungültige Eingabe oder nicht auflösbare Referenz darf
keinen partiellen Queue-Auftrag erzeugen. Bestehende Phase-1-Grenzen bleiben
erhalten: kein Domain-Write, keine automatische pädagogische Entscheidung,
kein `decisions.yml`-Write und keine bidirektionale Board-Synchronisierung.

## Nachweisformat

Für jede übernommene Fähigkeit im PR-/Änderungsprotokoll festhalten:

```text
Capability:
dsh-tldraw-Seam:
Runtime (DSH/tldraw):
PTS-Abbildung:
Negative-/Fail-closed-Fälle:
Static-Nachweis:
Live-Boot-Nachweis:
Browser-E2E-Nachweis:
Menschliche Sichtprüfung:
Offene Grenzen / Nicht-Ziele:
```

Die drei technischen Abnahmestufen dürfen nicht zusammengezogen werden. Ein
Browser-E2E-Test beweist außerdem nur den getesteten Session-/Workspace-
Kontext; er beweist keine fremde bereits geöffnete Instanz und keinen
Mehrbrowser-Live-Sync.

## Pflichtprüfungen

### PTS-Seite

```powershell
node --test --test-isolation=none F:\code\pedagogical-thinking-space\tests\pts-whiteboard-renderer.test.mjs
node --check F:\code\pedagogical-thinking-space\plugins\pts-whiteboard-renderer\lib\index.js
node --check F:\code\pedagogical-thinking-space\plugins\pts-whiteboard-renderer\lib\renderer.mjs
node --check F:\code\pedagogical-thinking-space\plugins\pts-whiteboard-renderer\lib\render-plan.mjs
git diff --check
```

### dsh-tldraw-Seite

Die dortige `AGENTS.md` und `docs/TESTING.md` sind maßgeblich. Mindestens
gehören dazu die Syntax-/Import-Prüfungen, der generische Renderer-Test, ein
Live-Boot mit dem aktiven Profil und die betroffenen Browser-E2E-Szenarien.
Nach Host- oder Client-Änderungen ist ein echter DSH-Neustart erforderlich;
ein Browser-Reload allein lädt keinen neuen Plugin-Code.

## Typische Fehlentscheidungen

- `llms-full.txt` als lokale API-Garantie behandeln;
- generische tldraw-Logik in PTS duplizieren;
- eine neue Fähigkeit nur durch einen erfolgreichen Toolcall als umgesetzt
  melden;
- `live=false` mit einem leeren Board verwechseln;
- bei einem Schemafehler den Poll-Loop weiterlaufen lassen oder persistierte
  Daten zurücksetzen;
- eine neue Board-Funktion als Domainentscheidung oder Lernmoment-
  Persistenz ausgeben;
- fehlende Tests durch eine bloße Dokumentationsänderung kaschieren.
