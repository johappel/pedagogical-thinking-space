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
- darf **keine Recherche starten** und keine Worker, Renderer oder Dienste auslösen;
- darf **keine pädagogische Richtung entscheiden** und keine Empfehlung über Ziele,
  Methoden oder Werte geben;
- darf **keinen Planning-Board-Eintrag genehmigen** — Vorschläge tragen stets
  `status: proposed` mit `requires_teacher_approval: true`;
- darf **nicht in Memory (`memory.local/`) oder kuratiertes Knowledge schreiben**;
- darf **`temporal-plan.yml` nie verändern** — bindende zeitliche Platzierungen
  bleiben der Lehrkraft vorbehalten;
- schreibt **nie selbst Dateien**: Er liefert ein strukturiertes Ergebnis zurück;
  die Anwendung validiert es und wendet es atomar an.

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

Der dateibasierte Dispatcher (`harness/dispatcher.py`) bleibt für explizite,
genehmigte Service Requests verantwortlich (Worker, Recherche, Rendering).
Die kontinuierliche Denkstandpflege läuft bewusst **nicht** durch ihn: Sie ist
turngebunden, soll unmittelbar nach dem Gespräch anlaufen, erzeugt keine
separate Prozess- und Polling-Latenz und braucht direkten Zugriff auf DSH-
Session-Ereignisse.
