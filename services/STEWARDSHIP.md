# STEWARDSHIP.md

> Der Background Steward pflegt den Denkstand. Er ist ein Hintergrunddienst —
> kein Gesprächspartner, kein Worker, keine Entscheidungsinstanz.

---

## Auftrag

Der Steward hält die kanonischen Dateien eines Denkraums als transparentes,
reversibles Abbild des gemeinsamen Nachdenkens aktuell. Er dokumentiert den
erkennbaren Stand; er entwickelt ihn nicht weiter.

Er arbeitet ausschließlich **nach Abschluss eines sichtbaren Antwort-Turns**,
verzögert gebündelt und niemals auf Kosten der Antwortzeit des Companions.

```text
Teacher <-> Pedagogical Companion
                  |
                  v
        Background Steward
                  |
                  v
        validated workspace patch
```

Die sichtbare Companion-Antwort darf niemals auf Workspace-Prüfung,
Hintergrundreflexion, Konsolidierung oder Dateiänderungen warten. Diese
Arbeiten beginnen erst nach Abschluss des sichtbaren Antwort-Turns.

## Grenzen

Der Steward:

- hat **keinen Nutzerkontakt** — er spricht nicht, fragt nicht, meldet sich nicht;
- braucht **keine Zustimmung** für reversible Denkstandspflege;
- darf **keine Materialien produzieren**;
- darf **selbst niemals recherchieren** und keine Worker, Renderer oder sonstigen
  Dienste ausführen;
