Dieser Auftrag korrigiert dagegen drei Architekturannahmen, die seit dem letzten weiterentwickelt wurden.

# 1. Die Architektur-Dokumentation wurde geändert:

`docs/architecture/TEACHING_PRODUCT_MIGRATION.md`

Die vorhergegnde Version enthält überholte Aussagen:

- Focus Context bedeute „gleicher Chat“;
- ein Fokuswechsel erzeuge grundsätzlich keine Session;
- „Moment-Werkstatt“ und „Landkarte reduzieren“ seien getrennte Arbeitspakete;
- Übergänge der Lernlandschaft sollten primär erhalten bleiben;
- der Prompt-Snapshot sei bereits vollständig Teil der Ist-Architektur.

# 2. Persistente gegenstandsbezogene Conversation-Threads

Die bisherige Implementierung von `focus-context.mjs` ist als alleinige Gesprächsarchitektur nicht ausreichend.

Aktuell ist der Fokus:

- nur In-Memory;
- an die bestehende Session gebunden;
- maximal 12 Stunden gültig;
- beim Agent-Dispose verloren;
- ausdrücklich ohne eigene persistente Conversation-History.

Das soll geändert werden:

## Zielmodell

Ein Workspace besitzt weiterhin einen gemeinsamen kanonischen Denkstand, darf aber mehrere persistente DSH-Conversation-Threads besitzen.

Beispiel:

```text
Workspace
│
├── allgemeines Gespräch
│
├── Conversation zu moment:lm-perspektive
├── Conversation zu moment:lm-einstieg
├── Conversation zu phase:phase-1
└── Conversation zu material:materials/impuls.md
```

Ein gegenstandsbezogener Thread:

- gehört zum selben PTS-Workspace;
- erzeugt keinen Sub-Workspace;
- erhält keine eigene pädagogische Datenwahrheit;
- besitzt aber eine eigene persistente Conversation-History;
- kann geschlossen und später wieder aufgenommen werden;
- verwendet beim Weiterdenken den aktuellen Workspace-Zustand über den Prompt Snapshot;
- schreibt Ergebnisse weiterhin über `pts_edit` beziehungsweise die vorhandenen fachlichen Domain-Routen in den gemeinsamen Workspace.

Gesprächshistorien verschiedener Threads dürfen nicht automatisch ineinander kopiert werden.

## DSH-native Umsetzung zuerst prüfen

Bevor neue Persistenz gebaut wird, untersuche die tatsächlich installierten DSH-Primitiven für:

- Sessions;
- Conversation-Tabs;
- Session-Erzeugung;
- Session-Wiederaufnahme;
- Session-Metadaten;
- Navigation zwischen Sessions/Views.

Nutze nach Möglichkeit ausschließlich die bestehende DSH-Session-/Conversation-Persistenz.
(https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/persistence)



Baue keinen eigenen PTS-Chat-Speicher und keine parallele Message-Datenbank.

Falls DSH keine ausreichende persistente Zuordnung `Workspace-Objekt -> Conversation Session` anbietet, implementiere nur eine minimale technische Registry für diese Zuordnung. Diese Registry ist technische Metadatenhaltung und keine kanonische pädagogische Datei. 

Sie darf insbesondere nicht in:

- `learning-landscape.md`,
- `teaching-product.json`,
- `decisions.yml`

als fachlicher Inhalt gespeichert werden.

Dokumentiere in diesem Fall, welche DSH-Funktion konkret fehlt.

# 3. Conversation Binding und Focus Context trennen

Führe konzeptionell zwei unterschiedliche Dinge:

```text
Conversation Binding
= Welcher persistente Conversation-Thread gehört zu welchem Gegenstand?

Focus Context
= Welcher Gegenstand liegt in diesem Thread/Turn gerade auf dem Tisch?
```

Der Focus Context darf weiterhin ein Laufzeitkontext sein.

Er darf aber nicht mehr dafür verantwortlich sein, die Persistenz der gegenstandsbezogenen Unterhaltung zu simulieren.

Ein Thread zu

`moment:lm-perspektive`

muss nach Wiederöffnung automatisch wieder wissen, dass sein primärer Gegenstand `lm-perspektive` ist.

