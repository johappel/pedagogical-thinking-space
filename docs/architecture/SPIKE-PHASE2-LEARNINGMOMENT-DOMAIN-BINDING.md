# Spike Phase 2 — LearningMoment Domain Binding

> Status: **Domainkern + Bindings + Reaktionsmodell implementiert und durch
> `tests/pts-learning-moment-binding.test.mjs` (21/21) abgesichert.** Die
> Board-seitige echte Move-Operation, das Companion-/Route-Wiring und der
> Browser-E2E-Pfad sind ausdrücklich noch offen (siehe „Bekannte Grenzen").

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

## Bekannte Grenzen (nur tatsächlich gefunden — nicht Phase 3)

- **Capture-from-raw-card** legt derzeit keinen Landscape-Moment automatisch an:
  `capture` verlangt einen bereits existierenden Landscape-Moment
  (`landscape-moment-required`). Das automatische Anlegen eines neuen
  Moment-Blocks aus einer Kartenbeschriftung berührt den fragilen
  Markdown-Writer und ist bewusst offen gelassen.
- **Echte Board-Move-Operation:** Der Ledger unterscheidet Move/Copy sauber; der
  Phase-1-Renderer kann eine reine Verschiebung Board-seitig noch nicht
  ausdrücken (Render-Ops kopieren). Der minimale Projection-Move-Seam im
  `dsh-whiteboard`-Client ist noch nicht ergänzt.
- **Wiring:** Profilzeile neben `pts-whiteboard-renderer`, Companion-Prompt und
  teacher-facing Aktion (`Als Lernmoment festhalten`) sind noch nicht komponiert.
- **Browser-E2E** (Capture→Bind→zweite Projektion→Update→Detach→Reload,
  plus ein `clarify`-Nachweis) ist noch nicht erbracht; er braucht die
  Live-Instanz und ist **nicht** als PASS zu werten, bis er ausgeführt wurde.

## Phase-1-Verträge geschützt

`dsh-whiteboard` kennt weiterhin **keine** PTS-Domainbegriffe
(`LearningMoment`, `confirm`, `clarify`). Diese Semantik lebt vollständig in
PTS. Die Phase-1-Verträge (`pts_whiteboard_render`, `pts_whiteboard`,
board-bound delivery, Command-Ack/verified, Snapshot-Persistenz) bleiben
unverändert.
