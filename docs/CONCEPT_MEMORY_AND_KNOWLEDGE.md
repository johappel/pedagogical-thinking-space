# Konzept: Pflege von Local Memory und Knowledge

> Ziel: Lokale Lehrer-Erfahrung (`memory.local/`) und kuratiertes Wissen
> (`knowledge/`) werden systematisch gepflegt und stehen **allen künftigen
> Projekten** zur Verfügung — ohne einen zweiten Registry-, Dispatcher- oder
> Job-Mechanismus (Architektur-Guard, siehe `AGENTS.md` und `ARCHITECTURE.md`).

---

## 1. Ausgangslage

Die konzeptionellen Grundlagen existieren bereits:

- `services/MEMORY.md` — Epistemic Separation (Observation, Reported
  Statement, Interpretation, Hypothesis, Open Question), Memory Spaces
  (Project / Teaching / Reflection / Pattern), Konsent- und
  Datenschutzregeln.
- `services/KNOWLEDGE.md` — Knowledge als „Living Wiki“, OKF-Kompatibilität
  (Markdown + YAML-Frontmatter), Kuration statt roher Websuche.
- `knowledge/README.md` — Proposal-Flow: Konversation/Service-Ergebnis →
  Proposal → Review → kuratiertes `knowledge/`; `_incoming/` für Importe.
- `specs/KNOWLEDGE_PROPOSAL_TEMPLATE.md` — Vorlage für Knowledge-Proposals.
- `pts-background-steward` — pflegt nach abgeschlossenen Turns reversible
  Denkstand-Vorschläge (Vorbild für Vorschlagsmechanik).
- `pts-workspace-snapshot` (Preset-Plugin) — injiziert pro Turn einen
  kompakten Denkstand in den Companion-System-Prompt (Vorbild für
  Verfügbarkeit über Projekte hinweg).
- `pts-skill-manager` — Import/Review/Matrix-UI (Vorbild für einen
  Pflege- und Review-Flow).

**Die Lücke:** `memory.local/` existiert nirgends, `knowledge/` ist ein leeres
Skelett, und kein Mechanismus macht Projekterfahrung zu wiederverwendbarem
Wissen oder bringt kuratierten Bestand in neue Sessions.

## 2. Speicherorte und Lebenszyklus

### 2.1 Local Memory (`memory.local/`, Repo-Root, gitignored, privat)

```text
memory.local/
  proposals/     # Steward-Entwürfe, noch nicht geprüft
  curated/       # von der Lehrkraft übernommene Einträge
  log.md         # Änderungsprotokoll (Revision statt Überschreiben)
```

- Ein Eintrag folgt dem Mindestrecord aus `services/MEMORY.md`
  (`context`, `epistemic_entries`, `action_or_intervention`, `learning`,
  `privacy`, `consent`).
- **Nur Vorschläge automatisch:** Der Steward legt nach Turns höchstens
  Entwürfe in `proposals/` ab (z. B. wenn die Lehrkraft eine
  Erfahrung/Beobachtung explizit als merk-würdig markiert).
- **Langzeit-Speicherung nur mit erkennbarer Lehrkraft-Entscheidung**
  (AGENTS.md „Pedagogical protection“); die Lehrkraft kann jederzeit
  Konfidenz senken, Ausnahmen ergänzen, Transferbedingungen einschränken
  oder löschen (`log.md` erhält die Revision).

### 2.2 Knowledge (`knowledge/`, getrackt, kuratiert, geteilt)

```text
knowledge/
  _incoming/      # Importe, noch ungeprüft (gitignored)
  _proposals/     # Review-Puffer für wiederverwendbares Wissen (gitignored)
  curricula/ didactics/ methods/ concepts/ sources/   # kuratiert, getrackt
  index.md        # Einträge mit Tags für projektübergreifende Suche
```

- Jeder kuratierte Eintrag trägt OKF-Frontmatter (`type`, `title`, `tags`,
  `generated`, `verified`, `sources`) plus Quellenbelege und
  Unsicherheitsangaben.
- **Adoption in kuratiertes `knowledge/` nur nach sichtbarer
  Lehrkraft-Entscheidung** — ein Proposal wird nie automatisch kuratiert.

## 3. Wer pflegt: Rollen und Ablauf

```text
Gespräch / Worker-Ergebnis
  → Steward: Memory- oder Knowledge-Vorschlag (Entwurf, nie kuratiert)
  → pts_review: prüft (Mandat, Quellen, Risiken, Datenschutz)
  → Lehrkraft: entscheidet sichtbar („merken“, „übernehmen“, „verwerfen“)
  → pts_edit: übernimmt in memory.local/curated bzw. knowledge/<Kategorie>
  → End-of-Project-Review: „Was bleibt wiederverwendbar?“ → neue Vorschläge
```

- **Steward:** schreibt ausschließlich Entwürfe in die jeweiligen
  Proposal-Bereiche; er kuratiert nie, entscheidet nie über pädagogische
  Richtung und fasst Memory/Knowledge nicht an (bestehende Persona-Grenze
  wird für die Proposal-Bereiche geöffnet).
- **Review:** `pts_review` bleibt read-only; Quellen- und
  Datenschutzprüfung vor Adoption.
- **Adoption:** nur über erkennbare Lehrkraft-Entscheidung — im Gespräch
  (z. B. „Merke dir das“) oder über eine spätere Pflege-UI.
