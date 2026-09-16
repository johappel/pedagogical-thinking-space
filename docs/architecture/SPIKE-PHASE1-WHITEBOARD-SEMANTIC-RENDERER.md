# PTS Whiteboard Semantic Renderer Spike – Phase 1

**Gesamturteil: PASS**

Der abschliessende Browserstatus und die Aufhebung der frueheren Vorbehalte
stehen in Abschnitt 20.

Der Spike zeigt einen tragfähigen Pfad von einem einzigen semantischen
`pts_whiteboard_render`-Auftrag zu einem validierten RenderPlan und von dort zu
einem deterministischen Whiteboard-Renderer. Die generische Gegenstelle ist in
`dsh-whiteboard` ergänzt. Die statische und hostseitige Kette ist geprüft;
Browser-Abnahme mit echtem tldraw-Canvas, Klicknavigation und echten Bilddaten
steht noch aus und ist Bedingung für einen uneingeschränkten PASS.

## 1. Capability-Inventur

Die Inventur wurde gegen `F:\code\dsh-tldraw\plugin\dsh-whiteboard` und die
laufzeitnahe Junction im PTS-Profil vorgenommen.

| Fähigkeit                                       | Ergebnis                                                                                          | Beleg / Konsequenz                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Pages intern erzeugen                           | vorhanden in tldraw, nun generisch ausgeführt                                                     | `editor.createPage({ name })`                                                                                                 |
| Pages umbenennen                                | tldraw-Store-Fähigkeit vorhanden, vorher nicht exponiert                                          | Phase-1-Seam nutzt bestehende Page-Auflösung; eine separate Companion-Funktion gibt es nicht                                  |
| Shapes zwischen Pages verschieben/kopieren      | tldraw-Store kann Records persistieren; gezieltes Bearbeiten inaktiver Pages war nicht exponiert  | Renderer liest Quellen vor dem Page-Wechsel und kopiert ausgewählte Karten auf die Ziel-Page                                  |
| Shapes Links tragen                             | tldraw Rich-Text unterstützt Link-Markierungen                                                    | PTS-interne Hash-Links; URL ist zusätzlich in `meta.href/pageRef` gespiegelt                                                  |
| Deep Links auf Pages/Shapes                     | Page-Deep-Link jetzt als kontrollierter Hash zur aktiven Whiteboard-Instanz                       | `#dsh-whiteboard-page=<pageId>` plus `hashchange`; Shape-Deep-Link bleibt bewusst nicht als allgemeiner URL-Vertrag definiert |
| Styles vorhandener Shapes                       | vorhanden                                                                                         | tldraw-Shape-Props; Renderer verwendet zentrale Rollen-Zuordnung                                                              |
| Hintergrund/Füllung/Rahmen/Textfarbe            | vorhanden für die verwendeten Note-/Frame-Props                                                   | nicht nur Farbe: Icon, Label, Shape und `meta.semanticRole` unterscheiden Rollen                                              |
| Shape-Typen                                     | bestehend: `note`, `frame`, `arrow`; tldraw zusätzlich für `image` und `text` verwendet           | PTS ordnet den begrenzten semantischen Typ `free_text` der generischen `text`-Presentation zu                                 |
| Bilder/Assets                                   | tldraw `asset` + `image` vorhanden, vorher nicht exponiert                                        | generischer Seam legt Asset und sichtbares Image-Shape an                                                                     |
| Asset-Resolver/Upload-Seam                      | kein bestehender PTS-Resolver; kein Upload gebaut                                                 | kontrollierte Read-only-Resource-Route für ausgewählte Workspace-Dateien                                                      |
| PTS-interne URL auf Shape                       | vorher nicht vorhanden                                                                            | `/pts-whiteboard-renderer/resource?...` für Dokument-/Materialreferenzen; lokale `file://`-Pfade werden nicht verwendet       |
| mehrere Änderungen als gemeinsamer Auftrag      | vorher nein, Queue enthielt einzelne Low-Level-Kommandos                                          | ein `whiteboard_render_plan`-Queue-Eintrag; Renderer arbeitet in einem `editor.run`-Batch                                     |
| Host↔Client-Seams                               | `/dsh-whiteboard/api`, sessiongebundene Event-Streams, Store-Listener und Tool-Registry vorhanden | zusätzlich generisches `wb-board`/`wb-save` für dauerhafte tldraw-Snapshots; M1-Adapter bleibt reine Leseschicht              |
| intern vorhandene, nicht exponierte Fähigkeiten | Page-Store, Page-Wechsel, tldraw Assets, Rich-Text-Links, `editor.run`                            | als generische dsh-whiteboard-Gegenstelle exponiert; keine PTS-Semantik in dsh-whiteboard                                     |

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
`plugins/pts-whiteboard-renderer/`. Der Companion erhält den semantischen
Rendervertrag und darf den read-only Zustand über `whiteboard_state` prüfen;
Low-Level-Whiteboard-Kommandos sind kein Teil des sichtbaren Auftrags.
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
- `heading` sowie die allowlisteten Templates `learning_moment_workspace`,
  `comparison`, `pro_con`, `cause_effect`, `sequence`, `cluster`, `matrix`
  und `timeline`; unbekannte Namen scheitern vor einer Mutation;
