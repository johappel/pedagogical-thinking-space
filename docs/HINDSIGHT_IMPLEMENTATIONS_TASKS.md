# TASK: PTS Hindsight Memory + Interaction Supervisor

## Ziel

Erweitere den Pedagogical Thinking Space (PTS) um ein langfristiges Hindsight-Gedächtnis und einen separaten Interaction-Supervisor.

Die Implementierung muss folgende Grundarchitektur bewahren:

**Hindsight erinnert und interpretiert.  
Der Supervisor beobachtet die Zusammenarbeit.  
Nur die Lehrkraft autorisiert pädagogische Entscheidungen.**

Hindsight und Supervisor dürfen deshalb niemals selbst `LearningMoment`, `Decision`, `Denkstand`, Whiteboard-Domain oder `TeachingProduct` verändern.

---

# 1. Zuerst bestehenden Code untersuchen

Bevor du Code änderst:

1. Ermittle die aktuell aktive PTS-/DSH-Pluginstruktur.

2. Ermittle, wo der Companion konfiguriert und sein System-/Context-Prompt zusammengesetzt wird.

3. Ermittle das tatsächliche Format von:
   - Teacher Messages
   - Companion Messages
   - technischen Subagent-/Tool-Events
   - Session-/Conversation-IDs
   - Turn-/Message-IDs

4. Ermittle die vorhandenen DSH-Lifecycle-Hooks:
   - Session start
   - Session end
   - message/turn completed
   - context compaction
   - background subagent execution

5. Prüfe, ob `ctx.subagents.start()` oder eine inzwischen neuere native DSH-Subagent-API im aktuellen Stand verwendet werden soll.

6. Ermittle vorhandene PTS-Persistenz- und Logging-Konventionen.

7. Ermittle, ob bereits ein Privacy-/Sensitive-Data-Gate vorhanden ist.

WICHTIG:

Keine DSH-API erfinden.

Keine neue parallele Pluginarchitektur anlegen, wenn bereits eine passende PTS-Struktur existiert.

Bestehende Architektur bevorzugen.

Dokumentiere vor der Implementierung kurz, welche realen Extension Points gefunden wurden.

---

# 2. Architektur-Invarianten

Diese Regeln sind nicht verhandelbar.

## 2.1 PTS bleibt kanonisch

Folgende Daten bleiben ausschließlich PTS-Domainzustand:

- LearningMoment
- bestätigte Decision
- kanonischer Denkstand
- Whiteboard-Bindings
- Teaching Product

Hindsight darf Kopien oder historische Hinweise darauf speichern, aber niemals die kanonische Quelle ersetzen.

## 2.2 Hindsight darf keine PTS-Domain schreiben

Es darf keinen Codepfad geben:

Hindsight → Decision write

Hindsight → Denkstand update

Hindsight → LearningMoment create

Hindsight → TeachingProduct update

Hindsight ist ausschließlich Memory-/Retrieval-Infrastruktur.

## 2.3 Supervisor besitzt keine Write-Tools

Der Supervisor-Agent erhält:

- keine Decision-Tools
- keine Denkstand-Tools
- keine Whiteboard-Tools
- keine TeachingProduct-Tools
- kein Hindsight-retain-Tool
- kein Web
- keine Research-Tools

Der Supervisor liefert ausschließlich strukturiertes JSON zurück.

Seiteneffekte werden anschließend durch deterministischen PTS-Code ausgeführt.

---

# 3. Hindsight integrieren

Verwende den offiziellen TypeScript-Client:

`@vectorize-io/hindsight-client`

Die Verbindung muss ausschließlich über Konfiguration erfolgen.

Beispiel:

`HINDSIGHT_BASE_URL`

Optional:

`HINDSIGHT_API_KEY`

Keine URL und keinen API-Key im Code hardcoden.

Implementiere einen kleinen Adapter, z. B. sinngemäß:

`PtsHindsightClient`

mit mindestens:

- `healthCheck()`
- `ensureWorkspaceBanks()`
- `retainProjectMemory()`
- `recallProjectMemory()`
- `retainInteractionMemory()`
- `recallInteractionMemory()`

Wenn die bestehende Projektstruktur andere Namen nahelegt, passe die Dateinamen an.

Keine Hindsight-API-Aufrufe über den ganzen Code verteilen.

