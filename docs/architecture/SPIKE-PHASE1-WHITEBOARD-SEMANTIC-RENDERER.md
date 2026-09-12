# PTS Whiteboard Semantic Renderer Spike – Phase 1

**Gesamturteil: PASS WITH CONDITIONS**

Der Spike zeigt einen tragfähigen Pfad von einem einzigen semantischen
`pts_whiteboard_render`-Auftrag zu einem validierten RenderPlan und von dort zu
einem deterministischen Whiteboard-Renderer. Die generische Gegenstelle ist in
`dsh-whiteboard` ergänzt. Die statische und hostseitige Kette ist geprüft;
Browser-Abnahme mit echtem tldraw-Canvas, Klicknavigation und echten Bilddaten
steht noch aus und ist Bedingung für einen uneingeschränkten PASS.

## 1. Capability-Inventur

Die Inventur wurde gegen `F:\code\dsh-tldraw\plugin\dsh-whiteboard` und die
laufzeitnahe Junction im PTS-Profil vorgenommen.

| Fähigkeit | Ergebnis | Beleg / Konsequenz |
|---|---|---|
| Pages intern erzeugen | vorhanden in tldraw, nun generisch ausgeführt | `editor.createPage({ name })` |
| Pages umbenennen | tldraw-Store-Fähigkeit vorhanden, vorher nicht exponiert | Phase-1-Seam nutzt bestehende Page-Auflösung; eine separate Companion-Funktion gibt es nicht |
| Shapes zwischen Pages verschieben/kopieren | tldraw-Store kann Records persistieren; gezieltes Bearbeiten inaktiver Pages war nicht exponiert | Renderer liest Quellen vor dem Page-Wechsel und kopiert ausgewählte Karten auf die Ziel-Page |
| Shapes Links tragen | tldraw Rich-Text unterstützt Link-Markierungen | PTS-interne Hash-Links; URL ist zusätzlich in `meta.href/pageRef` gespiegelt |
| Deep Links auf Pages/Shapes | Page-Deep-Link jetzt als kontrollierter Hash zur aktiven Whiteboard-Instanz | `#dsh-whiteboard-page=<pageId>` plus `hashchange`; Shape-Deep-Link bleibt bewusst nicht als allgemeiner URL-Vertrag definiert |
| Styles vorhandener Shapes | vorhanden | tldraw-Shape-Props; Renderer verwendet zentrale Rollen-Zuordnung |
| Hintergrund/Füllung/Rahmen/Textfarbe | vorhanden für die verwendeten Note-/Frame-Props | nicht nur Farbe: Icon, Label, Shape und `meta.semanticRole` unterscheiden Rollen |
| Shape-Typen | bestehend: `note`, `frame`, `arrow`; tldraw zusätzlich für `image` verwendet | keine neuen PTS-Shape-Typen |
| Bilder/Assets | tldraw `asset` + `image` vorhanden, vorher nicht exponiert | generischer Seam legt Asset und sichtbares Image-Shape an |
| Asset-Resolver/Upload-Seam | kein bestehender PTS-Resolver; kein Upload gebaut | kontrollierte Read-only-Resource-Route für ausgewählte Workspace-Dateien |
| PTS-interne URL auf Shape | vorher nicht vorhanden | `/pts-whiteboard-renderer/resource?...` für Dokument-/Materialreferenzen; lokale `file://`-Pfade werden nicht verwendet |
| mehrere Änderungen als gemeinsamer Auftrag | vorher nein, Queue enthielt einzelne Low-Level-Kommandos | ein `whiteboard_render_plan`-Queue-Eintrag; Renderer arbeitet in einem `editor.run`-Batch |
| Host↔Client-Seams | `/dsh-whiteboard/api`, Polling und Tool-Registry vorhanden | zusätzlich generisches `wb-board`/`wb-save` für dauerhafte tldraw-Snapshots; M1-Adapter bleibt reine Leseschicht |
| intern vorhandene, nicht exponierte Fähigkeiten | Page-Store, Page-Wechsel, tldraw Assets, Rich-Text-Links, `editor.run` | als generische dsh-whiteboard-Gegenstelle exponiert; keine PTS-Semantik in dsh-whiteboard |