- Elemente als `existing`, `new`, `material` oder `document`;
- Rollen `learning_moment`, `method_idea`, `open_question`,
  `document_reference`, `material_reference`, `page_reference`, `free_text`;
- `free_text` nur als neues, kurzes Element: ohne Zettel für Überschriften,
  Achsenbeschriftungen und Erläuterungen; bestehende Shapes bleiben unverändert;
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

| Rolle                      | Darstellung                                             |
| -------------------------- | ------------------------------------------------------- |
| `note` bzw. fehlende Rolle | neutrale gelbe Karte; der Text bleibt unverändert       |
| `learning_moment`          | hervorgehobene blaue Ankerkarte, ohne Präfix im Inhalt  |
| `method_idea`              | gelbe Ideenkarte, ohne „💡 Methodenidee:“ im Inhalt     |
| `open_question`            | violett akzentuierte Karte, ohne Kategorie-Text         |
| `document_reference`       | grüne Referenzkarte; Beschriftung kommt aus dem Auftrag |
| `material_reference`       | orange Referenzkarte oder sichtbares Bild-Asset         |
| `page_reference`           | blaue Navigationskarte mit Hash-Link                    |

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
- Board-Identität und tldraw-Persistence-Key sind an den Workspace gebunden;
  die Session-ID bleibt ausschließlich Live-Kanal und Auftragsscope. Eine
  unbekannte Session fällt nicht auf `process.cwd()` zurück;
- Laden vor dem ersten Live-Snapshot, Versionsprüfung und fail-closed Verhalten
  bei konkurrierenden Browser-Schreibvorgängen;
- sessiongebundene `commandId`-Bestätigung: `accepted` ist nur Annahme, ein
  passendes `commandResults[].ok: true` im Folge-Snapshot ist erst `verified`;
  frühe Events werden gepuffert und derselbe Auftrag bei fehlendem oder
  negativem Ack höchstens einmal idempotent nachgeliefert.

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

| Metrik                                        | bisheriger Low-Level-Pfad                      | neuer Pfad                                                |
| --------------------------------------------- | ----------------------------------------------:| ---------------------------------------------------------:|
| sichtbare Companion-Toolcalls                 | mehrere                                        | 1                                                         |
| Board-State-Abfragen                          | mindestens 1, oft erneut vor Referenzschritten | 1 im Renderer                                             |
| Low-Level-Whiteboard-Operationen im Companion | mehrere                                        | 0 sichtbar; 1 interner Batchauftrag                       |
| Designer-/Subagent-Turns                      | 0                                              | 0 im deterministischen Phase-1-Designer                   |
| Gesamtdauer / Zeit bis Gesprächsbereitschaft  | noch nicht live gemessen                       | noch nicht live gemessen                                  |
| Referenz-Fehlversuche                         | können zwischen Turns auftreten                | vor Mutation: missing/ambiguous als strukturierter Fehler |
| Renderer-Validierungsfehler                   | kein Planvertrag                               | explizit gezählt und zurückgegeben                        |

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

## 20. Phase-1-Abschlussstatus (2026-09-13)

Dieser Abschnitt ist der abschliessende Status. Die frueheren Vorbehalte im
Bericht stammen aus der Zeit vor der Browser-Abnahme.

