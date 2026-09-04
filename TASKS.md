# Pedagogical Thinking Space – Aktuelle Aufgaben

Statusübersicht der laufenden und offenen Arbeit. Historische Phasen (K1–K4,
Service-Request-Ära) sind abgeschlossen oder durch die DSH-native Architektur
ersetzt — siehe `ARCHITECTURE.md` unter „Deliberately absent“ (kein
Service-Request-Queue, kein Capability-Registry, kein PTS-Dispatcher).

## Implementiert (Stand)

- [x] Planning Board (`planning-board.yml`) ersetzt Legacy `service-requests/`.
- [x] Denkraum-Scaffold ohne `service-requests/` (pts-workspaces).
- [x] Background Steward pflegt den Denkstand nach abgeschlossenen Turns:
  - `learning-design.md` (Abschnitte),
  - `learning-landscape.md` (Lernmomente als vollständige Entwürfe, Status `draft`),
  - `decisions.yml` (nur bei belegter Lehrkraftentscheidung),
  - `planning-board.yml` (höchstens ein Vorschlag pro Lauf),
  - `temporal-plan.yml` (Fenster/Platzierungen nur als Vorschlag,
    Status `proposed`, siehe Steward-Policy).
- [x] Skill-Bibliothek `skills/<id>/SKILL.md` mit Rolle↔Skill-Matrix
      (pts-skill-manager).
- [x] Denkstand-Tab (pts-denkstand) rendert Planning Board und Timeline.

## Offen / in Arbeit

- [ ] Memory- und Knowledge-Pflege umsetzen: gepflegtes Wissen und lokale
      Lehrer-Erfahrung sollen allen künftigen Projekten zur Verfügung stehen —
      Konzept: `docs/CONCEPT_MEMORY_AND_KNOWLEDGE.md`.
- [x] Web-Workflow Stufe 1: Lernlandschaft-View (Moment-Karten, layout.json,
      Übergänge, Status-Badges) + Artefakt-Editor mit Save-Route
      (`dsh-plugins/pts-landscape`, Patch-Row im pts-web-Profil aktiv).
- [x] Web-Workflow Stufe 2+3: Material↔Moment-Zuordnung,
      Drag&Drop-Stundenzuordnung (Platzierungen, `proposed`→`binding`),
      „Stundenverlauf vorschlagen“ (Prompt in Chat-Composer) — ebenfalls in
      `dsh-plugins/pts-landscape`.
- [ ] Web-Workflow Stufe 4: Offene-Fragen-Panel, „Nächster Schritt“-Karte,
      Dokument-Buttons nach Turns — Konzept: `docs/CONCEPT_WEB_WORKFLOW.md`.
- [ ] Bestehende Denkräume auf gefüllte Lernlandschaft und Timeline-Vorschläge
      nachziehen.
- [ ] Maschinenlesbare Validierung für Learning Landscape und Planning Board.
- [ ] Review-Kriterien für geänderte Knoten, Übergänge und Zeitplatzierungen.
- [ ] Beispiel-Landschaften (linear, Stationen/Buffet, Projekt/Hybrid).
- [ ] Tests: ungültige Referenzen, Zyklen und unbestätigte Vorschläge dürfen
      nie die kanonischen Dateien verändern.