Zusammenfassung: **vorhanden** waren die tldraw-Primitives; **vorhanden, aber
nicht exponiert** waren Pages, Assets, Links und Batch-Ausführung; **tatsächlich
fehlend** war ein generischer host→client RenderPlan-Auftrag samt sicherem PTS-
Dokument-/Material-Resolver. Kein vollständiges Materialmanagement und keine
Domainpersistenz wurden daraus abgeleitet.

## 2. Gewählte Architektur

```text
Companion
    │ ein sichtbarer semantischer Toolcall
    ▼
pts_whiteboard_render
    │ 1. whiteboard_state lesen
    │ 2. reinen Designer-/Schema-Seam ausführen
    │ 3. RenderPlan fail-closed validieren
    ▼
whiteboard_render_plan       (generischer dsh-whiteboard Host→Client-Seam)
    ▼
editor.run(...)              (Pages, Karten, Frames, Links, Assets)
```

Die PTS-Schicht liegt in
`plugins/pts-whiteboard-renderer/`. Der Companion erhält nur den semantischen
Vertrag; Low-Level-Whiteboard-Kommandos sind kein Teil des neuen Auftrags.
Der vorhandene M1-Adapter wird weder importiert noch erweitert.

## 3. Whiteboard Designer

Ein eigener modellbasierter Subagent wurde geprüft, für Phase 1 aber nicht als
notwendig gewählt. Der Toolcall erhält bereits eine semantisch strukturierte
Beschreibung; die riskanten Teile – Rollen, Eindeutigkeit und ID-Auflösung –
sollen deterministisch und reproduzierbar sein. Ein zusätzlicher LLM-Turn würde
hier nur Latenz und eine zweite Fehlerquelle einführen.

`designRenderPlan()` ist deshalb der kleine Designer-Seam: Er interpretiert den
strukturierten Auftrag, löst bestehende Karten über Textreferenzen auf und
liefert ausschließlich einen validierten strukturierten Plan. Die später
denkbare LLM-Interpretation kann diesen reinen Seam ersetzen, ohne den Renderer
zu verändern. Sie darf weiterhin keinen Freitext als Ausführungsplan liefern.

## 4. RenderPlan-Schema

Das Schema liegt in
`schemas/whiteboard-render-plan.schema.json`; die ausführbare Minimalvalidierung
liegt in `plugins/pts-whiteboard-renderer/lib/render-plan.mjs`.

Unterstützt werden:

- `operation`: Workspace anlegen/ändern, Materialauswahl oder Dokumentkarte;
- `page`: `ensure` oder `use_current` mit Seitentitel;
- `heading` und Template `learning_moment_workspace`;
- Elemente als `existing`, `new`, `material` oder `document`;
- Rollen `learning_moment`, `method_idea`, `open_question`,
  `document_reference`, `material_reference`, `page_reference`;
- optionale Links, Übersicht-Referenz und kontrolliertes Detach einzelner
  Renderer-Projektionen.

Fehlende Referenzen, doppelte Texttreffer, ungültige Rollen und unbekannte
Operationen führen vor der Queue-Mutation zu einem strukturierten Fehler.

## 5. Deterministischer Renderer

`plugins/pts-whiteboard-renderer/lib/renderer.mjs` erzeugt den generischen
Queue-Auftrag. `dsh-whiteboard/lib/client.js` führt ihn deterministisch aus:

- Ziel-Page finden oder erzeugen;
- vorhandene Quellkarten vor dem Page-Wechsel sichern und nur ausgewählte Karten
  kopieren;
- Workspace-Heading als benannten Hintergrund-Frame darstellen, nicht als
  gewöhnlichen Methoden-Zettel;
- Lernmoment als hervorgehobene Ankerkarte und Methoden als kleinere Karten
  platzieren;
- optionale echte Arrow-Bindings erzeugen;
- Page- und Rücknavigation als markierte, verlinkte Karten anlegen;
- einzelne ausgewählte Materialien als Image-Asset bzw. Referenzkarte anlegen;
- bei `detach` nur Renderer-Projektionen mit passender Herkunft entfernen;
- keine `decisions.yml`, kein LearningMoment-Objekt, keinen Domain-Store ändern.