| Bereich                       | Status                   | Nachweis                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generische DSH/PTS-Grenze     | **PASS WITH CONDITIONS** | `dsh-whiteboard` akzeptiert nur aufgeloeste `presentation`-Specs. Die Uebersetzung von PTS-Rollen zu Darstellungsrollen liegt einmalig im PTS-Renderer. Der Companion sieht `whiteboard_state` read-only und nutzt `pts_whiteboard_render` als einzige Schreib-/Semantik-Fassade; Low-Level-Mutationen bleiben verborgen. |
| A - Lernmoment-Arbeitsraum    | **PASS**                 | Frischer Browserlauf im Workspace `WB-Tests`: genau ein sichtbarer semantischer Toolcall; eigene Page `Phase 1 Browser A Abschluss`, Frame, Lernmoment-Anker, zwei Methodenideen, zwei Pfeile mit vier Bindings sowie Uebersichts- und Ruecknavigation. Page-Link wechselte im selben Tab.                                |
| B - Detach                    | **PASS**                 | Menschliche Ursprungskarte blieb erhalten; die Renderer-Projektion wurde mit `detach: [{ role, match }]` entfernt. Andere Karten blieben erhalten; keine Konsolenfehler.                                                                                                                                                  |
| C - Dokumentreferenz          | **PASS**                 | PDF-Karte sichtbar; `/pts-whiteboard-renderer/resource?path=...` lieferte `200 application/pdf` und 566 Bytes. `../../outside.txt` lieferte `400`; kein `file://`. Die neue URL ist nicht an eine abgelaufene Browser-Session gebunden.                                                                                   |
| D - Bild und Material         | **PASS**                 | `bild-1.png` erschien als echter tldraw-`image`-Shape mit PNG-Asset; `lied.pdf` nur als Referenzkarte. Nicht ausgewaehlte Dateien erschienen nicht; Dateinamen, Groessen und Zeitstempel des Materialpools blieben unveraendert.                                                                                          |
| Snapshot und Reload           | **PASS**                 | Board-Aenderung, Speichern und Browser-Reload stellten Page und Shapes wieder her; die Board-Ansicht oeffnete sich erneut.                                                                                                                                                                                                |
| Snapshot-Versionskonflikt     | **PASS**                 | Speichern auf Version 1; veraltetes Schreiben mit Version 0 wurde als `conflict: true` abgewiesen; Schreiben mit Version 1 ergab Version 2.                                                                                                                                                                               |
| Performance-Referenzfall      | **PASS WITH CONDITIONS** | 1 sichtbarer Companion-Toolcall, 1 Renderer-State-Abfrage, 1 interner Render-Batch, 0 Subagent-Turns; Laufkarte etwa 12 s. Exakte Millisekunden bis zum sichtbaren Shape wurden nicht separat instrumentiert. Keine Optimierung.                                                                                          |
| Kamera-Fokus neuer Inhalte    | **OUT OF SCOPE**         | Kein `zoomToFit()`/Kamera-Fokus; technische Schuld fuer einen eigenen dsh-tldraw-Spike.                                                                                                                                                                                                                                   |
| Animierte Agenten-Aenderungen | **OUT OF SCOPE**         | Kein Einfliegen, Erscheinen oder Pulsieren; Reduced-Motion und Accessibility gehoeren in denselben spaeteren generischen Spike.                                                                                                                                                                                           |
| WebSocket/Multiplayer-Sync    | **OUT OF SCOPE**         | Der versionierte Snapshot-Store ist kein Echtzeit-Sync.                                                                                                                                                                                                                                                                   |
| LearningMoment-Domainbindung  | **OUT OF SCOPE**         | Kein Domainobjekt, keine kanonische Domain-ID, kein `decisions.yml`-Write und keine bidirektionale Synchronisierung.                                                                                                                                                                                                      |

### Technische Pruefungen

Bestanden: `node --test --test-isolation=none tests/pts-whiteboard-renderer.test.mjs`
(14/14), alle drei PTS-`node --check`-Aufrufe, beide dsh-tldraw-Checks und
`git diff --check`.

Die Browserabnahmen liefen nach Neustart gegen DSH `0.1.5-rc.2`, Node
`v24.19.0`, tldraw `3.15.6` und Headless Chromium auf `127.0.0.1:3030`.
Der Workspace war `WB-Tests`. Das Board enthielt bereits Testartefakte aus
frueheren Laeufen; sie wurden nicht geloescht oder migriert.