Alle Hindsight-Aufrufe müssen hinter diesem Adapter liegen.

---

# 4. Zwei Banks pro Workspace

Für jeden PTS-Workspace existieren zwei logisch getrennte Memory Banks:

`project`

und

`interaction`

Beispiel logisch:

`pts:<workspace-key>:project`

`pts:<workspace-key>:interaction`

Verwende keine absoluten lokalen Workspace-Pfade als Bank-ID.

Bevorzuge eine vorhandene stabile Workspace-ID.

Falls keine existiert, erzeuge einen stabilen, nicht rückrechenbaren Workspace-Key, z. B. über einen Hash des normalisierten Workspace-Identifier.

---

# 5. Project Bank

Die Project Bank enthält historisches Arbeitsgedächtnis.

Sie darf speichern:

- Teacher-Äußerungen
- Companion-Antworten
- gemeinsam erwogene Ideen
- Fragen
- Alternativen
- verworfene Überlegungen
- Rahmenbedingungen
- explizit bestätigte PTS-Ereignisse als historische Information

Sie darf NICHT behaupten, dass eine bloße Erwägung bereits eine bestätigte pädagogische Entscheidung sei.

Konfiguriere die Bank mit einer geeigneten `retainMission` / `observationsMission`.

Semantischer Inhalt dieser Mission:

"Extrahiere dauerhaft hilfreichen Projektkontext aus der Zusammenarbeit. Unterscheide Fragen, Hypothesen, Optionen, verworfene Ideen, Rahmenbedingungen und explizit bestätigte Entscheidungen. Eine bloß diskutierte oder erwogene Idee darf niemals als bestätigte Entscheidung dargestellt werden. PTS-Domainzustand bleibt autoritativ."

---

# 6. Gespräch speichern

Speichere keine technischen DSH-Events.

Speichere semantische LK↔Companion-Interaktionen.

Bevorzugtes Format pro vollständigem Austausch:

[Teacher]
...

[Companion]
...

Nicht speichern:

- Tool-Progress
- Worker-Statusmeldungen
- interne Subagent-Messages
- Yjs-Updates
- Whiteboard-Transportevents
- technische Plugin-Logs

Füge Metadata hinzu, soweit reale IDs verfügbar sind:

- schemaVersion
- sessionId
- teacherTurnId
- companionTurnId
- source
- authority

Tags mindestens logisch entsprechend:

- `scope:project`
- `source:conversation`
- `session:<id>`
- `authority:noncanonical`

Verwende für projektweite Observations einen stabilen Observation-Scope wie:

`["scope:project"]`

Session-Tags dürfen nicht dazu führen, dass jede Session ihre eigenen isolierten Projekt-Observations erzeugt.

---

# 7. Bestätigte PTS-Ereignisse

Wenn im bestehenden System eindeutig ein teacher-confirmed Domain Event verfügbar ist, darf dieses zusätzlich als historische Information gespeichert werden.

Beispiel:

"Teacher confirmed decision: Zentraler Denkhebel ist Gottesbild."

Tag:

`authority:teacher-confirmed`

Aber:

Die kanonische Decision bleibt weiterhin ausschließlich im bestehenden PTS-Store.

Nicht für diesen Task neue Decision-Events erfinden.

Nur bestehende bestätigte Domain Events verwenden.

---

# 8. Project Recall in den Companion einbinden

Vor einem Companion-Turn soll relevantes Project Memory abgerufen werden.

Query-Basis:

- aktuelle Teacher Message
- optional sehr kurze Information über aktuell offene Themen

Keinen vollständigen Denkstand erneut durch Hindsight schicken, wenn er ohnehin separat als kanonischer PTS-Kontext vorhanden ist.

Begrenze das Memory-Kontextbudget.

Der Companion-Prompt muss eine klar erkennbare Sektion erhalten:

`PTS MEMORY — historical/advisory, not authoritative`

Diese Sektion muss klar unterhalb des kanonischen PTS-Kontexts stehen.

Prompt-Regel:

"When memory conflicts with the current PTS Denkstand or a teacher-confirmed decision, the current PTS domain state wins."

Hindsight-Ausfall darf den Companion nicht blockieren.

Bei Timeout oder Fehler:

- Fehler sauber loggen
- Memory-Kontext auslassen
- normale Companion-Verarbeitung fortsetzen