Das darf nicht an einem 12-Stunden-TTL hängen.

# 4. UI-Verhalten „Darüber sprechen“

Ändere die bestehenden Aktionen entsprechend.

## Lernmoment öffnen

`Werkstatt`

öffnet die Werkstattansicht des Lernmoments.

Das allein muss noch keinen Conversation-Thread erzeugen.

## Darüber sprechen

Eine bewusste Aktion wie

`Darüber sprechen`

soll:

1. prüfen, ob für `moment:<id>` bereits ein Conversation-Thread existiert;
2. falls ja: diesen wieder öffnen;
3. falls nein: einen neuen DSH-Conversation-Thread im selben Workspace erzeugen;
4. den Thread an den Lernmoment binden;
5. dessen Prompt Snapshot mit dem Lernmoment als primärem Focus Context erzeugen.

Dasselbe Modell soll grundsätzlich auch für:

- lesson,
- phase,
- material,
- question

verwendbar sein.

Erzeuge Threads jedoch nicht prophylaktisch für jedes Objekt.

# 5. Keine Vermischung der Conversation-Historien

Teste ausdrücklich:

```text
Main Conversation
  Nachricht A
  Nachricht B

Moment-Conversation lm-perspektive
  Nachricht C
  Nachricht D
```

Beim Öffnen von `lm-perspektive` müssen C und D wieder sichtbar sein.

A und B dürfen nicht als kopierte Chatnachrichten dort erscheinen.

Der Companion kennt den gemeinsamen aktuellen Denkstand über den Prompt Snapshot, nicht durch Zusammenkopieren aller Chats.

Umgekehrt muss eine kanonische Änderung aus dem Moment-Thread im nächsten Turn des Hauptgesprächs über den aktualisierten Snapshot sichtbar sein.

# 6. Prompt Snapshot als verbindliche Context Projection ausbauen

Der Commit hat bereits eine gute technische Grundlage:

`workspace-snapshot.mjs` erzeugt die System-Prompt-Sektion bei jedem Turn neu.

Erhalte dieses Verhalten.

Entwickle den Snapshot aber von einem allgemeinen Workspace-Dump zu einer fokusbezogenen Context Projection weiter.

## Grundregel

```text
                 LESEN

Workspace ──→ Prompt Snapshot ──→ Companion
                                  │
                                  │ pts_edit
                                  ▼
Workspace ←──── Domain Store ←────┘

                SCHREIBEN
```

Der Snapshot ist keine kanonische Datei und wird nicht zurückgeschrieben.

## Fokusbezogene Auswahl

Bei `moment`:

- vollständiger fokussierter Lernmoment;
- didaktische Funktion;
- offene Fragen;
- relevante Materialien;
- Phasen des Teaching Product, die diesen Moment referenzieren;
- unmittelbar relevante Entscheidungen.

Bei `phase`:

- Phase;
- zugehörige Stunde;
- referenzierte Lernmomente;
- konkrete Materialverwendungen;
- offene Fragen;
- offene Produktvorschläge, soweit relevant;
- relevante Entscheidungen.

Bei `lesson`:

- Stunde und ihre Phasen;
- Status/Lücken;
- relevante Vorschläge und Entscheidungen.

Bei `material`:

- Materialidentität/Metadaten;
- Lernmomente und Phasen, die es referenzieren;
- relevante offene Fragen.

Der allgemeine Workspace-Überblick bleibt kompakt verfügbar.

Nicht bei jedem Turn pauschal die komplette Unterrichtsreihe und alle Workspace-Inhalte in voller Länge injizieren.

Ersetze starre `slice(0, 12000)`-/`slice(0, 6000)`-Logik möglichst durch nachvollziehbare Abschnittsbudgets und Prioritäten. Falls gekürzt wird, muss dies im Snapshot erkennbar sein.

Revisionen beziehungsweise relevante Source-Hashes müssen erhalten bleiben.

Nach erfolgter Teaching-Product-Migration darf `temporal-plan.yml` im Snapshot nur noch als Legacy-Quelle erscheinen, nicht als gleichrangiger aktueller Planungsstand.