**Runtime-Nachtrag 2026-09-13:** Der generische Client zielt jetzt auf
tldraw `5.4.2`. Die oben genannten Browserergebnisse bleiben der Nachweis für
`3.15.6`; nach diesem Versionssprung ist die Browser-E2E-Abnahme (einschließlich
Seiten-Löschung und Snapshot-Netzwerkverhalten) erneut auszuführen. Static-
Checks und der PTS-Renderer-Test laufen gegen den aktualisierten Quellstand.

### Endgueltige Host/PTS/Client-Grenze

1. **Host:** `dsh-tldraw/plugin/dsh-whiteboard` besitzt tldraw-Schema,
   Pages/Shapes/Bindings, Browser-Mounting, same-tab Page-Links und den
   versionierten workspacegebundenen Snapshot-Store. Es kennt keine
   PTS-Domainrollen.
2. **PTS:** `plugins/pts-whiteboard-renderer` validiert den semantischen
   Auftrag, loest Referenzen auf und uebersetzt jede PTS-Rolle genau einmal in
   eine generische `presentation`-Spezifikation. Es schreibt keine
   Domainartefakte.
3. **Client:** Der generische Client fuehrt den validierten Plan als einen
   deterministischen `editor.run`-Batch aus. Rich-Text-Links und Assets kommen
   nur aus den validierten Plan-Daten.
4. **Toolvertrag:** Der Companion liest `whiteboard_state` fuer die
   Zustandspruefung und ruft fuer Schreibaktionen ausschliesslich
   `pts_whiteboard_render` mit `operation`, `page`, `layout`, `elements` und
   optional `links`/`overview`/`detach` auf. Der Ablauf ist:
   `pts_whiteboard_render -> validierter PTS-RenderPlan -> generischer
   presentation-RenderPlan -> ein deterministischer Batch`.

Verbleibende technische Schulden sind Kamera-Sichtfuehrung, dezente und
zugangliche Agenten-Aenderungsanzeige sowie Millisekunden-Telemetrie. Alte,
persistierte Testkarten koennen historische Metadaten oder alte
sessiongebundene Links tragen; eine Datenmigration war nicht Teil von Phase 1.

Ausdruecklich auf Phase 2 verschoben sind Binding-/Provenienzschema,
Lehrkraftbestaetigung, kanonische LearningMoment-Identitaeten,
Domainpersistenz, Auswirkungspruefung beim Aendern/Loeschen,
Board-Domain-Projektionen und bidirektionale Synchronisierung.

## 21. Nachtrag: Command-Ack und selbsttaetige Nacharbeit (2026-09-13)

Der fruehere Befund hat gezeigt, dass ein Tool-Ergebnis wie "Auftrag in die
Queue gelegt" fuer die Lehrkraft irrefuehrend ist: Die fuenf angeforderten
Zettel waren in der betroffenen Session nicht im Snapshot angekommen. Der
Vertrag ist deshalb jetzt explizit:

- `accepted` bzw. `queued` bedeutet nur Transportannahme durch den Host;
- `commandId` bindet Auftrag, Event und Folge-Snapshot an dieselbe Session;
- `verified` entsteht erst bei passendem `commandResults[].commandId` mit
  `ok: true` und einem neuen Live-Snapshot;
- der Client puffert fruehe Events und fuehrt dieselbe ID nicht doppelt aus;
- bei fehlendem oder negativem Ack wird derselbe Auftrag genau einmal
  nachgeliefert; der Companion liest bei `pending`/`failed` den Zustand erneut,
  vergleicht die exakten Inhalte und fasst begrenzt nach;
- direkte Whiteboard-Schreib-Primitive bleiben verborgen. Sichtbares Lesen
  (`whiteboard_state`) und die semantische Schreibfassade
  (`pts_whiteboard_render`) sind getrennt.

Static-Nachweis nach dieser Aenderung: 16/16 PTS-Renderer-Tests, 16/16
PTS-Adapter-Tests, 3/3 dsh-tldraw-Hosttests, Syntaxpruefungen und
`git diff --check`. Live-Boot und Browser-E2E der neuen Ack-/Retry-Kette sind
noch offen, weil die aktive Instanz den Profil-Rewrite derzeit mit `EPERM`
abbricht; daher ist die Laufzeitverbesserung noch nicht als Browser-abgenommen
zu bezeichnen.