Keine leeren Fake-Memories erzeugen.

---

# 9. Interaction Supervisor implementieren

Implementiere einen separaten Supervisor-Agenten/Subagenten.

Der Supervisor betrachtet ausschließlich die Zusammenarbeit zwischen Teacher und Companion.

Er bewertet NICHT die fachliche oder didaktische Richtigkeit einer Unterrichtsentscheidung.

Er beobachtet insbesondere:

- over_direction
- under_support
- premature_solutioning
- useful_mirroring
- useful_question
- repetition
- conversation_loop
- missed_teacher_direction
- ignored_correction
- unnecessary_explanation
- helpful_concretization
- premature_closure
- agency_preserved

Diese Kategorien dürfen intern erweitert werden, aber nicht durch psychologische Diagnosen ersetzt werden.

---

# 10. Supervisor-Prompt

Verwende sinngemäß folgende Systeminstruktion:

"You are the PTS Interaction Supervisor.

You observe a conversation between a teacher and the PTS Companion.

Your task is not to judge the teacher and not to decide what good teaching is.

Your task is to identify interaction patterns that may help the Companion collaborate better in future turns or sessions.

Evaluate Companion behavior, not teacher personality.

Look especially for:
- excessive steering,
- insufficient support,
- premature solutioning,
- repeated questions or answers,
- conversation loops,
- ignored corrections,
- useful mirroring,
- useful summarization,
- moments when concrete help was requested and provided,
- moments when the Companion completed the teacher's thinking instead of supporting it.

Every claim must be grounded in specific conversation turns.

Do not infer psychological traits, abilities, confidence, ideology, teaching style, or personality.

Do not turn one isolated event into a general rule unless it is unusually explicit.

It is valid and desirable to return no durable memory candidate.

Do not make pedagogical decisions.

Return only JSON matching the provided schema."

---

# 11. Supervisor Output Schema

Implementiere ein echtes Runtime-Schema, nicht nur einen TypeScript-Type.

Verwende das im Projekt bereits etablierte Schema-System, falls vorhanden.

Sonst eine kleine vorhandene Dependency bevorzugen; keine große neue Framework-Abhängigkeit nur dafür hinzufügen.

Struktur:

{
  "schemaVersion": 1,
  "windowSummary": "...",
  "signals": [
    {
      "kind": "...",
      "impact": "helpful | friction | neutral",
      "observation": "...",
      "evidenceTurnIds": ["..."],
      "confidence": 0.0
    }
  ],
  "memoryCandidates": [
    {
      "condition": "...",
      "companionAdjustment": "...",
      "evidenceTurnIds": ["..."],
      "confidence": 0.0
    }
  ]
}

Regeln:

- confidence zwischen 0 und 1
- evidenceTurnIds müssen aus dem analysierten Fenster stammen
- leerer `memoryCandidates`-Array ist erlaubt
- unbekannte IDs verwerfen
- invalides JSON verwerfen
- keine automatische Reparatur durch einen zweiten LLM-Aufruf

---

# 12. Supervisor Policy Validation

Nach Schema-Validation folgt eine deterministische Policy-Validation.

Verwerfe Memory Candidates mit Formulierungen, die offensichtlich Lehrerpersönlichkeit oder psychologische Eigenschaften behaupten.

Insbesondere dürfen nicht als Memory gespeichert werden:

"teacher is insecure"

"teacher needs strong guidance"

"teacher is confused"

"teacher dislikes methods"

"teacher is constructivist"

oder entsprechende deutsche Formulierungen.

Memory muss auf Interaktion bezogen sein.

Gute Form:

"When the didactic framing question was still open, immediate method suggestions led back to the framing question."

Schlechte Form:

"The teacher does not like methods."

Die Policy muss primär strukturell/promptseitig wirken.

Keine riesige Wort-Blacklist bauen.

---

# 13. Supervisor darf häufig nichts speichern

Das ist wichtig.

Ein Supervisor-Lauf ist erfolgreich, wenn er feststellt:

`memoryCandidates: []`

Nicht aus jedem Gespräch muss eine neue Verhaltensregel entstehen.

Nur Information speichern, die mit hinreichender Wahrscheinlichkeit für spätere Zusammenarbeit nützlich ist.

Setze keinen extrem niedrigen Confidence-Threshold.

Verwende zunächst einen konservativen Wert und mache ihn konfigurierbar.