- **Herkunft bleibt sichtbar:** jeder Eintrag führt Projektbezug, Belege und
  Konfidenz mit; Memory-Einträge bleiben von Knowledge-Einträgen getrennt.

## 4. Verfügbarkeit für alle künftigen Projekte

Neues Preset-Plugin **`pts-knowledge-snapshot`** (analog
`pts-workspace-snapshot`):

- Injiziert pro Turn einen **kompakten, read-only Ausschnitt** passender
  kuratierter Einträge in den System-Prompt des Companions — Treffer über
  Tag-/Stichwort-Abgleich (Titel/Tags des Denkraums gegen `index.md` und
  `memory.local/curated/`).
- Der Companion kann so frühere Erfahrung und geprüftes Wissen einbringen
  („Das erinnert an …“, „Dazu gibt es einen geprüften Eintrag …“), ohne
  selbst zu suchen oder zu schreiben.
- Kein zweiter Registry-, Index- oder Routing-Mechanismus: Injektion +
  bestehende Worker-Tools. Ein gezielter Lookup (z. B. `pts_knowledge`) ist
  optional und erst bei Bedarf zu bauen.

## 4a. Wissens-Wiki und Suche (Lehrkraft-Perspektive)

Statt eines Verwaltungs-Tabs (analog Skills-Matrix) bekommt die Lehrkraft zwei
klare Flächen — Wissen wächst schnell und wird wie ein lebendes Wiki genutzt:

- **Wiki (suchen und browsen):** Ein „Wissen“-Tab mit Suchfeld über
  `knowledge/index.md` (Tags/Titel) und Volltext in den kuratierten Einträgen
  (read-only Host-Route, wie `pts-denkstand` sie nutzt — kein zweiter Index).
  Einträge sind kompakte OKF-Dateien mit Tags und Querverweisen (Living Wiki
  aus `services/KNOWLEDGE.md`), `index.md` ist die Navigations-Hub.
- **Vorschlags-Queue (nur Lehrkraft entscheidet):** Neue Proposals landen als
  Liste (aus `knowledge/_proposals/` und `memory.local/proposals/`); die
  Lehrkraft sieht Quelle, Konfidenz und Quellen und wählt „Übernehmen“,
  „Überarbeiten“ oder „Verwerfen“. Nichts fließt automatisch ins Wiki.

Zusätzliche Such-Ebene für den Companion/Worker (DSH-nativ, kein Registry):

- **`pts_knowledge`-Lookup-Tool** (Tool-Subagent, read-only `grep`/`glob`/
  `read` über `knowledge/` und `memory.local/curated/`): gezielte Rückfragen
  wie „Was wissen wir über adaptives Lernen?“ liefern kuratierte Treffer mit
  Quellen und Konfidenz zurück.
- Der `pts-knowledge-snapshot`-Headroom injiziert pro Turn nur den kompakten,
  tag-gematchten Ausschnitt; für Tiefe startet der Companion den Lookup.

## 5. Grenzen und Schutz

- `memory.local/` wird nie in `knowledge/` importiert (privat vs. geteilt,
  siehe `knowledge/README.md`).
- Nichts wird automatisch kuratiert; Vorschläge bleiben Vorschläge.
- Keine system-generierten Diagnosen, keine identifizierbaren
  Lerngeschichten ohne Zweck und Zustimmung (`services/MEMORY.md`,
  Privacy-Sektion).
- Memory unterstützt die gegenwärtige Deutung der Lehrkraft, ersetzt sie nie
  („Memory is not an authority over the present interpretation“).
- Die persönliche OKF-Bibliothek unter `F:\knowledge` (Skills `belegen`,
  `wissensdokumentar`) bleibt eine separate Bibliothek außerhalb des Repos;
  dieses Konzept ist OKF-kompatibel, importiert dort aber nicht automatisch.

## 6. Umsetzungsschritte

1. **Phase 1 — Struktur + Vorschlagsmechanik:** `memory.local/`-Bereiche
   anlegen (gitignored, bereits im `.gitignore`), Steward um Vorschlags-Ops
   erweitern (`propose-memory-record`, `propose-knowledge-entry`), Schema
   (`specs/STEWARDSHIP_RESULT_SCHEMA.md`) und Tests.
2. **Phase 2 — Sichtbarkeit über Projekte:** `pts-knowledge-snapshot`-Plugin
   (Headroom-Injektion), Einträge in `knowledge/index.md` pflegen.
3. **Phase 3 — Wiki + Review-UI:** „Wissen“-Tab (Suche/Browse) und
   Vorschlags-Queue (Übernehmen/Überarbeiten/Verwerfen) wie in §4a; jährlicher/
   projektabschließender Review-Flow.
4. **Phase 4 — Optional:** gezielter Worker-Lookup `pts_knowledge`, wenn ein
   realer Bedarf entsteht.

## 7. Abgrenzung zu bestehenden Mechanismen

| Mechanismus | Zuständig für |
| --- | --- |
| `pts-workspace-snapshot` | aktueller Denkstand (Status, Board, Entscheidungen) |
| `pts-knowledge-snapshot` (neu) | kuratiertes Wissen + lokale Erfahrung über Projekte hinweg |
| Steward-Vorschläge | reversible Entwürfe nach Turns |
| `pts_review` / `pts_edit` | Prüfung und Übernahme nach Lehrkraft-Entscheidung |
