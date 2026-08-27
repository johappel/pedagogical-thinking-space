# STEWARDSHIP_RESULT_SCHEMA.md

> Strukturiertes Ergebnis des Background Stewards. Der Hintergrund-Agent gibt
> ausschließlich dieses Ergebnis zurück; er schreibt nie selbst in den
> Workspace. Referenz-Implementierung:
> `dsh-plugins/pts-background-steward/lib/patch-validator.js`.

---

## Identität und Transport

- Schema-Kennung: `ptspace.stewardship-result/v1`
- Transport: strukturierte Subagent-Ausgabe (`outputSchema` des `spawn`-
  Providers; das Kind ruft genau einmal `structured_output` auf).
- Das Schema nutzt ausschließlich die von DSH (`dsh-tools`) erzwungene
  JSON-Schema-Teilmenge: `type`, `properties`, `required`, boolesches
  `additionalProperties`, `items`, skalares `enum`/`const`, exakt-ein `oneOf`.
  Längen-, Muster- und Kardinalitätsregeln liegen deshalb in der anwendungs-
  seitigen Politikprüfung, nicht im Schema.

## Vollständiges Beispiel

```yaml
schema: ptspace.stewardship-result/v1
session_id: session-123
turn: 42
base:
  learning-design.md: sha256:0f3a…e1
  learning-landscape.md: sha256:9c77…4b
  decisions.yml: null
  planning-board.yml: sha256:5d10…90
  temporal-plan.yml: sha256:c2ee…17

observations:
  - type: teacher_statement
    evidence: m7
    content: Der Fall soll einen 14-jährigen Jugendlichen zeigen.
  - type: open_question
    evidence: m9
    content: Wie viel Vorwissen hat die Klasse zum Thema Religion im öffentlichen Raum?

operations:
  - target: learning-design.md
    kind: set-section
    section: Context
    value: |
      - Anlass ist ein Fallbeispiel aus der Religionskunde.
      - Die Lehrkraft nennt ausdrücklich eine 14-jährige Hauptfigur.

teacher_decisions:
  - evidence: m7
    explicit: false

service_intents:
  - task: verify_curriculum_alignment
    reason: Die Lehrkraft fragt, ob das Thema in die 11. Klasse in NRW passt.
    authorization:
      type: implied_bounded_request
      evidence: m2
    scope:
      jurisdiction: NRW
      subject: Religionslehre
      phase: gymnasiale Oberstufe
      grade: "11"
      denomination: unknown
      topic: Utopie und Hoffnung
    return_to: critical_friend

next_turn_hint:
  kind: open_question
  content: Was erzählt der Jugendliche seinen Eltern?

forbidden_effects:
  - keine Entscheidung erkannt — decisions.yml unverändert
```

## Felder

| Feld | Typ | Bedeutung |
|---|---|---|
| `schema` | const | Immer `ptspace.stewardship-result/v1`. Abweichung → Verwerfen. |
| `session_id` | string | Muss exakt der Session-ID des Auftrags entsprechen. |
| `turn` | integer | Turn-Nummer des auslösenden Gesprächs; Bindung gegen Halluzination. |
| `base` | object | Vom Auftrag übernommene Hashes (`sha256:<hex>` oder `null`). Muss exakt echoen werden. |
| `observations` | array | Epistemisch getrennte Feststellungen mit `type`, `evidence`, `content`. |
| `operations` | array | Vorgeschlagene Änderungen (siehe unten); leer ist erlaubt und oft richtig. |
| `teacher_decisions` | array | Erkannte Entscheidungen mit `evidence` und `explicit` (boolean). |
| `service_intents` | array | Höchstens ein begrenzter, quellengebundener Knowledge-Request; leer ist der Normalfall (siehe unten). |
| `next_turn_hint` | object/null | Höchstens eine offene Frage (`kind: none \| open_question`). Angebot, keine Vorgabe. |
| `forbidden_effects` | array | Was bewusst unterlassen wurde; reine Protokollhilfe. |

## Beobachtungstypen

`teacher_statement`, `open_question`, `interpretation`, `hypothesis`,
`decision_signal`, `contradiction`, `focus_shift`.

`evidence` verweist auf eine Nachrichten-ID des angebotenen Gesprächsfensters
(z. B. `m3`) oder auf `"context"`; fremde Belege verwerfen das Ergebnis.

## Operationen