Dokumentiere den Default.

---

# 14. Interaction Bank

Validierte Supervisor-Memory-Candidates werden durch den PTS-Orchestrator in die Interaction Bank geschrieben.

Tags logisch entsprechend:

- `scope:interaction`
- `source:supervisor`
- `session:<id>`
- `signal:<kind>`

Observation-Scope:

`["scope:interaction"]`

Die Interaction Bank erhält eine eigene `observationsMission`.

Sinngemäß:

"Consolidate only recurring or materially useful patterns about how the PTS Companion's interventions affected the collaboration. Describe conditions and Companion behavior. Preserve uncertainty and contradictory evidence. Never infer stable psychological traits, competence, personality, ideology, or teaching style of the teacher. Never create pedagogical decisions. Prefer conditional observations over universal rules."

---

# 15. Supervisor Trigger

Supervisor NICHT nach jedem Turn starten.

Zuerst reale DSH-Lifecycle-Hooks prüfen.

Bevorzugte Reihenfolge:

1. echter Session-/Segment-End-Hook, falls vorhanden
2. vor einer echten Context-Compaction, falls dafür ein Hook existiert
3. ansonsten konfigurierbarer Checkpoint nach mehreren vollständigen LK↔Companion-Paaren

Für MVP ist ein Checkpoint nach ungefähr sechs vollständigen Paaren akzeptabel.

Der Wert muss konfigurierbar sein.

Speichere/protokolliere mindestens:

- `lastReviewedTurnId`
oder
- einen äquivalenten Review-Cursor

Dasselbe Fenster darf nicht mehrfach als neue Supervisor-Erfahrung gespeichert werden.

Pro Session höchstens ein Supervisor-Job gleichzeitig.

---

# 16. Supervisor asynchron zum Teacher-Response-Pfad

Die Lehrkraft darf nicht auf die Supervisor-Auswertung warten müssen.

Ablauf:

Teacher → Companion → Antwort an UI

danach bzw. über vorhandenen Background-Mechanismus:

Supervisor → Validation → Interaction Memory

Verwende dafür den tatsächlich vorhandenen DSH-Background-/Subagent-Mechanismus.

Keine selbst erfundene Job-Infrastruktur hinzufügen, wenn DSH das bereits unterstützt.

---

# 17. Interaction Memory in den Companion einbinden

Der Companion erhält zusätzlich einen kleinen Kontextblock:

`PTS COLLABORATION MEMORY — advisory only`

Beispiel:

- When the framing question is still open, prefer mirroring before proposing methods.
- When concrete variants are explicitly requested, concrete alternatives have been helpful.
- Avoid several reflective questions in succession when the discussion is already looping.

Dieser Kontext:

- ist advisory
- ist kein Systemgesetz
- darf aktuelle Teacher-Anweisungen niemals überstimmen
- darf PTS-Domainzustand niemals überstimmen

Explizite Prompt-Regel:

"Current teacher intent overrides collaboration memory."

---

# 18. Noch kein OpenJEV-Zwang

Die Implementierung darf OpenJEV vorbereiten, aber nicht davon abhängig sein.

Falls bereits ein Decision Gate existiert, darf Collaboration Memory dort zusätzlich verfügbar gemacht werden.

Falls OpenJEV noch nicht integriert ist:

Memory zunächst direkt als klar markierten Companion-Kontext bereitstellen.

Keine OpenJEV-Implementierung als Nebeneffekt dieses Tasks beginnen.

---

# 19. Optional nach funktionierendem MVP: Collaboration Playbook

ERST nachdem Project Memory, Supervisor und Interaction Recall stabil funktionieren:

Prüfe die Hindsight Mental-Model-Funktion.

Erzeuge optional ein Mental Model:

Name:

`collaboration-playbook`

Frage sinngemäß:

"What recurring interaction patterns should the PTS Companion consider when collaborating with the teacher in this workspace? Focus exclusively on Companion behavior, triggering conditions, evidence and uncertainty. Do not infer teacher personality or make pedagogical decisions."

Das Playbook kann nach Observation-Consolidation aktualisiert werden.

Es soll vorzugsweise einmal pro Session geladen/gecached werden und nicht für jeden Turn neu per LLM erzeugt werden.

Diese Erweiterung klar getrennt committen.

