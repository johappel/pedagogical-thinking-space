# Companion ↔ Denkstand ↔ Whiteboard — Architektur

Status: Domänenschicht implementiert und getestet (PTS Core, pure Module).
UI-Verdrahtung (Kamera, Composer-Button) als Contract dokumentiert, siehe §10/§11.

Diese Datei ergänzt — nicht ersetzt — die bestehenden Dokumente
[SPIKE-M1-WHITEBOARD-ADAPTER.md](SPIKE-M1-WHITEBOARD-ADAPTER.md),
[SPIKE-PHASE2-LEARNINGMOMENT-DOMAIN-BINDING.md](SPIKE-PHASE2-LEARNINGMOMENT-DOMAIN-BINDING.md)
und [DSH_TLDRAW_INTEGRATION.md](DSH_TLDRAW_INTEGRATION.md). Der LearningMoment-Binding
bleibt die Referenz für Domain-↔Projektion-Identität; die hier ergänzten Module
folgen bewusst demselben Muster.

## Leitprinzip

```
Current Denkstand   (veränderbar)
        ├── sichtbare Projektion → Whiteboard   (Projection Policy)
        └── Context Builder      → Companion     (strukturierte Übergabe)
Activity / Provenance (append-only Historie)
```

Der aktuelle Denkstand ist veränderbar. Die Historie ist append-only. Das
Whiteboard ist nicht die kanonische Wahrheit, sondern die lehrkraftsichtbare
räumliche Projektion relevanter Teile des Denkstands.

## Neue Module (PTS Core, `dsh/presets/pts-companion/`)

| Modul | Rolle | §-Bezug |
| --- | --- | --- |
| [`denkstand-state.mjs`](../../dsh/presets/pts-companion/denkstand-state.mjs) | Current-State-Modell + append-only History | 3, 4, 14 |
| [`projection-policy.mjs`](../../dsh/presets/pts-companion/projection-policy.mjs) | Denkstand-Eintrag → Board-Ziel | 7, 8 |
| [`board-delta.mjs`](../../dsh/presets/pts-companion/board-delta.mjs) | Board-Revision + strukturierte Deltas | 9 |
| [`companion-turn-context.mjs`](../../dsh/presets/pts-companion/companion-turn-context.mjs) | Turn-Brief, Selected Context, Event-Filter | 5, 12, 14 |

Alle vier sind rein (keine I/O-Kopplung außerhalb der JSON-Serialisierung) und
unit-getestet (`tests/denkstand-state.test.mjs`, `tests/projection-policy.test.mjs`,
`tests/board-delta.test.mjs`, `tests/companion-turn-context.test.mjs`).

## 1. Current-State-Modell

Fünf epistemische Kategorien, das tragende Contract:

```
teacher_confirmed     bestätigter Stand der Lehrkraft — einziger entschiedener Grund
teacher_open          von der Lehrkraft offen gelassene Frage
assistant_hypotheses  Companion-Deutung — nie automatisch bestätigt
rejected              verworfene Rahmung — aus dem aktiven Stand entfernt
facts                 belegter Fakt (braucht Quelle)
```

Invarianten (per Test abgesichert):

- Eine Hypothese wird nur über `confirm()`/`transition(…, actor:'teacher')` zu
  bestätigtem Stand — ein Modell kann das nie als Nebeneffekt tun.
- Eine Lehrkraft-Fassung `supersede()`t die ältere Companion-Deutung; die alte
  wird `rejected`, nicht umgekehrt.
- Jeder Statuswechsel hängt genau einen unveränderlichen History-Eintrag an.

Speicher: JSON-Sidecar `.pts/denkstand-state.json` (wie
`learning-moment-bindings.json`, `conversation-bindings.json`).

## 2. Current State vs. History

`projectCurrentState(state)` liefert die aktiven Kategorien (rejected separat).
`historyOf(state, entryId?)` liefert die append-only Provenienz. Verworfene oder
frühere Fassungen verschwinden aus `projectCurrentState`, bleiben aber vollständig
in `history`. Der Activity Stream (`dsh-plugins/pts-activity-stream`) bleibt die
UI-Projektion des DSH-Session-Logs; er wird nicht dupliziert.