## 22. Phase 1b – Background Whiteboard Worker (2026-09-16)

### Motivation

Bei umfangreicher Board-Arbeit (mehrere Zettel ordnen, clustern, einen
Lernmoment-Arbeitsraum anlegen) war der Companion lange mit dem RenderPlan und
der Ack-/Verification-Kette beschäftigt und stand währenddessen nicht für das
Gespräch mit der Lehrkraft zur Verfügung. Phase 1b behebt ausschließlich dieses
Blockieren; die Phase-1-Renderkette bleibt unverändert.

### Ablauf

```text
Companion
  │ klärt die pädagogische Bedeutung, delegiert EINEN begrenzten Auftrag
  ▼
pts_whiteboard            (nativer DSH-Background-Subagent, one-shot)
  │ liest whiteboard_state, baut genau einen RenderPlan
  ▼
pts_whiteboard_render     (unveränderte semantische Fassade aus Phase 1)
  ▼
validierter PTS-RenderPlan → generischer presentation-RenderPlan
  ▼
whiteboard_render_plan → editor.run(...) → commandId → verified
```

Der Companion startet den Worker mit `run_in_background: true` und ist danach
sofort wieder für die Lehrkraft ansprechbar. Er wartet nicht auf Render/Ack.

### Warum kein eigener PTS-Hintergrund

DSH besitzt Subagents, `backgroundMode`, `enableRunInBackground`, Job-Lifecycle,
Settlement und Cancellation bereits. Phase 1b konfiguriert nur eine Rolle und
ihre Autoritätsgrenze auf einer `@deepseek-ai/dsh-tool-subagent`-Zeile — keine
eigene Queue, kein Scheduler, kein Dispatcher, kein PTS-Job-Store.

### Warum `one-shot`

Die Aufträge sind abgeschlossen („ordne diese acht Zettel in die drei
festgelegten Gruppen“, „lege einen Arbeitsraum an“). Wie `pts_edit` ist der
Worker `backgroundMode: one-shot`: DSH legt bei `run_in_background: true` einen
`ctx.jobs`-Job mit `owner: parent` an; der ausgelieferte Jobs-Reporter erzeugt
beim Abschluss ein Companion-Follow-up (das Settlement). Eine dauerhafte eigene
Whiteboard-Konversation (`continuable`) ist für Phase 1b nicht nötig.

### Autoritätsgrenze Companion ↔ Worker

Der Companion bleibt verantwortlich für pädagogische Bedeutung, fachliche
Auswahl, Zuordnung, die Entscheidung was zusammengehört und was ein Lernmoment
ist, und was erhalten oder verworfen wird. Der Worker setzt nur den bereits
geklärten Auftrag mechanisch um: Boardzustand lesen, Referenzen eindeutig
auflösen, vereinbarte Inhalte räumlich organisieren, vereinbarte Projektionen
anlegen, den semantischen Renderauftrag ausführen und das `verified`-Ergebnis
prüfen. Er ist kein zweiter Companion.

### Erlaubte Tools

`toolFilter.allow: [whiteboard_state, pts_whiteboard_render]` — sonst nichts.
Keine Denk-, Schreib-, Recherche- oder Skill-Tools, keine Low-Level-Whiteboard-
Primitiven (`whiteboard_render_plan`, `whiteboard_request_open`,
`createShape`/`createPage`/`updateShape`/`deleteShape` usw.) und keine weiteren
Worker. Die Fassade `pts_whiteboard_render` erreicht die internen Primitiven
weiterhin über die globale Tools-Registry (`ctx.get('tools')` beim Plugin-
`apply`), nicht über den restringierten Worker-Scope; die einzige sichtbare
Schreibfassade bleibt damit `pts_whiteboard_render`.

### Command-Ack, Idempotenz, Stale State