Wenn sie den MVP unnötig kompliziert macht, zunächst weglassen.

---

# 20. Privacy

Hindsight-Verbindung und LLM-Konfiguration dürfen keine Provider fest in den Code schreiben.

PTS muss mit lokalem Hindsight funktionieren.

Wenn bereits ein Privacy-/Sensitive-Data-Gate existiert:

Memory-Retain muss diesen Gate-Pfad respektieren.

Wenn noch kein Gate vorhanden ist:

keine große Privacy-Infrastruktur in diesem Task neu bauen.

Stattdessen:

- Schnittstelle/Hook dafür sauber lassen
- keine Secrets loggen
- Hindsight lokal konfigurierbar halten
- dokumentieren, an welcher Stelle der Privacy Gate vorgeschaltet wird

Hindsight Memory Defense kann ergänzend genutzt werden, ersetzt aber nicht die PTS-Privacy-Policy.

---

# 21. Fehlerverhalten

Hindsight ist für den Companion nicht mission-critical.

Folgende Fälle müssen graceful degradieren:

- Hindsight nicht gestartet
- Hindsight Timeout
- Retain schlägt fehl
- Recall schlägt fehl
- Supervisor-Modell schlägt fehl
- Supervisor liefert invalides JSON
- Supervisor liefert keine Memory Candidates

In allen Fällen muss der normale Companion weiter funktionieren.

Keine bestätigte PTS-Domainoperation darf wegen Hindsight fehlschlagen.

---

# 22. Tests

Implementiere automatisierte Tests mindestens für folgende Fälle.

## A. Authority Boundary

Ein Hindsight-Memory behauptet:

"Use debate as the main method."

Der kanonische Denkstand enthält etwas anderes.

Erwartung:

PTS-Denkstand bleibt unverändert.

Memory kann höchstens advisory im Prompt erscheinen.

## B. Tentative Idea

Teacher sagt:

"Vielleicht könnte Gottesbild ein Zugang sein."

Erwartung:

kein PTS-Decision-Write.

## C. Confirmed Decision

Ein existierender teacher-confirmed Decision-Event wird historisch retained.

Erwartung:

Hindsight enthält die Information.

Die ursprüngliche Decision bleibt kanonische Quelle.

## D. Premature Solutioning

Gespräch enthält mehrfach:

Companion schlägt Methoden vor.

Teacher kehrt zur noch offenen Kernfrage zurück.

Erwartung:

Supervisor darf einen evidenzgestützten Memory Candidate erzeugen.

## E. Concrete Help Requested

Teacher fragt ausdrücklich:

"Welche drei Methoden wären geeignet?"

Companion nennt Varianten.

Teacher arbeitet damit weiter.

Erwartung:

Supervisor darf dies als hilfreiche Konkretisierung erkennen.

Er darf NICHT daraus "Teacher likes methods" ableiten.

## F. Conversation Loop

Mehrere nahezu identische Companion-Fragen führen zur Wiederholung.

Erwartung:

loop/repetition Signal möglich.

## G. No Pattern

Normales kurzes Gespräch ohne erkennbares wiederkehrendes Muster.

Erwartung:

`memoryCandidates: []`

ist gültig.

## H. Invalid Supervisor Output

Supervisor nennt nicht existierende Turn IDs.

Erwartung:

Candidate wird verworfen.

## I. Hindsight Offline

Hindsight ist nicht erreichbar.

Erwartung:

Companion antwortet weiterhin normal.

## J. Domain Integrity

Nach Supervisor- und Hindsight-Läufen müssen unverändert bleiben, sofern die Lehrkraft nicht explizit eine bestehende PTS-Domainaktion ausgelöst hat:

- Decisions
- Denkstand
- LearningMoment Store
- Teaching Product

---

# 23. Integrationstest im realen PTS-Flow

Nach Unit-/Contract-Tests einen echten PTS-Flow testen.

Bevorzugter bestehender Abnahme-Denkraum:

`KI und Gott`

Keine neuen Demo-Sonderwege bauen.

Test:

Session A:

- mehrere offene Überlegungen
- Companion bietet zu früh Lösung an
- Teacher lenkt zurück

Supervisor läuft.

Interaction Memory entsteht.

Session B:

Companion lädt Collaboration Memory.

Verifiziere technisch, dass der advisory Kontext im Companion-Kontext vorhanden ist.