## 3. Board Projection Policy

`projectEntry(entry)` bildet Status + Significance (anchor/supporting/detail) auf
ein Board-Ziel ab — nie durch Textanalyse:

| Denkstand | Board |
| --- | --- |
| confirmed + anchor / kind=moment/tension | Übersicht (moment: eigene Page) |
| confirmed + supporting | Übersicht |
| confirmed + detail | nicht projizieren |
| teacher_open + anchor | Übersicht |
| teacher_open + supporting/detail | Sammeln |
| assistant_hypotheses | nicht automatisch |
| facts (+ anchor oder relevantNow) | Übersicht, sonst nicht |
| rejected | nicht auf der aktiven Übersicht |

`planProjection(entry, existing)` übersetzt das in eine Board-Operation
(`create`/`update`/`move`/`remove`/`noop`) und hält dabei die Bindungsdisziplin
ein: projectionId bleibt erhalten, keine Duplikate, `remove` löscht nie das
Domainobjekt (`domainRetained: true`).

## 4. Board Revision / Delta

`boardSignature(snapshot)` ignoriert nur Positions-Jitter (< `POSITION_EPSILON`).
`nextRevision(prev, next, prevRev)` erhöht nur bei echter Signaturänderung.
`diffBoard(prev, next, meta)` liefert die strukturierte Änderung:

```
boardRevision, pageId, actor, reason, timestamp,
createdShapeIds, updatedShapeIds, movedShapeIds, deletedShapeIds,
affectedShapeIds, changes:[{ shapeId, type, actor, before?, after? }]
```

Der Companion trackt `companionLastSeenRevision`; vor dem Turn wird nur die
Differenz seit dieser Revision gezeigt.

## 5. Bedeutung einzelner Whiteboard-Aktionen

| Aktion | Klassifikation | Konsequenz |
| --- | --- | --- |
| Verschieben | `move` | nur räumlich, keine pädagogische Entscheidung; `isMeaningful=false` |
| Umformulieren | `reformulate` | Lehrkraft-Inhalt geändert, relevant für nächsten Turn |
| Neuer Zettel | `new` | neue Lehrkraftnotiz, relevant |
| Projektion entfernen | `remove` | nicht mehr sichtbar; **nicht** automatisch `rejected` |
| Explizit zurückstellen/verwerfen | (Denkstand) | ändert den Status via `reject()`/`supersede()` |

## 6. Focus-on-Change (UI-Contract, Handoff)

Der Board-Worker liefert ein strukturiertes `boardChange` (= `diffBoard`-Ergebnis).
Die UI (dsh-tldraw / Client) leitet daraus ab:

- **Aktuelle Page geändert** → nach Abschluss auf die Bounding Box der
  `affectedShapeIds` zoomen (nicht zu eng, Umgebung zeigen, Reduced Motion).
- **Andere Page geändert** → nicht wegreißen; „Auf ‚Lernmoment 3‘ wurden 2 Dinge
  ergänzt. [Ansehen]“; Klick → Page wechseln → Bounding Box zoomen.
- **Lehrkraft arbeitet aktiv** → keine Kamerafahrt; dezente Hervorhebung +
  „Änderung ansehen“.

Diese Logik gehört in den generischen dsh-tldraw-Layer (siehe
[DSH_TLDRAW_INTEGRATION.md](DSH_TLDRAW_INTEGRATION.md)); der strukturierte
`boardChange` ist der Seam.

## 7. Selected Context / Context Picker (Contract)

`makeSelectedContext({ source, pageId, shapeIds, snapshotRevision, items })`
erzeugt eine **eigene** Struktur, getrennt vom `teacher_message`. Beim Senden:

```
teacher_message   (Worte der Lehrkraft)
+ selected_context (ausgewählte Elemente — keine Aussage der Lehrkraft)
```