Der Phase-1-Vertrag gilt unverändert: `accepted`/`queued` ≠ `verified`. Der
Worker meldet einen Auftrag nur als erledigt, wenn `pts_whiteboard_render`
`status="verified"` liefert (passende `commandId` mit `ok: true` und neuer
Snapshot). Idempotenz, höchstens einmalige Nachlieferung mit derselben
`commandId` und der eine transiente Retry liegen weiterhin in der Fassade und
werden nicht dupliziert. Bei fehlender oder mehrdeutiger Referenz — auch wenn
sich das Board seit dem Auftrag so verändert hat, dass der Auftrag nicht mehr
eindeutig anwendbar ist — schreibt der Worker nicht über den neueren Zustand,
sondern meldet die Unklarheit fail-closed an den Parent zurück (der Designer
scheitert vor jeder Mutation mit `missing-reference`/`ambiguous-reference`).

### Settlement-Verhalten

one-shot + owned Job ⇒ der DSH-Jobs-Reporter benachrichtigt den Companion beim
Abschluss. Der Companion entscheidet dann, ob die Lehrkraft gefragt werden muss.
Es gibt keinen zusätzlichen PTS-Settlement-Pfad.

### Nachweis

- Statisch/Konfiguration: `tests/pts-whiteboard-worker.test.mjs` (Rolle ist
  one-shot Background-Subagent, `maxDepth: 1`, nur die zwei Fassaden-Tools,
  keine Primitiven/anderen Worker, Persona bindet die Grenze und den
  `verified`-Vertrag) und die erweiterten Zählungen in
  `tests/pts-companion-composition.test.mjs` (acht Subagent-Rollen, sechs
  continuable, zwei one-shot).
- Unverändert grün: `tests/pts-whiteboard-renderer.test.mjs` (Ack/Retry/
  Ambiguity), `tests/pts-whiteboard-adapter.test.mjs`, `tests/pts-context.test.mjs`,
  `tests/companion-tool-boundary.test.mjs`.
- DSH-Runtime gegen den installierten `dsh-tool-subagent`/`dsh-subagent`
  verifiziert: `run_in_background` als Tool-Input, one-shot ⇒ owned Job mit
  Reporter-Follow-up, `toolFilter` via `childCtx.tools.restrict`,
  Child-Header `origin: 'subagent'`.

### Live-Browser-E2E (2026-09-16) — Mechanik PASS, Renderpfad blockiert

Durchgeführt in der laufenden Instanz (Port 3030, Denkraum `DSH-Witeboard`,
Session mit acht Agenten-Zetteln). Companion-Modell `b.ai qwen3.8-flash`,
Worker-Route `openrouter deepseek/deepseek-v4.1-flash`. Auftrag an den
Companion: „Ordne die acht vorhandenen Zettel in drei thematische Gruppen und
lege für jede Gruppe einen eigenen Bereich an … lass sie im Hintergrund
erledigen und sprich mit mir weiter."

Bestätigt (Phase-1b-Mechanik):