Entferne Formulierungen wie:

`gleicher Workspace, gleicher Chat`

aus Snapshot und Architektur.

# 7. Lernlandschaft zur Lernmoment-Werkstatt umbauen

Der Commit entfernt bereits die Stunden-Zuordnung aus der bisherigen Landschaft. Das ist richtig.

Er hält aber noch an Karten-Graph und Übergängen fest. Diese primäre Arbeitsform wird jetzt ersetzt.

## Ziel

Die fachliche Einheit ist der Lernmoment.

Die primäre Ansicht wird ein ruhiges Board nach didaktischen Funktionen, beispielsweise:

```text
Einstieg
Erkunden
Erarbeiten
Vertiefen
Sichern
Transfer
```

Diese Kategorien sind keine Statuswerte wie Todo/In Progress/Done.

Sie bedeuten:

> Welche didaktische Funktion hat dieser Lernmoment gegenwärtig?

Das Funktionsschema muss konfigurierbar bleiben.

Die oben genannten sechs Funktionen sind eine Default-Konfiguration und kein universelles Unterrichtsmodell.

Nutze nach Möglichkeit das bereits vorhandene `function`-Feld der Lernmomente. Erzeuge keine unnötige parallele Moment-Domäne.

Prüfe, wo die konfigurierbare Spaltenordnung mit minimalem Eingriff gespeichert werden kann; bevorzuge bestehende Workspace-/Frontmatter-Strukturen gegenüber einer zusätzlichen kanonischen Datei.

## Drag-and-drop

Drag-and-drop zwischen Board-Spalten:

- verändert ausschließlich die didaktische Funktion des Lernmoments;
- erzeugt keine Unterrichtsphase;
- erzeugt keine Produktverwendung;
- verändert keine zeitliche Platzierung.

## Übergänge

Die bisherige Übergangslogik:

- ist nicht mehr Teil der primären UI;
- darf nicht mehr durch Drag-and-drop zwischen Lernmomentkarten erzeugt werden;
- muss nicht Bestandteil neuer Workspaces sein.

Bestehende Übergangsdaten dürfen gelöscht werden und sind keine Voraussetzung für die neue Lernmoment-Werkstatt.

# 8. Lernmoment und Teaching Product strikt getrennt halten

Weiterhin gilt:

```text
Lernmoment
= pädagogische Möglichkeit

Phase
= konkrete Verwendung im Unterrichtsprodukt
```

Ein Lernmoment kann in mehreren Phasen oder Stunden referenziert werden.

Eine Änderung des Lernmoments darf bestätigte Phasen nicht automatisch verändern.

Materialbeziehungen am Lernmoment sind Möglichkeiten.

Konkrete Materialverwendungen einer Phase gehören zum Teaching Product.

# 9. UI-Flow

Ein zentraler Flow soll künftig so funktionieren:

```text
Lernmoment-Board
→ Lernmoment „Perspektiven vergleichen“
→ Werkstatt
→ Darüber sprechen
→ bestehender oder neuer persistenter Moment-Thread
→ Lernmoment weiterdenken
→ pts_edit / fachliche Route aktualisiert den gemeinsamen Workspace
→ Produktvorschlag entsteht
→ Lehrkraft bestätigt
→ Teaching Product ändert sich
→ Moment-Thread schließen

später:

Lernmoment-Board
→ derselbe Lernmoment
→ Darüber sprechen
→ derselbe Thread mit seiner bisherigen Gesprächshistorie
→ Prompt Snapshot enthält zugleich den inzwischen aktuellen Workspace-/Produktstand
→ Lernmomment archivieren (passt nicht mehr zur Produktentwicklung) → im Board nicht mehr schtbar
```

# 10. Tests anpassen

Der bestehende Browsertest trägt derzeit sinngemäß:

`same conversation/focus`

und bestätigt damit die inzwischen verworfene Architektur.

Ersetze beziehungsweise erweitere ihn.

Mindestens testen:

- allgemeines Gespräch hat eigene History;
- `Darüber sprechen` zu Moment A erzeugt oder öffnet Thread A;
- Thread A enthält seine frühere History nach erneutem Öffnen;
- Moment B erhält einen anderen Thread;
- Rückkehr zu Moment A öffnet wieder Thread A;
- keine automatische History-Vermischung A/B/Main;
- alle Threads verwenden denselben Workspace;
- Änderung im Moment-Thread erscheint im folgenden Snapshot des Hauptthreads;
- Reload beziehungsweise DSH-Wiederöffnung erhält die Zuordnung, soweit DSH-Sessions dies nativ garantieren;
- ungültiger/deleteter Gegenstand erzeugt einen verständlichen Fehler;
- Phase und Material verwenden dieselbe generische Binding-Logik;
- Focus Context bleibt zwischen unterschiedlichen aktiven Sessions isoliert.

Für die Lernmoment-Werkstatt testen:

- Default-Spalten;
- konfigurierbare Funktionen;
- Drag-and-drop ändert nur `function`;
- Drag-and-drop erzeugt keine Phase;
- Übergänge werden in der primären UI nicht mehr erzeugt;
- bestehender Legacy-Workspace mit Übergängen bleibt lesbar.

Für den Prompt Snapshot testen:

- Neubildung bei jedem Turn;
- unterschiedliche Projektion für Moment- und Phasenfokus;
- Änderung eines kanonischen Artefakts ist im nächsten Turn sichtbar;
- relevante Referenzen werden aufgenommen;
- irrelevante große Bereiche werden nicht pauschal injiziert;
- keine Freigabe wird aus dem Snapshot abgeleitet.

# 11. Navigation nicht global koppeln

Prüfe das derzeitige modulglobale

`focusNavigation`

in `pts-landscape/lib/client.js`.

Mit mehreren Conversation-Sessions darf Navigation nicht versehentlich die zuletzt gerenderte fremde Session verwenden.

Nutze DSH-eigene View-/Session-Navigation oder eine sauber sessiongebundene Struktur.

# 12. Bereinigung

Entferne die committed Datei:

`.tmp-reduce-client.py`

Sie ist ein temporäres Transformationsskript und gehört nicht zum dauerhaften Produktcode.

Prüfe auf weitere einmalige Patch-/Migrationshilfsdateien derselben Art.

# 13. Architektur-Arbeitspakete konsolidieren

In `TEACHING_PRODUCT_MIGRATION.md`:

- Prompt Snapshot / Context Projection als eigenes Arbeitspaket aufführen;
- Companion danach;
- Generischer Focus/Conversation Binding entsprechend korrigieren;
- die bisherigen separaten Punkte `Moment-Werkstatt` und `Landkarte reduzieren` zu einem Arbeitspaket `Lernmoment-Werkstatt` zusammenführen;
- `Dokumentation/Abnahme` entsprechend neu nummerieren.

Der zentrale E2E darf nicht mehr formulieren:

`gleicher Workspace, gleicher Chat`

sondern:

`gleicher Workspace, gegenstandsbezogener persistenter Conversation-Thread, gemeinsamer kanonischer Denkstand`.

# 14. Nicht verändern

Nicht neu erfinden:

- Teaching-Product-Schema ohne konkreten Grund;
- Product Proposal / Acceptance Gate;
- explizite Teacher Readiness;
- Domain Store;
- Legacy-Migrationsschutz;
- Worker-Lifecycle;
- eigener Dispatcher;
- eigener Chat-/Message-Store;
- Sub-Workspaces für Lernmomente.

# 15. Handoff

Beende mit:

1. welche DSH-Primitiven für persistente Conversation-Threads gefunden wurden;
2. wie die Binding-Identität definiert ist;
3. wo diese Zuordnung persistiert;
4. wie Main-/Moment-/Phase-/Material-Conversations getrennt werden;
5. wie der Prompt Snapshot pro Fokus zusammengestellt wird;
6. wie die Lernmoment-Funktionen konfiguriert werden;
7. Umgang mit Legacy-Übergängen;
8. geänderte Dateien;
9. ausgeführte Unit-/Integration-/Browsertests;
10. was nur mit einer echten laufenden DSH-Instanz abgenommen werden kann.

Keine autonome Modellqualität aus deterministischen Test-Fixtures ableiten.