`renderSelectedContext` kennzeichnet den Block explizit als „von der Lehrkraft
ausgewählt — keine Aussage der Lehrkraft“. Der Composer erlaubt Entfernen
einzelner/aller Elemente und optional „Auf Board zeigen“ (UI-Handoff).

## 8. Context-Aufbereitung für den Companion

`buildTurnContext({ currentState, boardDelta, selectedContext })` erzeugt den
kleinen strukturierten Brief:

```
CURRENT DENKSTAND   (Bestätigt / Aktiv offen / Companion-Hypothesen / Fakten / Verworfen)
BOARD CHANGES SEIT DEM LETZTEN TURN
SELECTED CONTEXT
```

Keine proseartige Verdichtung: `renderCurrentDenkstand` gibt die Kategorien
gelabelt aus und stellt Verworfenes zuletzt, damit ein späteres Modell einen
Companion-Satz nicht als Bestätigung liest. Das ist zugleich die Compaction-/
Modellwechsel-Übergabe (§4): die epistemischen Kategorien bleiben erhalten.

## 9. Umgang mit Subagent-Events

`classifyConversationEvent(event)` trennt `teacher`/`assistant`/`tool_result`/
`activity`/`state_change`. Ein Hintergrund-/Subagent-Bericht (`kind:'subagent-settled'`
oder Body wie „Background subagent … finished“) auf der User-Rolle wird als
`activity` reklassifiziert — nie als Lehrkraftäußerung. `isTeacherMessage()` ist
der Guard. `toDenkstandChanged(consequence)` faltet die fachliche Konsequenz eines
Hintergrundauftrags in ein strukturiertes `denkstand_changed` statt des
technischen Berichts.

## 10. Offene Architekturfragen

- **Live-Integration des Turn-Briefs:** `companion-turn-context` ist pure; die
  additive Einspeisung in `pts-context.mjs`/`system-prompt/assemble` (nur wenn
  `.pts/denkstand-state.json` existiert) ist noch nicht verdrahtet, damit das
  bestehende Live-Verhalten unverändert bleibt, bis der State-Writer steht.
- **State-Writer:** Wer schreibt `.pts/denkstand-state.json`? Vorschlag: der
  `pts_documentarian` bekommt eine strukturierte Schreibfassade (analog
  `learning-moment`), statt weiter rein additiv in Markdown zu schreiben.
- **Revision-Persistenz:** `companionLastSeenRevision` muss pro Session gehalten
  werden (heute hält der Adapter nur den letzten Snapshot pro Agent in-memory).
- **Board-Projektion ↔ Denkstand-Eintrag:** die projectionId sollte im
  Denkstand-Eintrag hinterlegt werden (Feld analog `learning-moment` bindings),
  sobald der Board-Worker die Policy anwendet.

## Handoff-Antworten (§20)

1. **Kanonischer aktueller Denkstand:** `denkstand-state.json` via
   `projectCurrentState` — die fünf Kategorien, veränderbar.
2. **Nur Historie:** `history[]` (append-only) + Activity Stream + verworfene
   Fassungen; nie aktiver Stand.
3. **Auf „Sammeln“:** `teacher_open` mit significance supporting/detail
   (vorläufiger Gedanke).
4. **Auf „Übersicht“:** confirmed (nicht detail), teacher_open+anchor,
   relevanter Fakt, Lernmoment (zusätzlich eigene Page).
5. **Lehrkraftänderungen am Board:** `diffBoard` seit `companionLastSeenRevision`,
   im Turn-Brief unter „BOARD CHANGES“ (nur meaningful; Move ist keine Entscheidung).
6. **Agentische Board-Veränderungen sichtbar:** strukturiertes `boardChange` →
   Focus-on-Change / „Ansehen“ (UI-Contract §6).
7. **Selected ≠ Lehrkraftaussage:** getrennte `selected_context`-Struktur,
   im Prompt eigener Block mit expliziter Kennzeichnung.
8. **Hypothese bleibt Hypothese:** `confirm` erzwingt `actor:'teacher'`;
   `renderCurrentDenkstand` gibt Kategorien gelabelt und getrennt aus, damit
   Compaction/Modellwechsel den Status nicht kollabieren.