- Der Companion erkennt umfangreiche Board-Arbeit und delegiert an
  `pts_whiteboard` als **nativen DSH-Background-Subagenten** (Denkweise wörtlich:
  „Extensive board work → delegate to pts_whiteboard in background, one bounded
  order, and keep talking."). Die Session-Leiste zeigt `1 subagent` /
  `1 background job`, im weiteren Verlauf `2 subagents` / `2 background jobs`.
- **Non-Blocking:** Der Companion gibt den Turn nach der Delegation frei (58 s
  statt der sonst 1–2 min für einen Inline-Render), beschreibt den Stand
  („läuft im Hintergrund"), bewahrt menschliche Inhalte ausdrücklich („Nichts
  umtextet, nichts gelöscht … deine Rechtecke, PRO/CONTRA und die Pfeile
  ebenfalls") und bleibt gesprächsbereit.
- **Settlement:** Der one-shot-owned-Job liefert dem Companion die Benachrichtigung
  `tool-jobs subagent … [status: completed]`; der Companion holt sich das
  Ergebnis über `job_output`.
- **Fail-closed / accepted ≠ verified:** Der Worker-Render wurde blockiert; der
  Companion behauptet **keinen** Erfolg („I need to honestly report: nothing
  changed"), verifiziert mit `whiteboard_state` und meldet der Lehrkraft ehrlich
  „es hat sich nichts bewegt, alle acht Zettel liegen noch wie vorher". Das Board
  bleibt unverändert (8 Zettel, keine Duplikate, keine verlorene Karte).

Blocker (neuer Befund, Grund für die Blockade):

`whiteboard_state` und `pts_whiteboard_render` sind **session-scoped**
(`exec.agent.id`) und an den **Browser-Tab der Root-Session** gebunden. Ein
Background-Subagent läuft in einer **Child-Session ohne eigenen lebendigen
Whiteboard-Tab**; `liveSnapshotOrRequestOpen` erhält dort dauerhaft
`live=false` (der Opener folgt der aktiven Root-Session, nicht der Child-ID),
und der Render endet fail-closed mit `whiteboard-not-live`. Beide
Hintergrund-Worker wurden deterministisch so blockiert. Direkte Renders des
Companion (Root-Session) funktionieren dagegen weiter (Phase-1-Kette
unverändert).

Konsequenz: Die Phase-1b-**Entkopplung** (Delegation, Background-Lauf,
Settlement, Non-Blocking, ehrliches Fail-closed) ist live nachgewiesen. Der
**Board-Render aus dem Hintergrund** ist damit aber noch nicht durchführbar,
weil der Render-Seam an die Live-Tab-Session gebunden ist. Das Schließen dieser
Lücke ist ein **generischer dsh-tldraw-Seam** (eine Background-/Child-Session
muss das workspace-/parent-gebundene Board erreichen können) und gehört nach
`docs/architecture/DSH_TLDRAW_INTEGRATION.md` in einen separaten
dsh-tldraw-Spike; ein PTS-seitiger Workaround (Spoofen der Session, direkter
Zugriff auf private Client-/Store-Bindung) ist ausdrücklich unzulässig.

Zweitbefund (Phase-1-Renderer, nicht Phase 1b): Die Render-Operationen
**kopieren** Karten (`materialize_selection`/`shape_copy_between_pages`) statt
sie zu verschieben; eine duplikatfreie Umordnung „acht Karten neu gruppieren"
ist damit nicht ausdrückbar. Der Companion hat das korrekt erkannt und keinen
nicht existierenden Board-Skill behauptet.

### Auflösung des Blockers — generischer dsh-tldraw-Seam (2026-09-16)

Der Blocker lag in der generischen Schicht und wurde dort behoben, nicht in PTS.
`whiteboard_state`/`whiteboard_render_plan` waren an den Live-Kanal der
aufrufenden Session gebunden; eine Child-Session ohne eigenen Tab bekam
`live=false`. `dsh-whiteboard` bekommt jetzt eine **board-gebundene
Zustellung**: hat der Aufrufer keinen eigenen Command-Kanal, stellt der Host den
Auftrag über eine verbundene Session **desselben** `boardId` zu (bevorzugt den
Parent) und spiegelt die `commandResults` board-gebunden, sodass das Child seine
`commandId` verifiziert. Die Auflösung ist strikt auf einen identischen
`boardId` begrenzt (nie ein fremdes Workspace-Board); ohne lebendigen Kanal
desselben Boards bleibt es fail-closed. Umsetzung:
`F:\code\dsh-tldraw\plugin\dsh-whiteboard\lib\session-routing.mjs` (reine
Auflösung) plus die Verdrahtung in `lib/index.js`; Vertrag in
`docs/WHITEBOARD-SPEC.md` („Board-gebundene Zustellung ohne eigenen Kanal").

Nachweis: Static — `plugin/dsh-whiteboard/test/session-routing.test.mjs` (vier
Fälle: Child rendert über den Parent-Kanal und verifiziert seine `commandId`;
ohne lebendigen Kanal fail-closed; eine Session auf einem **anderen** Board macht
das Child nie live und empfängt seinen Auftrag nie; reiner Routing-Vertrag), dazu
die unveränderten `open-handshake`/`render-layout`/`snapshot-store`/`arrow-schema`
und der PTS-Renderer-Test. Browser-E2E — der Background-`pts_whiteboard`-Worker
legte über den Parent-Kanal die neue Seite „Sortierte Gruppen" mit drei Karten
(Gruppe A/B/C) an, `verified`, und die Seite überlebt einen Reload; die acht
Zettel der anderen Seite blieben unverändert. Damit ist die Hintergrund-
Renderarbeit aus Phase 1b live durchführbar; der Zweitbefund (Kopieren statt
Verschieben) bleibt davon unberührt.