Der Renderer entscheidet nicht, ob der Inhalt pädagogisch ein Lernmoment,
eine beantwortete Frage oder eine Unterrichtsentscheidung ist. `learning_moment`
ist in Phase 1 eine visuelle Rolle.

## 6. Pages, Layout und Navigation

Der Referenzfall erzeugt eine eigene Page `LM · Danke`. Der Heading-Frame trägt
den vollständigen Text:

```text
Lernmoment (Entwurf): Kinder entdecken, dass „Danke“ nicht selbstverständlich ist – wofür und wem?
```

Der Anker steht oberhalb der Methodenideen; die Übersicht behält ihre
ursprüngliche Karte und erhält eine kompakte `page_reference`-Karte. Eine
Rückkarte auf der Ziel-Page führt zur Quell-Page. Das Hash-Navigationssignal wird
beim Mount und bei `hashchange` ausgewertet.

Die Browser-Abnahme muss noch prüfen, dass tldraw die Link-Markierung in der
verwendeten Rich-Text-Shape klickbar rendert und dass die Page nach dem Klick
sichtbar wechselt. Ein bloßes Vorhandensein der Hash-Metadaten gilt nicht als
visuelle Abnahme.

## 7. Styles und semantische Rollen

Die zentrale Zuordnung liegt parallel in `render-plan.mjs` und im generischen
Client:

| Rolle | Darstellung |
|---|---|
| `learning_moment` | hervorgehobene Ankerkarte, ⚓, Label „Lernmoment“, blau |
| `method_idea` | kleinere Ideenkarte, 💡, Label „Methodenidee“, gelb |
| `open_question` | Fragekarte mit `?`, violetter Akzent |
| `document_reference` | 📄-Karte mit kurzer Beschriftung und PTS-Referenz |
| `material_reference` | 🧰-Karte oder sichtbares Bild-Asset |
| `page_reference` | ↗/↩-Navigationskarte mit Hash-Link |

Semantik wird damit nicht ausschließlich durch Farbe kommuniziert. `meta.actor`
bleibt die Herkunft des Renderer-Beitrags; bei kopierten menschlichen Karten
liegt die ursprüngliche Herkunft zusätzlich in `meta.sourceActor`.

## 8. Dokumentreferenzen

Dokumentkarten speichern `documentId` und/oder einen Workspace-relativen Pfad
im Shape-Meta und zeigen eine kurze Beschriftung. Die URL ist nur Navigation:
`/pts-whiteboard-renderer/resource?...`. Es gibt keine primären `file://`-Links.

Die kontrollierte Route erlaubt nur eine MIME-Whitelist (`jpg/jpeg/png/gif/webp`,
PDF, Markdown/Text und DOCX), begrenzt die Größe und prüft den aufgelösten Pfad
gegen den Session-Workspace. Ein Ordner wird nicht automatisch gescannt.

## 9. Bilder und Materialordner

Der Auftrag nennt explizit ausgewählte Dateien, zum Beispiel
`materials-test/bild-1.jpg` und `materials-test/lied.pdf`. Nur das Bild wird als
tldraw-Asset plus sichtbares `image`-Shape dargestellt; das PDF wird als kurze
Material-/Dokumentkarte mit interner Route dargestellt. Nicht ausgewählte
Dateien bleiben im Materialpool.

Ein registrierter externer Ordner bleibt in diesem Spike konzeptionell
`mode: reference`; eine allgemeine Dateiverwaltung, Uploads, Cloud-Seams oder
Eigentumsübernahme sind ausdrücklich nicht enthalten. Für eine reale externe
Quelle braucht der nächste Schritt eine eigene allowlistete Resolver-Konfiguration.

## 10. Änderungen an dsh-whiteboard

Generisch und PTS-unabhängig ergänzt wurden:

- Host-Tool `whiteboard_render_plan`, das genau einen RenderPlan als Queue-
  Auftrag annimmt;
- Client-Ausführung für `createPage`, `setCurrentPage`, Rollen-Styles,
  Rich-Text-Links, Page-Hash-Navigation, `image`-Shapes und Assets;
- ein gemeinsamer `editor.run`-Batch und bestehende Arrow-Binding-Mechanik;
- ein hostseitiger Snapshot-Store unter `$DSH_HOME/whiteboard-snapshots` mit
  opaker, aus dem Workspace-Pfad abgeleiteter Board-ID;