| `target` + `kind` | Pflichtfelder | Wirkung / Nebenbedingungen |
|---|---|---|
| `learning-design.md` + `set-section` | `section`, `value` | Ersetzt den Rumpf einer `##`-Ebene oder legt sie an. |
| `learning-design.md` + `append-under-section` | `section`, `value` | Hängt einen Block unter die Überschrift. |
| `learning-landscape.md` + `add-draft-moment` | `title`, `moment_type`, `moment_function`, `learning_activity`, `expected_experience`, `value` | Vollständiger Entwurf; Status wird zwangsläufig `draft`; ID und Herkunft generiert die Anwendung. |
| `decisions.yml` + `add-decision` | `value`, `evidence` | Nur mit passendem `teacher_decisions`-Eintrag `explicit: true`; sonst abgelehnt. |
| `planning-board.yml` + `propose-board-item` | `title`, `board_kind`, `value` | Höchstens einer pro Lauf; wird mit `status: proposed`, `column: clarify`, `requires_teacher_approval: true` angelegt. |

Unabhängig davon gilt:

- `temporal-plan.yml` ist als Ziel immer unzulässig;
- `moment_type` muss dem Lerntyp-Vokabular von `specs/LEARNING_LANDSCAPE_SCHEMA.md`
  folgen (`impulse` … `other`);
- `board_kind` folgt `specs/PLANNING_BOARD_SCHEMA.md`;
- `value` ist auf 4000 Zeichen begrenzt, Titel auf 200;
- unbekannte Ziel-/Art-Kombinationen werden einzeln abgelehnt und protokolliert.

## Service-Intents (begrenzter Knowledge-Request)

Der Steward darf **höchstens einen** begrenzten, quellengebundenen
Knowledge-Request vorschlagen (`services/STEWARDSHIP.md`). Er recherchiert nie
selbst; die Anwendung übergibt den validierten Request an einen getrennten
DSH-Recherche-Subagenten.

| Feld | Typ | Bedeutung |
|---|---|---|
| `task` | const | Allowlist; derzeit ausschließlich `verify_curriculum_alignment`. |
| `reason` | string | Kurzbegründung des Wissensbedarfs. |
| `authorization.type` | const | Muss `implied_bounded_request` sein. |
| `authorization.evidence` | string | Nachrichten-ID **der Lehrkraft** aus dem Gesprächsfenster. |
| `scope` | object | Eng begrenzter, öffentlicher, nicht personenbezogener Umfang. |
| `return_to` | const | Muss `critical_friend` sein. |

`scope` bei `verify_curriculum_alignment` trägt nur öffentliche Felder:
`jurisdiction`, `subject`, `phase`, `grade`, `topic` (Pflicht) sowie optional
`denomination`. Eine unbekannte Konfession (`denomination: unknown` oder leer)
blockiert die erste Prüfung nicht — der Dienst prüft dann evangelisch **und**
katholisch.

Die anwendungsseitige Politikprüfung **lehnt einen Service-Intent ab**, wenn:

- kein belegter Nutzerauftrag existiert (`authorization.evidence` verweist nicht
  auf eine Nachricht **der Lehrkraft** im Gesprächsfenster; `"context"` genügt
  hier nicht);
- der Scope offen oder unbegrenzt ist (Pflichtfelder fehlen oder fremde/leere
  Felder erscheinen);
- private oder personenbezogene Daten übertragen würden;
- der Request eine pädagogische Entscheidung oder Materialproduktion enthält
  (unzulässiger `task`, `authorization.type` ≠ `implied_bounded_request` oder
  `return_to` ≠ `critical_friend`);
- mehr als ein Service-Intent pro Lauf vorgeschlagen wird.

Ohne gültige Autorisierung entsteht kein Anlaufen; der Request bleibt
`proposed`.

## Annahmeprozess (anwendungsseitig)

1. Strukturprüfung inklusive Echo-Pflicht für `session_id`, `turn`, `base`
   und Evidence-Fenster;
2. Politikprüfung gemäß `services/STEWARDSHIP.md`;
3. erneuter Hash-Vergleich aller kanonischen Dateien — jede Abweichung
   verwirft das **gesamte** Ergebnis (`stale`), niemals wird ein älterer Stand
   über einen neueren geschrieben;
4. atomare Anwendung je Datei; Einzelablehnungen werden protokolliert,
   ohne den Rest zu blockieren.

Erfolgreiche Hintergrundpflege wird nicht im Chat erwähnt.