Nicht versuchen, über exakt formulierte Modellantworten einen deterministischen Behavior-Test zu bauen.

Wir testen die Architektur und Context Injection, nicht die exakte Textgenerierung des LLM.

---

# 24. Observability

Für Entwicklung mindestens loggen:

- workspace memory bank selected
- project retain success/failure
- project recall count
- supervisor started/completed/failed
- supervisor window identifiers
- number of signals
- number of accepted/rejected memoryCandidates
- interaction retain success/failure

Keine vollständigen privaten Conversation-Inhalte ins normale Log schreiben.

IDs und Counts reichen.

---

# 25. Keine neue Teacher-UI in diesem Task

Dieser Task soll zunächst die Architektur beweisen.

Nicht nebenbei bauen:

- Memory Dashboard
- Memory Editor
- Supervisor Dashboard
- neue Whiteboard-UI
- neue Teaching-Product-UI

Hindsight-eigene Debug-/Admin-Oberfläche kann für Entwicklung verwendet werden.

Eine spätere PTS-Transparenz-/Forget-UI ist ein eigener Task.

---

# 26. Erwartete Modulgrenzen

Passe die Pfade an die tatsächlich bestehende Pluginstruktur an.

Logische Verantwortlichkeiten sollen aber ungefähr sein:

`memory/client`
Hindsight API Adapter

`memory/banks`
Bank IDs und Bank-Konfiguration

`memory/project`
Project retain / recall

`memory/context`
Companion Context Injection

`supervisor/prompt`
Supervisor-Systemprompt

`supervisor/schema`
Runtime Output Validation

`supervisor/policy`
Interaction-only Policy

`supervisor/runner`
Subagent-Orchestrierung

`supervisor/memory`
validiertes Ergebnis → Interaction Bank

Keine zyklische Abhängigkeit zur PTS-Domain einführen.

---

# 27. Commit-/Arbeitsreihenfolge

Arbeite in kleinen Schritten.

1. Architektur-/Extension-Point-Discovery dokumentieren.
2. Hindsight Adapter + Mock Tests.
3. Workspace Banks.
4. Project retain.
5. Project recall + Companion Context.
6. Supervisor Schema + Policy Tests.
7. Supervisor Prompt.
8. Supervisor Runner ohne Hindsight Write.
9. validiertes Interaction retain.
10. Interaction Context Injection.
11. Lifecycle/Checkpoint Wiring.
12. Realer E2E-Test.
13. optional Collaboration Mental Model.

Nach jedem Schritt bestehende Tests ausführen.

Keine große Rewrite-Änderung.

---

# 28. Definition of Done

Der Task ist abgeschlossen, wenn folgendes demonstriert werden kann:

1. PTS kann ohne Hindsight unverändert weiterarbeiten.

2. Mit aktivem Hindsight werden semantische LK↔Companion-Austausche workspacebezogen gespeichert.

3. Relevantes historisches Project Memory kann in einen späteren Companion-Turn eingebunden werden.

4. Ein separater Supervisor kann einen Gesprächsabschnitt retrospektiv analysieren.

5. Der Supervisor besitzt keine Domain-Write-Tools.

6. Supervisor-Ausgaben werden schema- und policy-validiert.

7. Nur akzeptierte Interaction-Memories werden gespeichert.

8. Diese Memories können in einem späteren Gespräch als advisory Collaboration Memory erscheinen.

9. Keine Hindsight- oder Supervisor-Operation kann automatisch LearningMoment, Decision, Denkstand oder Teaching Product verändern.

10. Mindestens ein realer Cross-Session-Test im bestehenden PTS-Workspace ist dokumentiert.

Am Ende einen kurzen Handoff liefern:

- geänderte Dateien
- verwendete DSH-Hooks
- Hindsight-Konfiguration
- Bank-ID-Schema
- Supervisor-Trigger
- Tests + Ergebnisse
- bekannter Rest
- Empfehlung, ob das optionale `collaboration-playbook` als nächster Schritt sinnvoll ist

WICHTIG:

Wenn während der Implementierung eine Annahme über DSH, Hindsight oder die aktuelle PTS-Struktur nicht stimmt, nicht mit einer erfundenen Ersatzarchitektur weitermachen.

Stattdessen die reale vorhandene API verwenden und die Abweichung im Handoff dokumentieren.