# PTS vNext – Domain Model

> **Status:** Arbeitsfassung, 2026-09-09.  
> Ziel dieses Dokuments ist eine möglichst kleine, stabile Objektwelt. Pädagogische Taxonomien werden nicht vorschnell in feste Core-Typen verwandelt. Persistenzformat und Dateistruktur bleiben zunächst offen.

## 1. Grundsätze

### 1.1 Wenige stabile Core-Objekte

PTS vNext modelliert nur Dinge als eigene Core-Objekte, wenn sie eine eigene Identität, eigene Beziehungen oder eigene Operationen brauchen.

Ein Gedanke muss nicht erst klassifiziert werden, um im Denkraum existieren zu dürfen.

> **Erst frei erfassen, dann bei Bedarf typisieren.**

### 1.2 Stabile Identität vor Darstellung

Jedes referenzierbare Objekt besitzt eine stabile PTS-ID. Die ID ist unabhängig von Dateipfad, Panel, Sortierung oder aktueller Darstellung.

Beispiele:

```text
note:hoffnungsgaerten
asset:hoffnungsbild-07
collection:hoffnungsbilder
moment:hoffnung-trotzdem
frame:biblischer-faden
lesson:stunde-03
phase:stunde-03-vertiefung
decision:hoffnung-in-stunde-03
journal:beobachtung-handlungsfaehigkeit
snapshot:2026-09-09-01
```

Optional kann eine kanonische interne URI verwendet werden:

```text
pts://hoffnung/moment/hoffnung-trotzdem
```

### 1.3 Beziehungen sind Referenzen, keine Kopien

Objekte referenzieren andere Objekte über stabile IDs. Ein Material, eine Recherche oder eine Note darf in mehreren Zusammenhängen verwendet werden, ohne dupliziert zu werden.

Semantisch relevante Beziehungen werden strukturiert gespeichert. Freie Markdown-Links bleiben zusätzlich möglich.

Beispiel:

```text
phase:stunde-03-vertiefung
  realizes -> moment:hoffnung-trotzdem
  uses     -> asset:roemer-4-18
```

### 1.4 Provenienz gehört zu Änderungen, nicht in pädagogische Inhalte

Wer etwas geändert hat, wann und in welchem Gespräch, wird über Domain Operations und Change Log nachvollziehbar. Inhaltliche Objekte müssen deshalb nicht mit technischen Audit-Feldern überladen werden.

---

## 2. Root: Workspace

Ein `workspace` ist der lokale Denkraum eines Vorhabens. Er setzt den Namensraum für Objektidentitäten und Beziehungen.

Er enthält bzw. adressiert:

- referenzierbare Domain Objects;
- ihre Beziehungen;
- Whiteboard-Zustand;
- Teaching Product;
- Denkstand-Projektion;
- Companion-Journal;
- Snapshots;
- Conversation-Bindings;
- lokale Taxonomien;
- referenzierte Memory-/Knowledge-/Skill-Kontexte, soweit relevant.

Der Workspace selbst kann einen Titel und minimale Metadaten besitzen, ist aber nicht das pädagogische Inhaltsmodell.

---

## 3. Content Objects

### 3.1 `note`

Die `note` ist das kleinste frei formulierbare Inhaltsobjekt.

Minimal:

```text
id
markdown content
```

Optional:

```text
title
facets / tags
references
preference (+ / neutral / -)
```

Eine Note darf alles enthalten, was sinnvoll in Markdown passt:

- spontane Idee;
- Gesprächserkenntnis;
- Kompetenzformulierung;
- Methodenidee;
- Materialidee;
- Forschungsnotiz;
- offene Frage;
- fachliche Erläuterung;
- kurze Reflexion.

Markdown darf normale Links und stabile PTS-Referenzen enthalten.

Beispiel:

```markdown
Idee: Hoffnungsgärten bauen.

Könnte später zu [Hoffnung wird handlungsfähig](pts://hoffnung/moment/hoffnung-handlungsfaehig) passen.
```

Eine Note braucht keine Pflicht-Taxonomie und darf dauerhaft unklassifiziert bleiben.

---

### 3.2 `asset`

Ein `asset` ist eine Datei oder ein dateiförmiges Ergebnis mit stabiler Identität und Provenienz.

Beispiele:

- Bild;
- PDF;
- DOCX/ODT;
- PPTX;
- HTML-Datei;
- ZIP;
- Audio/Video;
- maschinell erzeugtes Dokument;
- Recherchebericht als Datei.