- Laden vor dem ersten Live-Snapshot, Versionsprüfung und fail-closed Verhalten
  bei konkurrierenden Browser-Schreibvorgängen.

Unverändert bleiben vorhandene neun Brainstorming-Tools, Vorschlags-/Übernahme-
Semantik, Sidebar-Mounting und die Herkunftslogik. Die Browser-IndexedDB bleibt
nur lokaler Cache; der Host-Snapshot ist die gemeinsame Persistenzquelle. Es gibt
keinen PTS-Namen, keinen LearningMoment-Begriff und keinen Domain-Schreibpfad in
`dsh-whiteboard`.

## 11. Änderungen an PTS

- neues Plugin `pts-whiteboard-renderer`;
- neues RenderPlan-Schema;
- additive Profilzeile neben `dsh-whiteboard`;
- kontrollierte Resource-Route für ausgewählte Workspace-Dateien;
- reine Plan-/Renderer-Tests in `tests/pts-whiteboard-renderer.test.mjs`.

Nicht geändert wurden `pts-whiteboard-adapter`, seine Kontextprojektion, der
M1-Autoritätsrahmen, PTS-Domain-Dateien, `decisions.yml` und die bestehenden
Workerrollen. Der M1-Adapter bleibt Leseschicht, Store-/Service-/Event-Bus-frei.

## 12. Testszenarien A–D

Die Testabdeckung prüft Planvalidierung, eindeutige/missing Referenzen,
fail-closed-Verhalten, Rollenunterscheidung sowie begrenzte Material-/Dokument-
Referenzen. Die generische Client-Seite ist syntaktisch geprüft.

Die vier Browser-Szenarien benötigen noch eine laufende, neu gestartete
Installation:

- A: Page, Heading-Frame, Anker, zwei Methoden, Übersicht/Rücknavigation;
- B: Detach einer Renderer-Projektion über Rolle + Quelltext, ohne andere Inhalte;
- C: kompakte PDF-/Dokumentkarte mit interner Route;
- D: sichtbares Bild-Asset und PDF-Referenz bei unverändertem Materialpool.

## 13. Performancevergleich

Der neue Pfad hat als beabsichtigte und statisch nachweisbare Form:

| Metrik | bisheriger Low-Level-Pfad | neuer Pfad |
|---|---:|---:|
| sichtbare Companion-Toolcalls | mehrere | 1 |
| Board-State-Abfragen | mindestens 1, oft erneut vor Referenzschritten | 1 im Renderer |
| Low-Level-Whiteboard-Operationen im Companion | mehrere | 0 sichtbar; 1 interner Batchauftrag |
| Designer-/Subagent-Turns | 0 | 0 im deterministischen Phase-1-Designer |
| Gesamtdauer / Zeit bis Gesprächsbereitschaft | noch nicht live gemessen | noch nicht live gemessen |
| Referenz-Fehlversuche | können zwischen Turns auftreten | vor Mutation: missing/ambiguous als strukturierter Fehler |
| Renderer-Validierungsfehler | kein Planvertrag | explizit gezählt und zurückgegeben |

Das ist noch kein empirischer Geschwindigkeitsnachweis. Der Vorteil ist derzeit
belegt als Companion-Entlastung und als bessere Fehlergrenze; ein echter
Zeitvergleich muss mit identischem Board, gleicher Instanz und Browser-Telemetrie
nachgereicht werden. Ein Subagent wurde bewusst nicht eingeschaltet, weil dies
für diese strukturierte Phase sonst die Latenz erhöhen würde.

## 14. Background-Ausführung

Ein neuer Background-Job-Mechanismus wurde nicht gebaut. Der Phase-1-Designer
läuft deterministisch im bestehenden Toolcall. Damit bleibt das Gespräch nach
dem Toolcall frei; ein späterer modellbasierter Designer darf nur über die
vorhandene DSH-Subagent-Infrastruktur und mit strukturiertem JSON-Rückgabevertrag
ergänzt werden. Continuable-/Scheduler-/Dispatcher-Logik gehört nicht in PTS.

## 15. Bekannte Grenzen

- Browser-/visuelle Abnahme ist noch offen; tldraw-CDN, echte Asset-Dateien und
  klickbare Rich-Text-Links müssen live geprüft werden.
