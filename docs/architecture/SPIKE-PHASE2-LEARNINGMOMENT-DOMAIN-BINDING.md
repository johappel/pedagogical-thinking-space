# Spike Phase 2 — LearningMoment Domain Binding

> Status Phase 2a: **Domainkern + Bindings + Reaktionsmodell implementiert und
> durch `tests/pts-learning-moment-binding.test.mjs` (21/21) abgesichert.**
>
> Status Phase 2b: **PASS (2026-09-16).** Generischer echter Board-Move-Seam,
> Runtime-Wiring und die semantische Companion-Fassade `pts_learning_moment` sind
> implementiert und getestet (dsh-tldraw `move-shape.test.mjs` 6/6; PTS
> `pts-learning-moment-wiring.test.mjs` 11/11; keine Regression in Phase 1/1b/2a).
> Der **Browser-E2E-Pfad ist live abgenommen**: `bind`, `move`, `create_projection`
> (zweite Darstellung), `confirm` (inkl. Negativnachweis + bestätigter Folge),
> `clarify`, `detach` (eine von zwei **und** die letzte → `orphanedDomain`),
> `automatic` (Relabel → Re-Sync ohne Rückfrage) und Reload/Persistenz gegen die
> laufende `pts-companion`-Session im Denkraum `DSH-Witeboard` (siehe Abschnitt
> „Bekannte Grenzen" für die Belege und die zwei gefundenen echten Grenzen).

## Problem

Nach Phase 1/1b kann das Whiteboard einen Lernmoment zuverlässig *darstellen*,
aber eine Karte mit der Rolle `learning_moment` ist nur eine
Darstellungsrolle. Das Board weiß nicht, dass zwei Karten denselben
kanonischen pädagogischen Gegenstand meinen. Phase 2 schließt diese Lücke:

> Nicht die Karte ist der Lernmoment. Die Karte zeigt auf den Lernmoment.

## Ist-Analyse — es gibt bereits ein kanonisches Modell

Ein kanonisches LearningMoment-Modell **existiert schon** und wurde **erweitert,
nicht ersetzt** (Vorgabe: keine zweite Domain):

- Das Domainobjekt ist der Landscape-Lernmoment (`### lm-…` in
  `learning-landscape.md`, Schema in [specs/LEARNING_LANDSCAPE_SCHEMA.md](../../specs/LEARNING_LANDSCAPE_SCHEMA.md)):
  stabile `id`, `title`, `type`, `function`, `status` (`draft`/`stable`/`needs_review`),
  optionale `Herkunft`-Zeile. Schreibpfad: `updateMoment`/`parseLandscape` in
  [dsh-presets/pts-companion/workspace-parsers.mjs](../../dsh-presets/pts-companion/workspace-parsers.mjs).
- Eine Abhängigkeits-Vorschau **existiert schon**: `buildMomentImpact` in
  [dsh-presets/pts-companion/moment-impact.mjs](../../dsh-presets/pts-companion/moment-impact.mjs)
  liefert `changedFields`, `usages`, `requiresReview`, `redThreadCheck`.
- Whiteboard-Shapes tragen bisher nur technische Anker (`meta.actor`,
  `meta.semanticRole`, `meta.renderKey`, `sourceId`, `workspacePageId`) —
  **keine `domainId`, kein Binding, keine Version**.

Entscheidung dokumentiert: Das Domainobjekt bleibt der Landscape-Moment; Phase 2
ergänzt nur das, was dort fehlt — kanonische Version, strukturierte Provenienz
(Lehrkraftbestätigung) und Projection-Bindings — in einem maschinell besessenen
Ledger-Sidecar `learning-moment-bindings.json`. So bleibt der fragile
Landscape-Markdown-Parser unangetastet und der Round-Trip verlustfrei.

## Domainmodell

```text
                 LearningMoment  (Landscape-Moment lm-danke)
                 kanonisches Domainobjekt · Version · Provenienz
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
        Projection A  Projection B   spätere Sicht C
        wb P-101      wb P-102
```

- **Kanonischer Speicherort:** Inhalt/Identität im `learning-landscape.md`
  (Domainobjekt), Version + Provenienz + Bindings im Sidecar
  `learning-moment-bindings.json` (Denkraum-Wurzel).
- **ID-Strategie:** `domainId` = bestehende Landscape-Moment-ID (`lm-…`). Stabil,
  nicht shape-/session-/page-abhängig; eine Titeländerung ändert die Identität
  nicht. Validierung `isDomainId` (`plugins/pts-learning-moment-binding/lib/domain.mjs`).
- **Versionierung:** `version` startet bei 1 beim Capture, steigt bei jeder über
  den Domain-Write-Seam erfassten Inhaltsänderung. Kein Event-Sourcing; die
  Version dient Nachvollziehbarkeit, Stale-Erkennung und Race-Schutz.
- **Provenienz:** `{ createdFrom?: { type, sourceId? }, confirmedBy: 'teacher',
  confirmedAt }`. `actor: agent` des Renderers ist **keine** pädagogische
  Provenienz — erst die Lehrkraftbestätigung macht den kanonischen Moment.

## Projection-Modell

```text
type Projection = { projectionId, projectionType, page, boundVersion }
```

`domainId` und `projectionId` sind bewusst getrennte Identitätssysteme:

```text
domainId      = lm-danke      (der pädagogische Gegenstand)
projectionId  = P-101         (eine Board-Darstellung)
projectionId  = P-102         (eine weitere Board-Darstellung)
```

Weiterverwendete Phase-1-Metadaten: die technischen Anker (`renderKey`,
`sourceId`, `workspacePageId`) bleiben Board-seitig die Herkunft einer
Darstellung; die **kanonische** Bindung `projectionId → domainId` liegt neu im
Ledger. Es entsteht **kein** zweites konkurrierendes Identitätssystem.

## Capture Gate

Ein Domainobjekt entsteht **ausschließlich** durch `captureLearningMoment(...)`
mit einem Lehrkraft-Bestätigungszeitpunkt — **nie** dadurch, dass eine Karte die
Rolle `learning_moment` trägt. Das Gate ist fail-closed (`confirmation-required`,
`invalid-domain-id`) und idempotent (ein zweiter Capture erzeugt kein Duplikat).

```text
vorher:  Whiteboard-Idee / Lernmoment-Entwurf (nur Darstellung)
Aktion:  Lehrkraft: „Als Lernmoment festhalten"
nach:    kanonischer LearningMoment lm-danke (v1, Provenienz), Karte gebunden
```

## Autoritätsgrenzen

| Ebene | Autoritativ für |
| --- | --- |
| Domain Store (Landscape + Ledger) | `domainId`, kanonischer Titel/Inhalt, Status, Version, Provenienz, Bestätigung |
| Whiteboard | Position, Größe, Page, visuelle Darstellung, lokale Anordnung |
| Companion | pädagogische Bedeutung klären, Folgen erläutern, confirm/clarify begleiten |
| Lehrkraft | Moment bestätigen, relevante Änderung bestätigen, unklare Folgen entscheiden, Domain bewusst löschen |
| Whiteboard-Worker (`pts_whiteboard`) | mechanische Darstellungsarbeit auf gebundenen Projection-IDs; **keine** Domainentscheidung |

Board ↔ Domain synchronisieren **nicht** automatisch bidirektional.

## Reaktionsmodell

```text
Domain Change
     │
     ▼
Impact Classification   (klein, erklärbar — keine Impact-KI)
     │
 ┌───┼──────────┐
 ▼   ▼          ▼
AUTO CONFIRM   CLARIFY
 │     │          │
 ▼     ▼          ▼
sync  approval   conversation
```

Regeln (`plugins/pts-learning-moment-binding/lib/reactions.mjs`):

| Reaktion | Trigger | Verhalten | Getestetes Beispiel |
| --- | --- | --- | --- |
| `automatic` | `intent: relabel` **oder** nur Nicht-Rotfaden-Felder geändert | Projektionen re-syncen, keine Rückfrage | `title`+`relabel`; `materials` |
| `confirm` | begrenzte semantische Änderung (ein Rotfaden-Feld) mit bekannter Abhängigkeit | Impact Proposal, erst nach Lehrkraftbestätigung Folgeänderung | `learning_activity` + Stunde-2-Nutzung |
| `clarify` | Kernänderung mit mehreren möglichen Folgen (`type`-Änderung, ≥2 Rotfaden-Felder oder `scope: redesign`) | keine automatische Folgemutation; Companion macht die Folge zum Gesprächsgegenstand | `title+function+learning_activity`; `scope: redesign`; `type` |

Rotfaden-Felder (`title`, `function`, `learning_activity`, `expected_experience`,
`open_questions`) spiegeln `moment-impact.mjs`. `automatic` schreibt **niemals**
beliebige pädagogische Texte irgendwo um — es re-synct nur die Projektionen.

## Move vs Copy

Explizit unterschieden, **nicht** per Textvergleich:

- `moveProjection` behält die `projectionId`, ändert nur die Page — es entsteht
  **keine** zweite Projektion (der bekannte Phase-1-Kopier-Fallstrick).
- `addProjection` gibt demselben LearningMoment eine **zusätzliche** Darstellung
  mit **neuer** `projectionId`.

## Delete-Semantik

- `detachProjection` entfernt eine Darstellung; das Domainobjekt bleibt — auch
  beim Entfernen der **letzten** Projektion (`orphanedDomain: true`, Moment
  bleibt kanonisch).
- Eine Domainlöschung ist ein eigener, expliziter Vorgang
  (`deleteLearningMoment`) und **nie** Folge einer Boardaktion.

## Race / Stale State

`bumpVersion({ expectedVersion })` schlägt bei veralteter erwarteter Version
fail-closed fehl (`code: 'stale'`) und überschreibt nichts. Eine Projektion mit
kleinerem `boundVersion` gilt als stale (`isStaleProjection`) und wird nur über
den Domain-Seam (`syncProjections`) neu ausgerichtet — nie still vom Worker.

## Domain-Write-Seam

`plugins/pts-learning-moment-binding/lib/index.js` registriert die einzige
Mutationsroute (`POST /api/pts-learning-moment/{capture|bind|move|detach|update|delete}`)
und eine read-only Debug-Sicht (`GET /api/pts-learning-moment`). Der Renderer
(`pts_whiteboard_render`) bleibt reine Whiteboard-/Projection-Fassade und wird
**nicht** zum LearningMoment-Repository umgebaut (durch Test abgesichert:
„the renderer creates no domain objects and never writes the ledger").

## Tests

`tests/pts-learning-moment-binding.test.mjs` (21/21):

- **Domain:** ID stabil; Titeländerung ändert ID nicht; Version steigt;
  Provenienz erhalten; unbestätigte Karte erzeugt kein Domainobjekt; bestätigter
  Capture erzeugt genau eins; zweiter Capture idempotent; explizite Löschung.
- **Binding:** eine/mehrere Projektionen; eindeutige Domain-ID; eindeutige
  Projection-IDs; Duplikat fail-closed; unbekannte Domain fail-closed; Detach
  löscht Domain nicht (auch letzte).
- **Reactions:** `automatic`, `confirm`, `clarify` mit Beispielen.
- **Move/Copy:** Move erhält Projection-ID; zusätzliche Darstellung erzeugt neue.
- **Safety:** stale Version überschreibt nichts; stale Projection erkannt;
  Renderer erzeugt keine Domainobjekte.
- **Persistenz:** Ledger-Round-Trip verlustfrei; leeres/fehlendes Ledger = leer;
  falsches Schema fail-closed.

## Architektur

```text
                 PTS DOMAIN
              LearningMoment lm-danke
                    (Version)
                    │
          Binding / Impact Layer
             │             │
             ▼             ▼
        Projection A   Projection B
             │             │
             └──────┬──────┘
                    ▼
                Whiteboard
```

## Phase 2b — Runtime Wiring & Projection Move

Phase 2b integriert den Vertrag in die laufende Runtime und ergänzt den echten
Board-Move.

```text
Domain Store (Landscape + Ledger)
        ↓
Binding Layer (bindings.mjs)
        ↓
Projection Operation (pts_learning_moment)
        ↓
PTS Whiteboard Fassade
        ↓
generischer dsh-whiteboard: whiteboard_move_shape (move) · render_plan (create)
```

### Generischer echter Move (dsh-tldraw)

`dsh-whiteboard` erhielt einen generischen, PTS-freien Move-Seam:

- Client `execCommand`-Op `move-shape` → `moveExistingShape(editor, cmd)`:
  verschiebt **eine** bestehende Shape per `editor.moveShapesToPage([id], page)`
  und/oder Position; die **Shape-Identität bleibt erhalten** (gleiche id, meta,
  props, Bindings). Es wird **nie** kopiert. Ziel-Page per `targetPageId` oder
  `targetPageTitle` (bestehende Seite); fehlende Page/Shape fail-closed.
- Host-Tool `whiteboard_move_shape` reiht den Befehl über **denselben**
  Queue-/Command-Ack-/board-bound-Delivery-Pfad ein wie `whiteboard_render_plan`
  (keine zweite Command-Struktur).
- Tests: `plugin/dsh-whiteboard/test/move-shape.test.mjs` (6/6), inkl.
  Identitätserhalt, Move-≠-Copy, Cross-Page-Aktivierung, Fail-closed und
  PTS-Freiheit des Seams.

### Companion-Fassade (PTS)

`pts_learning_moment` ist die einzige modellseitige Fassade. Operationen:

| operation | Wirkung |
| --- | --- |
| `bind` | bestehende Karte (`ref`) an bestehenden Lernmoment binden; captured idempotent, neue `projectionId` + `shapeId` |
| `create_projection` | zusätzliche bestehende Darstellung an denselben Lernmoment (neue `projectionId`) |
| `move_projection` | echte Verschiebung: ruft `whiteboard_move_shape`, schreibt die Page **erst nach `verified`** |
| `detach_projection` | Bindung lösen; Lernmoment bleibt (auch bei der letzten) |
| `update` | kanonische Änderung: `version++` und Reaktion `automatic`/`confirm`/`clarify` |
| `impact` | reine Vorschau ohne Mutation |

Das Projection-Binding trägt jetzt den generischen Board-Handle `shapeId`
(opak für die Domain), damit Move/Detach die reale Shape ansprechen. Der
`whiteboard_move_shape`-Seam ist für den Companion **verborgen**
(`HIDDEN_FROM_COMPANION`); der Companion bewegt eine *Projektion*, keine Shape.
Prompt-Guidance (`DOMAIN_GUIDANCE`) ist scoped auf `pts-companion` und
teacher-facing formuliert (automatic ohne Rückfrage; confirm erst nach
Zustimmung; clarify als Gespräch).

Profilzeile: `- id: pts-learning-moment-binding` (inject `webServer, sessions,
agents`) neben `pts-whiteboard-renderer`.

Tests: `tests/pts-learning-moment-wiring.test.mjs` (11/11): Profilzeile,
Tool-Boundary, Fassaden-Registrierung, Bind (inkl. ambiguous/missing
fail-closed), echter Move über den Seam mit Verified-Gate, „failed schreibt
keine Page", unknown/kein-Board-Handle fail-closed, Detach behält Lernmoment,
`shapeId`-Round-Trip.

### Autoritätsgrenze bewahrt

`pts_whiteboard` (Background-Worker) bleibt reiner Darstellungsworker; er
entscheidet nicht über Domain, confirm/clarify oder Löschung. `dsh-whiteboard`
kennt weiterhin **keine** PTS-Domainbegriffe (durch Test abgesichert).

## Bekannte Grenzen (nur tatsächlich gefunden — nicht Phase 3)

- **Browser-E2E: LIVE PASS (2026-09-16).** In einer echten `pts-companion`-Session
  (Denkraum `DSH-Witeboard`, Board live, Fixture-Lernmoment `lm-anerkennung` in
  `learning-landscape.md`) hat der Companion selbst:
  1. mit `pts_whiteboard_render` eine Lernmoment-Karte auf einer neuen Seite
     „E2E Bind" erzeugt (verified);
  2. mit `pts_learning_moment` (bind) die Karte an den **bereits vorhandenen**
     `lm-anerkennung` gebunden — Ledger geschrieben
     (`learning-moment-bindings.json`: Projektion `wb-lm-anerkennung-1`,
     `shapeId shape:KaPTsX6…`, `page "E2E Bind"`, `confirmedBy: teacher`), **kein**
     neuer Lernmoment, `learning-landscape.md` unverändert;
  3. mit `pts_learning_moment` (move_projection, `toPage="Sortierte Gruppen"`) die
     Darstellung **wirklich verschoben** — der Ledger wechselte die Page erst
     **nach `verified`** von „E2E Bind" auf „Sortierte Gruppen", bei **gleicher**
     `projectionId` und **gleicher** `shapeId`. Companion wörtlich: „Die Karte ist
     gewandert, nicht kopiert … auf ‚E2E Bind' steht damit kein Lernmoment mehr."
  Teacher-facing Sprache ohne `domainId`/`projectionId`-Jargon; die
  confirm/clarify-Abhängigkeit wurde vom Companion benannt.

- **Reaktionen + Detach: LIVE PASS (2026-09-16).** In derselben `DSH-Witeboard`-Session
  (CDP an die bereits authentifizierte Seite angehängt, kein neuer Browser, keine
  Auth-Injektion) hat der Companion selbst:
  1. `confirm` — auf eine begrenzte semantische Änderung eines Rotfaden-Feldes
     („Lernaktivität") ordnete er als **Rückfrage-pflichtig** ein und **mutierte
     nichts** (Ledger byte-identisch zur Baseline = zugleich der Negativnachweis:
     confirm erkannt, keine Zustimmung, keine Folgemutation). Nach **ausdrücklicher**
     Lehrkraftzustimmung führte er **nur** die begrenzte Folge aus: `learning-landscape.md`
     eine Zeile geändert (v→2), Typ/Funktion/erwartete Lernerfahrung/Status/Übergänge
     unberührt; die gebundene Projektion blieb bewusst `stale` (`boundVersion 1 < 2`,
     **kein** stiller Auto-Sync bei confirm); Board-Shape unverändert.
  2. `clarify` — auf einen Charakter-Umbau (Typ + erwartete Lernerfahrung, mehrere
     Rotfaden-Felder) klassifizierte er als **clarify**, mutierte **nichts** (Ledger
     v2 und `learning-landscape.md` identisch), **startete keinen Worker** und machte
     die Identitätsfrage zum Gesprächsgegenstand; er kontrastierte clarify ausdrücklich
     mit dem vorherigen confirm.
  3. `create_projection` — eine **zweite** Darstellung desselben Lernmoments auf einer
     eigenen Seite „Arbeitsraum" (neue `projectionId`, kein neuer Lernmoment, die erste
     Darstellung unverändert und **nicht** kopiert).
  4. `detach` C1 — genau **eine** von zwei Projektionen gelöst; die andere und der
     Lernmoment blieben; der Companion benannte die Grenze `Binding gelöst ≠ Karte
     gelöscht`.
  5. `detach` der **letzten** Projektion — `projections: []`, der Lernmoment **erhalten**
     (v2, keine Domainlöschung, `learning-landscape.md` unberührt).
  6. **Reload/Persistenz** — nach `location.reload()` blieb der Ledger stabil
     (Lernmoment erhalten, `projections: []`).
  7. `automatic` — eine kanonische **Umbenennung** (Titel) lief **ohne Rückfrage**
     durch: v→3, `domainId` stabil, nur die Titelzeile geändert, und die gebundene
     Projektion wurde **automatisch re-synct** (`boundVersion 2 → 3`).

- **Automatic-Board-Propagation stößt auf die Phase-1-Render-Grenze (gefunden 2026-09-16).**
  Der **Domänenvertrag** von `automatic` (Version-Bump ohne Rückfrage, Projektions-Sync,
  stabile Identität) hält live. Der **Board-Nachzug** einer Umbenennung ist damit aber
  noch nicht in-place möglich: der vorhandene Render-Weg **baut die Seite neu auf** statt
  eine einzelne Karte umzubenennen, wodurch die Shape-Identität wechselt und die Bindung
  auf dem Board reißt (dieselbe Phase-1-Grenze wie „Render-Ops kopieren statt verschieben"
  und der fehlende `delete-shape`-Seam). Das ist **nicht** Teil von Phase 2b; ein
  generischer in-place-Relabel-/`delete-shape`-Seam in `dsh-whiteboard` ist der spätere
  Schritt. Der Companion legt die Grenze ehrlich offen und rät nicht.

  **Denkraum-Root-Auflösung vereinheitlicht (Arbeitspaket B, erledigt).** Der zuvor nur
  in der Fassade lokale `resolveDenkraumRoot()` ist jetzt der **gemeinsame**, exportierte
  Helfer in [teaching-product.mjs](../../dsh-presets/pts-companion/teaching-product.mjs):
  erst die strenge `workspaceRoot()`-Schranke (`…/workspace/<name>` + `AGENTS.md`, für den
  strukturellen Vertrag **unverändert** streng), sonst der reale Session-`cwd`, **aber
  fail-closed** validiert über einen bestehenden PTS-Marker (`learning-landscape.md` /
  `learning-design.md`) — ein beliebiger Fremdordner, ein fehlendes oder relatives `cwd`
  ergeben `null` und werden **nie** aufgelöst. `readProduct()` nutzt jetzt dieselbe
  Auflösung (reine Pfadauflösung; Produkt-Validierung unverändert), womit alle Aufrufer
  (`pts-landscape`, `pts-moment-workshop`, `pts-denkstand`, das Binding-Plugin) auf realen
  Denkräumen funktionieren. Befund zur Vermutung: `pts-moment-workshop` rief `workspaceRoot()`
  **direkt** auf (behoben → `resolveDenkraumRoot()` + `null`→404); `pts-landscape` ruft
  `workspaceRoot()` **nicht** direkt — seine strenge Schranke kam **ausschließlich** über
  `readProduct()` (zentral behoben). Tests:
  [tests/pts-denkraum-root.test.mjs](../../tests/pts-denkraum-root.test.mjs) (strenges
  Layout / roher Denkraum / Fremdordner + kein-cwd fail-closed / `readProduct` tolerant +
  fail-closed) und
  [tests/pts-learning-moment-reaction-facade.test.mjs](../../tests/pts-learning-moment-reaction-facade.test.mjs)
  (confirm/clarify/automatic-Fassade + Zwei-Projektions-Detach), keine Regression.
  `landscape-moment-required` bleibt unverändert fail-closed.
- **Capture-from-raw-card** bleibt bewusst offen: `bind` verlangt einen bereits
  existierenden Landscape-Moment (`landscape-moment-required`). Das Erzeugen
  eines neuen kanonischen Landscape-Moments aus einer rohen Whiteboard-Karte
  bleibt ein eigener Folge-Spike, da dafür der Markdown-Writer des
  Learning-Landscape-Modells sicher erweitert werden muss. Nicht versehentlich
  im Wiring mitimplementiert.
- **Detach entfernt die Bindung, nicht die Shape:** Die sichtbare Karte bleibt
  auf dem Board, bis ein generischer `delete-shape`-Seam existiert. Für Phase 2b
  genügt das Lösen der Bindung; das visuelle Entfernen ist ein späterer
  generischer dsh-whiteboard-Schritt.

## Architekturfolge nach Phase 2b (nicht Teil von 2b)

> Diskussionsstand 2026-09-16, dokumentiert als eigener Architektur-/Migrationspunkt.
> **Nicht** in Phase 2b umzusetzen und **kein** Grund, das Fail-closed-Verhalten
> aufzuweichen.

Das Domain-Binding macht eine ältere Gleichsetzung sichtbar:

```text
learning-landscape.md
        │
        ├─ LearningMoments        ← weiterhin die kanonischen Domainobjekte
        └─ Landschaft/Topologie   ← nur eine mögliche Sicht/Organisation
```

Der aktuelle kanonische PTS-Vertrag definiert LearningMoments **weiterhin** in
`learning-landscape.md`; deshalb setzt das Binding-Plugin diese Datei bewusst
voraus (`landscapeMoment()` liest fest `learning-landscape.md`; `capture`/`update`
liefern fail-closed `landscape-moment-required`). Das ist korrekt und bleibt so.

Sichtbar wird aber: Ein Domain-Binding **für Lernmomente** setzt technisch eine
Datei namens `learning-landscape.md` voraus, obwohl wir Lernmomente heute eher
als eigenständige Denkraum-Domain denken und die Lernlandschaft nur als eine
Sicht darauf:

```text
Denkraum-Domain
   └─ LearningMoments
        ├─ LM-17
        └─ LM-18
            │
    ┌───────┼─────────┐
    ▼       ▼         ▼
 Whiteboard Werkstatt Lernlandschaft
 Projection  View       View
```

**Folgepunkt (vor einer möglichen Phase 2c):** prüfen, ob LearningMoments aus
`learning-landscape.md` als eigenständige Denkraum-Domain herausgelöst werden und
die Lernlandschaft zu einer Projektion/Sicht wird. Bis dahin bleibt
`learning-landscape.md` der kanonische Speicher, und Phase 2b bindet nur
**vorhandene** Lernmomente — kein impliziter Lernmoment aus einer Board-Karte,
kein Auto-Anlegen der Datei, kein Fallback auf das Binding-Ledger.

### Analysebericht: LearningMoment als eigenständige Denkraum-Domain?

> Reine Analyse (Arbeitspaket D). **Keine** Migration, **keine** neue Datei
> festgelegt, **keine** Aufweichung des Fail-closed-Verhaltens. Die Punkte A–G
> bewerten den heutigen Stand und benennen eine Richtung, entscheiden sie aber
> nicht.

**A. Identität — wo sollte ein LearningMoment kanonisch leben?**
Heute ist die Identität die Landscape-Moment-ID (`lm-…`) in `learning-landscape.md`;
Version + Provenienz + Bindings liegen im Sidecar `learning-moment-bindings.json`.
Der Inhalt (Titel, Typ, Funktion, Aktivität, Erwartung, Fragen) wird also getrennt
von Version/Provenienz gehalten — das Binding-Plugin muss beides zusammenführen
(`landscapeMoment()` + Ledger). Drei geprüfte Optionen:
- *Status quo* (`learning-landscape.md` + Sidecar): minimal invasiv, verlustfreier
  Round-Trip, fragiler Markdown-Parser bleibt unangetastet. Nachteil: Identität und
  kanonische Metadaten (Version/Provenienz) leben in **zwei** Dateien.
- *Eigene `learning-moments.*`-Domain* (z. B. eine strukturierte Datei mit Inhalt
  **und** Version/Provenienz/Bindings): ein Ort für den ganzen kanonischen Moment;
  die Lernlandschaft würde diese Domain nur noch referenzieren. Nachteil: der
  Markdown-Writer des Learning-Landscape-Modells und alle Leser (Companion-Kontext,
  Snapshot, Werkstatt, Landscape-Client) müssten auf die neue Quelle umgestellt
  werden — echte Migration mit Risiko.
- *Ein bestehender kanonischer Store* (`teaching-product.json`): ungeeignet, weil das
  Produkt bewusst die **Unterrichtsrealisierung** ist, nicht der Denkraum-Gegenstand.
Bewertung: Die zweite Option passt am besten zum heutigen Denkmodell, ist aber die
teuerste. Solange nur **eine** Sicht (Lernlandschaft) und **eine** Projektion (Board)
existieren, trägt der Status quo. Sobald eine **zweite** vollwertige Sicht (Werkstatt)
denselben Moment kanonisch mitschreiben will, wird die Zwei-Dateien-Teilung zur echten
Reibung — das ist der Auslöser, der die Herauslösung rechtfertigt, nicht vorher.

**B. Rolle der Lernlandschaft — Domain oder View?**
Faktisch ist `learning-landscape.md` heute **beides**: kanonischer Moment-Store **und**
Topologie/Übergänge. Der Moment-Anteil ist Domain; der Landschafts-/Topologie-Anteil
(Struktur, Übergänge, Layout in `learning-landscape.layout.json`) ist bereits eine
**Sicht/Organisation**. Richtung: die Momente als Domain herauslösen, die Lernlandschaft
als **eine** Projektion (didaktische Topologie) daneben stellen — konsistent mit dem
Board (Projektion) und der Werkstatt (Projektion).

**C. Beziehungen — wo leben die Kanten?**
- `Moment → Moment` (Übergänge): heute in `learning-landscape.md` („## Übergänge"). Gehört
  zur **Topologie-Sicht**, nicht zwingend in die Moment-Domain.
- `Moment → Phase`: heute über `teaching-product.json` (`phase.momentIds`, plus
  `sourceHashes` für Stale-Erkennung). Bleibt beim Produkt — ein Moment wird von Phasen
  **referenziert**, nicht besessen.
- `Moment → Material`: heute als `- Materialien: [...]` im Moment-Block der Landscape.
  Gehört zum Moment-Inhalt und würde mit ihm in eine Moment-Domain wandern.
- `Moment → Whiteboard-Projektion`: heute im Sidecar-Ledger (`projectionId`, `shapeId`,
  `page`, `boundVersion`). Das ist bereits sauber getrennt und projektionsspezifisch —
  es sollte **nicht** in die Moment-Domain gezogen werden (siehe E).

**D. Produktbezug — `teaching-product.json` vs. LearningMoments.**
Der bestehende Vertrag bleibt gültig und ist bereits korrekt: das Produkt ist das
kanonische **Unterrichtsprodukt**; ein Moment kann von mehreren Phasen referenziert
werden; eine Momentänderung schreibt **keine** akzeptierte Phase automatisch um
(`sourceHashes`/Stale-Erkennung machen die Abweichung sichtbar, statt sie still zu
propagieren). Eine Moment-Domain ändert daran nichts — sie liefert dem Produkt nur eine
**stabilere, versionierte** Referenz (`domainId` + `version`) als heute der reine
Markdown-Anker.

**E. Binding-Ledger — bleibt `learning-moment-bindings.json` sinnvoll?**
Ja. Das Ledger ist der **projektions-** und **provenienzspezifische** Teil (welche
Board-Darstellungen zeigen auf den Moment, in welcher Version, wer hat wann bestätigt).
Es ist maschinell besessen und projektionsnah — es sollte **projektionsseitig** bleiben,
auch wenn die Moment-**Inhalts**-Domain herausgelöst wird. In einem künftigen Domain-Store
würde die Trennung eher schärfer: `learning-moments.*` = kanonischer Inhalt + Identität;
`…-bindings.json` = Projektionen + Version/Provenienz-Sidecar. Kein Zusammenlegen erzwingen.

**F. Provenienz und Version — wo gehören `confirmedBy`/`confirmedAt`/`version` hin?**
Heute im Ledger. Sie sind **Eigenschaften des kanonischen Moments**, nicht einer einzelnen
Projektion — konzeptionell gehören sie zur Moment-Domain. Der Grund, dass sie heute im
Sidecar liegen, ist rein pragmatisch (der Markdown-Parser soll unangetastet bleiben). Bei
einer Herauslösung würden `version`/`provenance` in den Moment-Domain-Store wandern; das
Ledger behielte nur `boundVersion` je Projektion (die Referenz auf die Moment-Version).
Bis dahin ist die heutige Lage vertretbar, aber sie ist der klarste **konzeptionelle**
Hinweis, dass der Moment schon jetzt mehr ist als seine Markdown-Zeilen.

**G. Capture — Erzeugung neuer kanonischer Momente.**
Heute setzt `capture`/`bind` einen **bereits vorhandenen** Landscape-Moment voraus
(`landscape-moment-required`, fail-closed); das Anlegen aus einer rohen Karte ist bewusst
offen (eigener Spike, weil der Landscape-Markdown-Writer sicher erweitert werden muss).
Eine Moment-Domain mit strukturiertem Store würde genau **dieses** Capture entschärfen:
ein Moment ließe sich sicher und schema-validiert anlegen, ohne den fragilen Markdown-Writer
zu belasten. Das ist ein starkes Argument für die Herauslösung — aber es bleibt der
**Folge-Spike**, nicht Phase 2b, und **Arbeitspaket E (Raw-Card → neuer Moment) wird hier
ausdrücklich nicht implementiert**.

**Empfehlung (nicht entschieden):** Die Momente sind heute de facto schon eine Domain, die
sich zufällig eine Datei mit der Topologie-Sicht teilt. Eine Herauslösung in eine eigene
`learning-moments.*`-Domain (Inhalt + Version + Provenienz), mit Lernlandschaft/Board/Werkstatt
als Projektionen und dem Binding-Ledger als projektionsseitigem Sidecar, ist die kohärente
Richtung. Der wirtschaftliche Auslöser ist eine **zweite** vollwertige Sicht, die denselben
Moment kanonisch mitschreiben will (Werkstatt), oder das gewünschte **Raw-Card-Capture** —
erst dann rechtfertigt der Migrationsaufwand am Markdown-Writer den Schnitt. Bis dahin bleibt
`learning-landscape.md` der kanonische Speicher (Fail-closed unverändert).

## Phase-1-Verträge geschützt

`dsh-whiteboard` kennt weiterhin **keine** PTS-Domainbegriffe
(`LearningMoment`, `confirm`, `clarify`). Diese Semantik lebt vollständig in
PTS. Die Phase-1-Verträge (`pts_whiteboard_render`, `pts_whiteboard`,
board-bound delivery, Command-Ack/verified, Snapshot-Persistenz) bleiben
unverändert.