`attachment` und `artifact` werden zunächst **nicht als technisch getrennte Core-Typen** modelliert. Sie sind unterschiedliche Herkunfts- bzw. Nutzungsperspektiven desselben Basistyps.

Beispielhafte Provenienz:

```text
origin.kind = teacher-upload
origin.kind = worker-result
origin.kind = external-import
origin.kind = generated
```

Teacher-facing kann daraus weiterhin eine sinnvolle Sprache entstehen:

- **Anhang / hochgeladenes Material** bei `teacher-upload`;
- **Artefakt / Arbeitsergebnis** bei `worker-result` oder `generated`.

Der Unterschied liegt in der Herkunft, nicht in einer künstlich getrennten Dateilogik.

Ein Asset kann von mehreren Lernmomenten, Collections, Stunden oder Phasen referenziert werden.

---

### 3.3 `collection`

Eine `collection` ist eine benannte, geordnete oder ungeordnete Sammlung von Referenzen auf andere Objekte.

Sie kopiert keine Inhalte.

Beispiele:

- „Hoffnungsbilder“;
- „Materialien für Stunde 3“;
- „Quellen zum Resilienzbegriff“;
- „Noch mögliche Methoden“;
- „Bildersammlung für den Einstieg“.

Minimal:

```text
id
title
items[] -> object refs
```

Optional:

```text
description
order
item annotations
```

Eine Collection darf heterogene Objekte enthalten, sofern die UI dies sinnvoll darstellen kann.

---

### 3.4 `learning-moment`

Ein `learning-moment` ist ein markanter, revidierbarer Orientierungspunkt auf einem gegenwärtig angenommenen Lernweg.

Er ist **kein Mini-Stundenentwurf**.

Minimal:

```text
id
leitgedanke
```

Beispiel:

> Hoffnung trägt auch gegen die Erfahrung des Gegenteils.

Der Lernmoment ist die „Karton“-Metapher: Hinter dem knappen sichtbaren Leitsatz liegt eine offene Sammlung von Spuren und Möglichkeiten.

Mögliche Beziehungen:

```text
contains / relates -> note
contains / relates -> collection
relates            -> asset
```

Inhalte wie Kompetenz, Methode, Rechercheergebnis oder Materialidee sind zunächst keine Pflichtfelder des Lernmoments, sondern referenzierte Notes/Assets/Collections mit optionalen lokalen Taxonomien.

Ein Lernmoment kann:

- umformuliert;
- verschoben;
- geteilt;
- zusammengeführt;
- zurückgestellt;
- später wieder aufgenommen;
- in mehreren Stunden/Phasen verwendet werden.

Er hat keine intrinsische Unterrichtsphasen-Kategorie wie `Einstieg`, `Erkunden` oder `Sichern`.

---

### 3.5 `frame`

Ein `frame` ist ein frei benannter semantischer Zusammenhang auf dem Whiteboard.

Beispiel:

> Biblischer Hoffnungsfaden

Ein Frame kann referenzieren bzw. gruppieren:

- Notes;
- Lernmomente;
- Collections;
- ggf. weitere Whiteboard-relevante Objekte.

Die Zugehörigkeit ist semantisch. Position, Größe und Farbe des Frames sind dagegen reine Layout-Daten.

Ein Frame ist weder Stunde noch Lernmoment und erzeugt keine Unterrichtsstruktur.

---

### 3.6 `lesson`

Eine `lesson` ist eine konkrete Unterrichtsstunde innerhalb des Teaching Products.

Kern:

```text
id
title
challenge / zentrale Frage
ziel
phases[]
materials collection
```

Optional:

```text
intention
competency notes / refs
didaktische Hinweise
organisatorische Hinweise
teacher notes
```

Die Stunde darf eine reale Produktordner-Projektion besitzen, etwa:

```text
Stunde 03/
  index.md
  materialien/
  ...
```

Die Objektidentität der Stunde ist aber nicht an diesen Dateipfad gebunden.

Die `index`-Darstellung ist eine Projektion bzw. Renderform der Stunde und ihrer referenzierten Materialien.

---

### 3.7 `phase`

Eine `phase` ist ein strukturierter Abschnitt im Verlaufsplan einer konkreten Stunde.

Sie entspricht konzeptionell einer Tabellenzeile, nicht einem eigenständigen kompletten Stundenentwurf.