- `dsh-whiteboard` speichert den letzten vollständigen tldraw-Snapshot jetzt
  versioniert unter `$DSH_HOME/whiteboard-snapshots`; der M1-Adapter erhält
  weiterhin keine Schreib- oder Domainfunktion.
- Der Store ist kein transaktionaler Rollback-Store für Renderer-Aufträge:
  vollständige Planvalidierung vor Queue-Eintrag und ein `editor.run`-Batch
  bleiben deshalb erforderlich.
- Zwei gleichzeitig schreibende Browser werden nicht live synchronisiert. Der
  Versionskonflikt wird erkannt, der spätere Stand nicht still überschrieben;
  ein tldraw-Sync-/WebSocket-Spike bleibt ein eigener nächster Schritt.
- Shape-Deep-Links sind nicht als allgemeiner stabiler öffentlicher Vertrag
  festgelegt; Page-Hash-Links gelten nur für die offene Whiteboard-Instanz.
- Der externe Materialordner ist nur als kontrollierte Referenzidee vorbereitet.

## Phase 2 – LearningMoment Domain Binding

Nicht Teil dieses Spikes. Phase 1 schafft lediglich technische Anker für einen
späteren Anschluss-Spike:

- `meta.renderKey`, `sourceId`, `documentId`, `sourcePath`, `semanticRole`,
  `workspacePageId` und Page-Referenzen zeigen, wo eine stabile Projektion-
  Referenz liegen kann; sie sind noch keine kanonische Domain-ID.
- Ein Domain-`LearningMoment` könnte mehrere Projektionen besitzen: Übersicht-
  karte, Arbeitsraum-Anker, Material-/Dokumentreferenzen und spätere Sichten
  müssten über eine separate Projection-ID auf dasselbe Domainobjekt zeigen.
- Noch fehlende Provenienz: bestätigende Lehrkraft, Zeitpunkt und Art der
  Bindungsentscheidung, Version des Domainobjekts sowie sichere Herkunft bei
  Kopien. `actor: agent` des Renderers ersetzt diese Provenienz nicht.
- Beim Löschen einer Darstellung muss nur die Projektion verschwinden; das
  Domainobjekt darf erhalten bleiben. Wird eine Page gelöscht, muss die spätere
  Domain-Schicht verbleibende Projektionen und verwaiste Referenzen erkennen,
  ohne aus dem Board-Löschen eine Domainlöschung abzuleiten.
- Die Autoritätsgrenze muss später explizit sein: Domain-Store für kanonische
  Identität und bestätigte Inhalte; Board für visuelle Anordnung und
  unverbindliche Projektionen/Intentionen. Board ↔ Domain darf nicht automatisch
  bidirektional synchronisieren.

Der nächste Spike sollte zuerst ein kleines Binding-/Provenienzschema und einen
Lehrkraft-Bestätigungspunkt entwerfen, danach einen separaten Domain-Write-Seam
prüfen. Der Phase-1-Renderer wird dafür nicht nachträglich zum Domain-Service
umgebaut.

## 16. Empfehlung

Nach der Browser-Abnahme mit Szenarien A–D und einem identischen Vorher/Nachher-
Performanceprotokoll ist der nächste sinnvolle Schritt die Cordis-Komposition:
`pts_whiteboard_render` als sichtbares Companion-Tool, ein klar abgegrenzter
Designer-Preset-/Schema-Vertrag und eine Toolgrenze, die die Low-Level-Tools für
den Companion ausblendet. Erst danach sollte Phase 2 als eigener, ausdrücklich
bestätigter Domain-Spike beginnen.

## 17. Live-Nachtrag 2026-09-12

Die statische Kette bleibt reproduzierbar: `node --test --test-isolation=none
tests/pts-whiteboard-renderer.test.mjs` besteht mit 7/7 Tests; beide geänderten
`dsh-whiteboard`-Dateien sind syntaktisch gültig und `git diff --check` ist
sauber.

Szenario A wurde in einer vorherigen laufenden Session live beobachtet: ein
semantischer Auftrag, eine sichtbare Toolausführung, eigene Page, Heading-Frame,
Anker, zwei Methodenideen, Pfeile sowie Rücknavigation. Das Ergebnis ist als
Browser-Nachweis gültig, die historische Fehlerspur derselben Session aber nicht
als PASS zu werten.