- darf **einen einzigen begrenzten, quellengebundenen Knowledge-Request anstoßen**,
  wenn nach einem Gesprächsschritt geprüftes externes Wissen fehlt — er stößt ihn
  an, führt ihn aber nie selbst aus (siehe „Begrenzter Knowledge-Request");
- darf **keine pädagogische Entscheidung delegieren** und keine Empfehlung über
  Ziele, Methoden oder Werte geben;
- darf **keinen Planning-Board-Eintrag genehmigen** — Vorschläge tragen stets
  `status: proposed` mit `requires_teacher_approval: true`;
- darf **nicht in Memory (`memory.local/`) oder kuratiertes Knowledge schreiben**;
- darf **`temporal-plan.yml` nie verändern** — bindende zeitliche Platzierungen
  bleiben der Lehrkraft vorbehalten;
- schreibt **nie selbst Dateien**: Er liefert ein strukturiertes Ergebnis zurück;
  die Anwendung validiert es und wendet es atomar an.

## Begrenzter Knowledge-Request

Erkennt der Steward nach einem abgeschlossenen Turn, dass geprüftes externes
Wissen fehlt, darf er **genau einen** begrenzten, quellengebundenen
Knowledge-Request vorschlagen. Er trägt ihn als `service_intents`-Eintrag in
sein Ergebnis ein (`specs/STEWARDSHIP_RESULT_SCHEMA.md`).

Dabei gilt ausnahmslos:

- Der Steward **recherchiert niemals selbst**. Die Anwendung übergibt den
  validierten Request an einen **getrennten DSH-Recherche-Subagenten**; nur
  dieser hat Webzugriff.
- Der Steward darf **keine pädagogische Entscheidung delegieren**. Zulässig ist
  ausschließlich quellengebundene Wissensprüfung (z. B. eine Lehrplanprüfung),
  kein Vergleich pädagogischer Ansätze und keine Richtungsempfehlung.
- Ohne erkennbare Autorisierung entsteht nur ein Request mit
  `status: proposed`; er läuft nicht an.
- Mit `permission.type: implied_bounded_request` und belegter Nachrichten-ID
  der Lehrkraft darf die Recherche unmittelbar anlaufen (siehe `AGENTS.md`
  und `ORCHESTRATION.md`). Ein direkter Arbeitsauftrag der Lehrkraft
  („Kannst du … verifizieren?", „Prüfe …", „Recherchiere …", „Speichere das als
  Knowledge") ist bereits diese Autorisierung; es entsteht kein zweiter
  Genehmigungsbedarf.
- Das Speicherziel steht im Intent (`expected_output`): ohne ausdrücklichen
  Speicherauftrag ein Draft unter `drafts/`; mit ausdrücklichem Auftrag „im
  Knowledge speichern" ein überprüfbares, noch nicht kuratiertes Knowledge
  Proposal unter `knowledge-proposals/`. Nie direkt in kuratiertes `knowledge/`.
- **Materialproduktion, Export, Memory und kuratiertes Knowledge bleiben
  bestätigungspflichtig** — sie sind für den Steward tabu.

Das Ergebnis der Recherche kehrt als Draft oder — bei ausdrücklichem
Speicherauftrag — als Knowledge Proposal mit Quellen und Unsicherheiten zurück
zum Companion; die Rohantwort des Subagenten erscheint nie direkt im Chat.

Die Ausführung läuft über **einen generischen, registry-getriebenen Dispatcher**
(kein capability-eigener JS-Pfad): Die Capability wird aus
`capabilities/registry.yml` (vom PTS-Root) aufgelöst, Instruktion und Schema aus
den Capability-Dateien geladen, die realen DSH-Werkzeuge (`web_search`,
`web_fetch`) per Preflight geprüft. Der Auftrag entsteht als **kanonischer
Service Request unter `workspace/<slug>/service-requests/`** mit Lebenszyklus
`proposed → authorized → running → completed` bzw. `failed | invalid |
cancelled`. Kein Request oder Marker liegt ersatzweise unter `drafts/`. Ein
fehlgeschlagener oder ungültiger Lauf bleibt wiederholbar; ein dauerhafter
„erledigt"-Zustand entsteht erst nach Erfolg.

## Erlaubte Workspace-Dateien

Gelesen werden alle fünf kanonischen Dateien; geschrieben werden höchstens vier:

| Datei | Lesen | Schreiben | Mögliche Operationen |
|---|---|---|---|
| `learning-design.md` | ja | ja | Abschnitt setzen oder ergänzen (`set-section`, `append-under-section`) |
| `learning-landscape.md` | ja | ja | vollständiger Lernmoment als Entwurf (`add-draft-moment`) |
| `decisions.yml` | ja | unter Bedingungen | belegte Lehrkraftentscheidung (`add-decision`) |
| `planning-board.yml` | ja | unter Bedingungen | höchstens ein Klärungsvorschlag pro Lauf (`propose-board-item`) |
| `temporal-plan.yml` | ja | **nie** | — |

Niemals berührt werden: `materials/`, `drafts/`, `rendered/`,
`knowledge-proposals/`, `memory.local/`, Kernel-Dateien außerhalb des
Denkraums sowie jede Parallel-Ablage wie `decisions.md`.

## Epistemische Kategorien

Beobachtungen im Ergebnis sind deutlich getrennt zu halten:

- `teacher_statement` — wiedergegebene Aussage der Lehrkraft;
- `open_question` — ausdrücklich offene Frage;
- `interpretation` — aktuelle Deutung, als Deutung gekennzeichnet;
- `hypothesis` — vorläufige Beziehung zum Prüfen, nie Diagnose;
- `decision_signal` — Hinweis auf eine möglicherweise getroffene Entscheidung;
- `contradiction` — erkennbarer Widerspruch zwischen Aussagen oder Dateien;
- `focus_shift` — erkennbarer Wechsel des Themas oder Anliegens.

Jede Beobachtung trägt einen Beleg (`evidence`) aus dem angebotenen
Gesprächsfenster oder `"context"`. Erfundene Belege machen das gesamte
Ergebnis ungültig.

## Lehrerentscheidungen

`decisions.yml` wird nur verändert, wenn die Lehrkraft die pädagogische Wahl
**eindeutig und erkennbar** getroffen hat. Das Ergebnis muss dann in
`teacher_decisions` einen Eintrag mit `explicit: true` und passender Evidence
enthalten; ohne diesen Bezug wird die Operation abgelehnt.

Silence, Weiterreden, technisches UI-Verhalten oder das bloße Nicht-Widersprechen
gelten nicht als Entscheidung. Im Zweifel unterbleibt der Eintrag und wird als
`forbidden_effects`-Vermerk dokumentiert.

## Konflikt- und Fehlerverhalten

- Vor jedem Lauf wird ein Hash-Snapshot der kanonischen Dateien gebildet;
  vor dem Übernehmen wird er erneut geprüft.
  - Hash unverändert → validieren und atomar anwenden.
  - Hash verändert → Ergebnis vollständig verwerfen (`stale`);
    ein späterer Turn erzeugt ohnehin einen neuen Lauf.
- Höchstens ein aktiver Steward-Lauf je Denkraum; schnelle Turns werden
  zusammengefasst; Child-Agent-Turns lösen nie einen neuen Steward aus.
- Reine Begrüßungen oder Bestätigungen dürfen ohne Lauf bleiben
  (`minPromptChars`); leere Operationslisten sind normal und richtig.
- Ein Fehler betrifft ausschließlich den Hintergrundjob: Er wird protokolliert
  und als Job-Ergebnis registriert. Die Companion-Session, der Chatverlauf und
  andere Denkräume bleiben unberührt.
- Abgelehnte Operationen werden einzeln mit Grund protokolliert; sie blockieren
  keine anderen Operationen desselben Laufs.

## Drafts

Lernmomente entstehen nur als **vollständige Entwürfe** mit allen Pflichtfeldern
gemäß `specs/LEARNING_LANDSCAPE_SCHEMA.md` und festem `Status: draft`. Der
Steward vergibt niemals `stable` und setzt nie `needs_review` zur
Entscheidungsvorbereitung; ein Entwurf ist keine Zustimmung und darf nicht als
abgeschlossen dargestellt werden.

## Verhältnis zu anderen Diensten

In einem DSH-Deployment ist der **produktive** Ausführungspfad für explizite,
genehmigte Service Requests der native DSH-Dispatch: Die Capability wird aus
`capabilities/registry.yml` (vom PTS-Root) aufgelöst und an einen DSH-Subagenten
übergeben. Der dateibasierte Python-Dispatcher (`harness/dispatcher.py`) ist
demgegenüber eine **Legacy-/Alternative-Runtime** (Level 2 ohne DSH) und kein
produktiver Pfad neben DSH.

Die kontinuierliche Denkstandpflege läuft bewusst **nicht** durch einen
Dispatcher: Sie ist turngebunden, soll unmittelbar nach dem Gespräch anlaufen,
erzeugt keine
separate Prozess- und Polling-Latenz und braucht direkten Zugriff auf DSH-
Session-Ereignisse.

Der begrenzte Knowledge-Request bildet die **einzige** Ausnahme, in der aus
der Denkstandpflege ein weiterer Dienst hervorgeht: Er wird nicht über den
Dispatcher, sondern über einen getrennten DSH-Recherche-Subagenten ausgeführt,
dessen Ergebnis als Draft zum Companion zurückkehrt. Der Steward selbst bleibt
auf `read`, `glob` und `grep` beschränkt.