Typische Eigenschaften:

```text
id
time / duration
category
teacher_action
learning_activity
expected_result
media_material_refs[]
learning_moment_refs[]
notes
```

Die genaue Feldbenennung bleibt offen; wichtig ist die fachliche Grenze:

- `category` gehört zur konkreten Unterrichtsphase;
- ein Lernmoment kann in verschiedenen Phasen verschieden realisiert werden;
- die Phase darf mehrere Lernmomente referenzieren;
- ein Lernmoment darf in mehreren Phasen/Stunden vorkommen.

Lokale Taxonomien können die Phasenkategorie erweitern, z. B. `Erkunden`, `Erfahren`, `Analysieren`, `Verdichten`, ohne diese Begriffe in den PTS-Core einzubrennen.

---

## 4. Record Objects

### 4.1 `decision`

Eine `decision` hält eine erkennbare pädagogische Festlegung und ihre Herkunft nachvollziehbar.

Sie ist **kein Approval-Workflow**.

Beispiel:

Lehrkraft sagt:

> „Ich finde gut, wenn wir das in der dritten Stunde machen.“

Wenn Bezug und Intention eindeutig sind, kann daraus unmittelbar eine Domain Operation und ein Decision Record entstehen. Eine zweite Bestätigungsfrage ist nicht erforderlich.

Ein Decision Record kann enthalten:

```text
id
statement
related_refs[]
source conversation/message
actor = teacher
reason / rationale, falls vorhanden
```

Der Record erklärt später „Warum steht das dort?“, ohne den Gesprächsfluss in ein Formular zu verwandeln.

---

### 4.2 `journal-entry`

Ein `journal-entry` ist eine vorläufige interne Beobachtung des Companion.

Typen können sein:

```text
observation
hypothesis
tension
follow_up
```

Mögliche Felder:

```text
id
kind
text
related_refs[]
status = active | stale | superseded | dismissed
```

Ein Journal-Eintrag ist niemals automatisch gemeinsam bestätigter Denkstand oder pädagogische Entscheidung.

Er bleibt für die Lehrkraft einsehbar und verwerfbar.

---

### 4.3 `snapshot`

Ein `snapshot` friert einen früheren Arbeitsstand ein.

Er kann referenzieren bzw. festhalten:

- damalige Denkstand-Projektion;
- relevante Objekt-Revisionen;
- Whiteboard-Revision/Layout;
- Teaching-Product-Revision;
- Zeitpunkt;
- optional Anlass bzw. Session-Bezug.

Ein Snapshot ist historische Orientierung, kein zweiter aktiver Domain Store.

---

## 5. Kein Core-Objekt: Denkstand und Panels

### 5.1 Denkstand

Der aktuelle Denkstand wird zunächst **nicht als normales persistentes Inhaltsobjekt** verstanden.

Er ist eine laufend berechnete bzw. verdichtete Projektion auf Fragen wie:

- Woran arbeiten wir gerade?
- Was scheint derzeit tragfähig?
- Welche Spannung ist offen?
- Was ist zuletzt bedeutsam geworden?
- Was wäre der nächste sinnvolle Denk- oder Arbeitsschritt?

Wenn ein Denkstand historisch festgehalten werden soll, geschieht dies über einen `snapshot`.

Kurz:

```text
Denkstand = live
Snapshot  = historisch
```

### 5.2 Whiteboard, Unterrichtswerkstatt und Schauraum

Diese sind keine Domain Objects, sondern Arbeits- bzw. Projektionsflächen:

```text
Whiteboard            -> Notes, Moments, Frames, Collections, Assets
Lernmoment-Dossier    -> ein Moment + referenzierte Inhalte
Unterrichtswerkstatt  -> Lessons, Phases, Materials/Assets/Collections
Schauraum             -> verwendbare/freigegebene Lesson-Projektion
```

Dasselbe Objekt kann in mehreren Projektionen auftauchen und bleibt dabei dasselbe Objekt.

---

## 6. Beziehungen

PTS vNext soll keine allgemeine Graphdatenbank als Selbstzweck bauen. Beziehungen bleiben klein, explizit und fachlich begründet.

Vorläufig sinnvolle Beziehungsklassen:

```text
contains     -> Sammlung/Container enthält Referenz
relates      -> lockerer fachlicher Bezug
groups       -> Frame gruppiert Objekt
realizes     -> Phase realisiert Lernmoment
uses         -> Lesson/Phase verwendet Asset/Collection
supports     -> Note/Asset unterstützt Moment/Decision
originates   -> Ergebnis stammt aus Auftrag/Conversation
supersedes   -> Record ersetzt älteren Record
```

Nicht jede Markdown-Erwähnung muss automatisch zu einer starken strukturellen Relation werden.

Regel:

> **Was Systemverhalten steuert, braucht eine strukturierte Relation. Was nur inhaltlich erwähnt wird, darf ein Markdown-Link bleiben.**

---

## 7. Präferenz und epistemischer Status sind verschiedene Achsen

Eine Bewertung wie

```text
+ wichtig
neutral
a eher nicht
```

beschreibt die pädagogische Präferenz bzw. derzeitige Relevanz eines Fundstücks.

Sie darf nicht mit epistemischem Status verwechselt werden.

Beispiel:

```text
Epistemik: hypothesis
Präferenz: +
```

bedeutet:

> Diese Hypothese ist uns im Moment wichtig genug, um sie weiterzuverfolgen.

Nicht:

> Diese Hypothese ist wahr.

Auch Produktfreigabe ist eine dritte, getrennte Achse.

---

## 8. Lebenszyklus möglichst leicht halten

Core-Objekte sollen keine universelle komplizierte State Machine erhalten.

Wo nötig, genügen lokale oder typbezogene Zustände. Beispiele:

```text
journal-entry: active | stale | superseded | dismissed
lesson: draft | usable   (vorläufig, noch zu prüfen)
```

Für Notes, Collections, Frames oder Lernmomente soll der Core nicht vorschnell `draft/stable/approved/...` erzwingen.

Historie und Reversibilität entstehen primär über Revisionen, Change Log und Snapshots.

---

## 9. Conversation und Attention sind Infrastruktur, keine Content Objects

Conversation-Knoten, Session-Bindings und Attention Context gehören zur Interaktionsinfrastruktur.

Sie referenzieren Domain Objects, sind aber selbst keine pädagogischen Inhalte.

Beispiel:

```text
conversation-node
  subject -> moment:hoffnung-trotzdem
  parent  -> conversation-node:...
  dshSessionId -> ...
```

DSH besitzt die Session History; PTS besitzt nur die fachliche Bindung und Baumstruktur.

---

## 10. Vorläufige Typenübersicht

```text
ROOT
workspace

CONTENT OBJECTS
note
asset
collection
learning-moment
frame
lesson
phase

RECORD OBJECTS
decision
journal-entry
snapshot

INTERACTION INFRASTRUCTURE
object reference
attention context
conversation node / DSH binding
change event

PROJEKTIONEN
Denkstand
Whiteboard
Lernmoment-Dossier
Unterrichtswerkstatt
Schauraum
Produktstatus
```

---

## 11. Was bewusst noch nicht eigener Core-Typ ist

Vorerst keine eigenen Core-Objekte für:

- Kompetenz;
- Methode;
- Forschungsfrage;
- Materialidee;
- Erkenntnis;
- fachliche Perspektive;
- Lehrplanbezug;
- offene Frage;
- Sozialform;
- Lernaktivitätskategorie.

Sie können zunächst als Notes, Facets/Taxonomien oder strukturierte Felder dort auftauchen, wo Systemverhalten dies wirklich benötigt.

Ein Typ soll erst in den Core aufsteigen, wenn mindestens eines gilt:

1. Er braucht eine eigene stabile Identität.
2. Er braucht Beziehungen, die nicht mehr sinnvoll als Note/Facet ausdrückbar sind.
3. Er braucht eigene Domain Operations.
4. Er braucht eine eigene Conversation-/Attention-Adressierbarkeit.
5. Mehrere lokale Taxonomien haben sich in der Praxis zu einem stabilen gemeinsamen Modell verdichtet.

---

## 12. Leitfrage für die nächste Stufe

Für jedes neue vorgeschlagene Objekt soll gefragt werden:

> **Braucht dieses Ding wirklich eine eigene Identität und eigenes Verhalten – oder reicht eine Note, ein Asset, eine Collection, eine Relation oder eine lokale Taxonomie?**

Diese Zurückhaltung ist Absicht. Der Thinking Space soll Gedanken aufnehmen können, bevor das System weiß, in welche Schublade sie gehören.