Beim erneuten Materiallauf wurden zwei generische tldraw-Grenzen gefunden und
behoben: konkrete Bild-MIME-Typen statt `image/*` sowie kein ungültiges
`altText`-Feld im tldraw-Asset-Record. Zusätzlich sanitisiert der Host jetzt die
live `whiteboard_state`-Antwort auf lossless JSON. Ein erneuter visueller
Material-PASS konnte danach in dieser Ausführung nicht erbracht werden: Der
ursprüngliche DSH-Home verweigert den Profil-Rewrite mit `EPERM`, und die
isolierte Ersatzinstanz hatte noch keine Session; der native Workspace-Picker
scheiterte dort mit `spawn EPERM`. Bild-Asset, PDF-Karte und Klicknavigation
bleiben deshalb ausdrückliche Nachbedingungen dieses `PASS WITH CONDITIONS`.

Die kontrollierte Resource-Route wurde gegen die laufende PTS-Instanz separat
geprüft: `materials-test/bild-1.png` liefert `image/png` (1283 Bytes),
`materials-test/lied.pdf` liefert `application/pdf` (566 Bytes), und ein Pfad
außerhalb des Workspace wird mit HTTP 400 abgewiesen. Das belegt die Host- und
Sicherheitsgrenze, ersetzt aber nicht die noch offene sichtbare tldraw-
Darstellung.

Die Änderungen an `dsh-whiteboard` bleiben generisch: Asset-Validierung,
lossless Toolgrenze und Whiteboard-Snapshot-Persistenz, aber keine PTS-
Domainbegriffe und keine Erweiterung des M1-Adapters. Die PTS-Companion-Toolgrenze blendet die
Whiteboard-Primitives einschließlich `whiteboard_render_plan` aus; sichtbar
bleibt nur `pts_whiteboard_render`. Eine isolierte Testinstanz wurde nur zur
Laufzeitdiagnostik verwendet und danach wieder entfernt; sie ist kein
Bestandteil des Spikes.

## 18. Live-Nachtrag nach DSH-Neustart und Asset-Diagnose

Nach dem Neustart wurde der finale Client zuerst ohne Diagnoseausgaben geladen.
Der semantische Materialauftrag wurde mit genau einem `pts_whiteboard_render`-
Aufruf angenommen. Der tldraw-Client brach beim Bild-Asset jedoch mit einem
konkreten Schemafehler ab: `asset(type = image).meta` war `undefined`.

Die generische Gegenstelle in `dsh-whiteboard/lib/client.js` wurde deshalb
minimal korrigiert: Bild-Shape-Props enthalten jetzt die vollstaendigen
tldraw-Defaults (`playing`, `url`, `crop`, `flipX`, `flipY`), und der Asset-
Record erhaelt ein JSON-kompatibles `meta: {}`. Der Fix ist syntaktisch
geprueft. Es wurden keine Whiteboard-Daten zurueckgesetzt und keine Test-Pages
geloescht.

## 19. Live-Nachtrag Snapshot-Store

Der generische Host-Snapshot-Store wurde nach einem DSH-Neustart live geladen.
Der Browser-Client migrierte den vorhandenen lokalen tldraw-Stand in den
Host-Store; die Datei lag anschließend unter
`F:\dsh-instances\pts\.dsh\whiteboard-snapshots\` als versionierter Snapshot
im tldraw-Format `{ document, session }` (19 KB, Version 2). Ein anschließender
Browser-Reload zeigte weiterhin drei Zettel und die aktive Page `LM · Danke`.

Der erste Lauf hat ein Formatproblem der tldraw-API sichtbar gemacht: Die
Validierung akzeptierte zunächst nur ein direktes `{ store }`-Format. Sie
akzeptiert jetzt beide tldraw-Formen. Der Host-API-Test (`wb-board`/`wb-save`),
der Versionskonflikttest und die Browser-Ladeprüfung sind bestanden. Ein echter
gleichzeitiger Chrome-/Firefox-Live-Sync ist weiterhin nicht Teil dieses Stores;
bei konkurrierenden Schreibvorgängen wird der spätere Stand geschützt.
