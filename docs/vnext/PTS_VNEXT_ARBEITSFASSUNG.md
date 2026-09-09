# PTS vNext – DSH-native Arbeitsfassung

> **Status:** Arbeitsfassung, 2026-09-09.  
> Diese Datei beschreibt bewusst zuerst den gewünschten Denk- und Arbeitsraum und leitet daraus die technische Architektur ab. Sie ist noch kein Migrationsplan und keine Freigabe zur Implementierung. Der bestehende Stand auf `agent/teaching-product-follow-up-001` dient als Referenz und Fundus: Bewährte Konzepte und DSH-native Bausteine werden übernommen, historische Datenmodelle und UI-Annahmen erhalten keinen automatischen Bestandsschutz.

## 1. Ausgangspunkt

Der Pedagogical Thinking Space ist kein Unterrichtsplaner mit Chatbot und kein Dokumentgenerator mit vorgeschalteter Reflexion.

Er ist ein **gemeinsamer Denk- und Arbeitsraum von Lehrkraft und Pedagogical Companion**, in dem Wahrnehmen, Deuten, Verdichten, Entscheiden und Ausarbeiten ineinandergreifen. Aus diesem Raum entstehen schrittweise konkrete, unterrichtbare Produkte.

Die Lehrkraft bleibt Autorin bzw. Autor der pädagogischen Situation und ihrer Entscheidungen. Der Companion denkt mit der Lehrkraft, nicht an ihrer Stelle. Er darf strukturieren, erinnern, recherchieren, modellieren, Alternativen eröffnen, Widersprüche markieren und als Critical Friend widersprechen. Er darf seine Vorschläge nicht stillschweigend in Lehrkraftentscheidungen verwandeln.

Ein zentrales Gestaltungsziel für vNext lautet:

> **Lehrkraft und Companion sollen jederzeit auf dieselben Gegenstände zeigen, dieselben Gegenstände gemeinsam verändern und über dieselben Gegenstände sprechen können.**

DSH ist dabei die technische Laufzeit. PTS ergänzt DSH um die pädagogische Domäne, die fachliche Orchestrierung, die gemeinsamen Arbeitsflächen und die Projektion des aktuellen Denkraums in den Companion-Kontext.

---

## 2. Leitprinzipien

### 2.1 Teacher authorship

Die Lehrkraft bestimmt Anliegen, Interpretation des Kontexts und pädagogische Richtung. Zustimmung wird nicht erst durch technische Bestätigungsdialoge wirksam. Eine im Gespräch hinreichend eindeutige Willensäußerung ist als solche ernst zu nehmen.

### 2.2 Conversation first, transaction second

Technische Persistenz darf den Denkfaden nicht unterbrechen.

Wenn die Lehrkraft sagt:

> „Ich finde gut, wenn wir das in der dritten Stunde machen.“

und der Bezug eindeutig ist, darf der Companion daraus die unmittelbar gemeinte, reversible bzw. ausdrücklich benannte Domänenänderung vornehmen. Es darf keine zweite bürokratische Bestätigung entstehen, nur weil ein Schreibwerkzeug eine technische Freigabe erwartet.

Der Companion dokumentiert, was im Gespräch entschieden wurde; er verwandelt das Gespräch nicht in ein Formular zur Dokumentation.

### 2.3 Critical Friendship als Fähigkeit, nicht als Dauerton

Der Companion darf eine Idee respektvoll infrage stellen, wenn das für das Learning Design relevant ist. Kritik ist eine mögliche Intervention unter mehreren – neben Anerkennen, Sortieren, Strukturieren, Erinnern, Perspektiven öffnen, Recherchieren und bewusstem Zurückhalten.

### 2.4 Systemisch-reflexive Haltung

Der Companion betrachtet Schwierigkeiten nicht vorschnell als Eigenschaft einzelner Lernender, Klassen, Methoden oder Lehrkräfte. Er berücksichtigt Kontexte, Beziehungen, Routinen, Erwartungen, Ressourcen, Ausnahmen, institutionelle Bedingungen und mögliche Rückkopplungen. Hypothesen bleiben als Hypothesen markiert.

### 2.5 Epistemische Disziplin

Beobachtung, berichtete Aussage, Interpretation, Hypothese, verifiziertes Wissen, offene Frage und pädagogische Entscheidung dürfen nicht ineinanderlaufen.

### 2.6 Reflexion vor Produktion – ohne Reflexionszwang

Produktion ersetzt kein pädagogisches Urteil. Zugleich darf Reflexion nicht zum Hindernis werden. „Für jetzt ausreichend tragfähig“ ist ein legitimer professioneller Standard.

### 2.7 DSH ausnutzen, nicht nachbauen

Wenn DSH Conversations, Session History, Agent Composition, Presets, Model Routing, native Subagents, Background/Continuation, Toolfilter, Skills oder UI-Erweiterungspunkte bereitstellt, baut PTS dafür keine parallele Laufzeit.

> **PTS entscheidet fachlich, DSH führt technisch aus.**

---

## 3. Sichtbare Arbeitswelt

PTS vNext unterscheidet fünf sichtbare Bereiche. Sie sind keine fünf unabhängigen Wahrheiten, sondern unterschiedliche Arbeits- und Projektionsformen desselben Denkraums.

### 3.1 Denkstand

**Frage:** Was halten Lehrkraft und Companion derzeit gemeinsam für tragfähig?

Der Denkstand ist eine knappe, gemeinsam verantwortete Verdichtung des aktuellen pädagogischen Verständnisses. Er kann enthalten:

- gegenwärtiger roter Faden;
- wesentliche Einsichten;
- Spannungen oder Brüche;
- offene Richtungsfragen;
- wenige besonders relevante Entscheidungen oder Annahmen.

Der Denkstand ist kein Activity Feed, kein Kanban, kein Produktstatus und kein vollständiges Protokoll. Er darf sich verändern.

Ein Snapshot kann einen früheren Denkstand zusammen mit der damaligen Revision des Denkraums festhalten.

### 3.2 Whiteboard

**Frage:** Was liegt gerade als Denkmaterial auf dem Tisch?

Das Whiteboard ist eine freie gemeinsame Modellierungsfläche. Es ersetzt ein Kanban nach vorgegebenen didaktischen Funktionen.

Mögliche Objekte:

- lose Zettel;
- Lernmoment-Anker;
- frei benannte Cluster-/Frame-Bereiche;
- Fundstücke oder Verweise;
- vermutete Reihenfolgen und Verbindungen;
- noch nicht eingeordnete Ideen.

Ein Zettel darf extrem leichtgewichtig sein:

> Idee: Hoffnungsgärten bauen

Keine Pflicht zur sofortigen Ausarbeitung, Klassifikation oder didaktischen Funktionszuweisung.

Das Whiteboard zeigt die **Landkarte des Denkens, nicht den vollständigen Inhalt des Denkens**. Deshalb bleiben sichtbare Objekte kompakt. Tiefe Inhalte öffnen sich hinter den Objekten.

### 3.3 Lernmoment-Kartons

**Frage:** Was hat sich zu einem wesentlichen Punkt des Lernwegs verdichtet?

Ein Lernmoment ist kein Mini-Stundenentwurf. Er ist ein markanter, revidierbarer Orientierungspunkt auf einem gegenwärtig angenommenen Lernweg.

Sein sichtbarer Anker kann ein gemeinsam verdichteter Leitsatz sein, z. B.:

> **Hoffnung trägt auch gegen die Erfahrung des Gegenteils.**

Die Kartonmetapher beschreibt die Tiefe hinter diesem Leitsatz. Darin kann eine lose, auch widersprüchliche Sammlung liegen:

- Notizen;
- Erkenntnisse aus Gesprächen;
- Kompetenzen und fachliche Bezüge;
- Material- und Bildideen;
- Methodenideen;
- Rechercheergebnisse;
- offene Fragen;
- Artefakt- und Materialreferenzen;
- einfache Bewertungen wie `+ wichtig`, `− eher nicht`, unmarkiert.

Ein Lernmoment wird nicht dadurch stabil, dass alle diese Inhalte ausgearbeitet sind. Er bleibt revidierbar: umformulieren, verschieben, zusammenführen, teilen, zurückstellen oder als nicht mehr tragend markieren.

Der Companion darf beobachten, ob sich Gespräche und Fundstücke von einem bisherigen Lernmoment oder roten Faden entfernen, und dies zu einem geeigneten Zeitpunkt als Frage oder Hypothese einbringen.

### 3.4 Unterrichtswerkstatt

**Frage:** Wie wird daraus unter realen Bedingungen konkreter Unterricht?

Erst hier werden aus ausgewählten Lernmomenten und Fundstücken konkrete Stunden und Phasen. Hier entstehen bzw. werden verbindlicher:

- Stundenintention;
- Phasen;
- konkrete Lernaktivitäten;
- Zeit;
- Methode/Sozialform/Modus;
- tatsächliche Materialverwendung;
- Übergänge innerhalb der konkreten Stunde;
- Hinweise für die Durchführung.

Ein Lernmoment kann in mehreren Stunden oder Phasen verwendet werden. Änderungen an einem Lernmoment dürfen bestätigte Unterrichtsphasen nicht automatisch überschreiben.

### 3.5 Schauraum

**Frage:** Was ist tatsächlich vorbereitet und unterrichtbar?

Der Schauraum zeigt fertig vorbereitete bzw. von der Lehrkraft als verwendbar markierte Unterrichtsstunden mit den dafür nötigen Materialien und Hinweisen.

Er hält keine eigene Produktwahrheit, sondern ist eine Projektion des Teaching Products auf das, was praktisch genutzt werden kann.

---

## 4. Hintergrundsysteme

### 4.1 Companion-Journal

Das Companion-Journal ist das **Beobachtungsgedächtnis** des Companion, nicht der gemeinsam bestätigte Denkstand.

Hier darf der Companion Dinge festhalten, die ihm auffallen, auch wenn sie gerade nicht in den Gesprächsfaden passen:

- Beobachtung;
- Spannung/Widerspruch;
- Wiedervorlage;
- Hypothese;
- später zu prüfender Zusammenhang.

Beispiel:

> Der Lernmoment „Hoffnung wird handlungsfähig“ taucht seit mehreren Sitzungen kaum noch auf. Prüfen, ob er den roten Faden noch trägt.

Journal-Einträge sind nie automatisch pädagogische Wahrheit. Sie dürfen altern (`active`, `stale`, `superseded`, `dismissed`) und müssen für die Lehrkraft einsehbar und verwerfbar sein. Der Companion darf aus ihnen später eine Frage machen, aber nicht stillschweigend den Denkstand umschreiben.

### 4.2 Artefakte

Artefakte sind Ergebnisse begrenzter Aufträge, z. B. Recherche, Quellenprüfung, Analyse, Materialentwurf, Präsentation oder Dokument.

Sie können von Whiteboard-Objekten, Lernmomenten oder Unterrichtsphasen referenziert werden. Ein Artefakt wird nicht allein durch seine Existenz Teil einer pädagogischen Entscheidung.

### 4.3 Memory

Memory trägt längerfristige Kontinuität und professionell interpretierte Erfahrung. Es ist keine kanonische Wahrheit eines konkreten Denkraums.

### 4.4 Knowledge

Knowledge enthält kuratiertes, wiederverwendbares Wissen. Rechercheergebnisse gelangen nicht automatisch in Knowledge und verändern nicht automatisch das Learning Design.

### 4.5 Skills

Skills beschreiben Verfahren und Können. Sie gehören in die DSH-nahe Ausführungsschicht und werden rollenbezogen den passenden Workern zugänglich gemacht.

---

## 5. Referenzierbare Objektwelt

### 5.1 Grundsatz

> **Alles, worüber Lehrkraft und Companion sinnvoll sprechen können, ist ein referenzierbares Objekt.**

Jedes inhaltliche Objekt erhält eine stabile ID, unabhängig davon, in welchem Panel oder in welcher Projektion es gerade erscheint.

Beispiele:

```text
note:hoffnungsgaerten
moment:hoffnung-trotzdem
frame:biblischer-faden
artifact:resilienz-recherche
material:hoffnungsbilder
lesson:stunde-03
phase:stunde-03-vertiefung
decision:biblischer-faden
question:hoffnung-optimismus
```

Optional kann daraus eine PTS-interne URI entstehen:

```text
pts://hoffnung/moment/hoffnung-trotzdem
```

Eine Referenz identifiziert den Gegenstand, nicht seine aktuelle Darstellung.

### 5.2 Object Resolver

Ein zentraler Resolver kennt für einen Objekttyp die geeigneten Darstellungen und Beziehungen.

Beispiele:

```text
moment   -> Whiteboard fokussieren / Lernmoment-Dossier öffnen
note     -> Whiteboard oder übergeordneten Lernmoment öffnen
lesson   -> Unterrichtswerkstatt öffnen
phase    -> Stunde + Phase öffnen
material -> Material-/Artefaktansicht öffnen
artifact -> Artefakt öffnen
decision -> passende Denkstand-/Entscheidungsdarstellung öffnen
```

Panels brauchen dadurch keine eigene Referenzlogik.

---

## 6. Attention, Referenz und Conversation sind drei verschiedene Dinge

### 6.1 Sehen – Attention Context

Wenn die Lehrkraft ein Objekt anklickt, weiß der Companion, was sie gerade betrachtet. Ein normaler Klick erzeugt noch keine neue Conversation.

Beispiel:

```text
Current Attention
moment:hoffnung-trotzdem
```

Dann kann die Lehrkraft sagen:

> „Das überzeugt mich noch nicht.“

und der Companion kennt den Bezug.

### 6.2 Referenzieren

Wenn Lehrkraft oder Companion auf ein Objekt verweisen, wird eine stabile, anklickbare Objektreferenz verwendet.

Wenn der Companion sagt:

> „Das steht in Spannung zu **Hoffnung wird handlungsfähig**.“

muss die Lehrkraft diese Referenz öffnen können. Umgekehrt kann die Lehrkraft ein Objekt in die Conversation übernehmen, ohne seine ID manuell nennen zu müssen.

### 6.3 Besprechen – object-bound Conversation

Erst eine bewusste Handlung wie „Darüber sprechen“, „Gespräch fortsetzen“ oder ein vergleichbarer Übergang öffnet bzw. erzeugt eine persistente objektgebundene DSH-Conversation.

> **Referenzieren und Fokussieren erzeugt noch keine Session.**

---

## 7. Conversation Tree

Ein referenzierbares Objekt kann mehrere zusammenhängende Conversation-Knoten besitzen, statt exakt einer einzigen Session.

Beispiel:

```text
Lernmoment „Hoffnung trägt trotz Gegenerfahrung“
│
├─ Hauptgespräch
├─ Resilienz-Abgrenzung
│  └─ Rechercheergebnis prüfen
└─ mögliche Verwendung in Stunde 3
```

DSH bleibt Eigentümer der realen Session Histories. PTS persistiert nur die pädagogische Bindung:

- welches PTS-Objekt ist Gegenstand;
- welcher Conversation-Knoten gehört zu welchem übergeordneten Knoten;
- welche DSH-Session repräsentiert diesen Knoten.

PTS baut keinen parallelen Chatserver und keine zweite Conversation-History.

Die bestehenden `focus-context.mjs` und `conversation-bindings.mjs` gelten als wertvolle Spikes, werden aber in vNext von den heute fest verdrahteten Objekttypen und dem 1:1-Binding zu einer allgemeinen Reference-/Attention-/Conversation-Architektur weiterentwickelt.

---

## 8. Shared Modeling

Whiteboard, Lernmoment-Kartons und Unterrichtswerkstatt sind nicht bloß Betrachtungsflächen. **Lehrkraft und Companion modellieren dort gemeinsam.**

Beide dürfen – im Rahmen ihrer jeweiligen fachlichen Autorisation – Objekte:

- hinzufügen;
- verschieben;
- zuordnen;
- umbenennen und verändern;
- aus einer Zuordnung herausnehmen;
- entfernen bzw. zurückstellen;
- miteinander referenzieren.

### 8.1 Ein gemeinsamer Domain Store

Es gibt nicht einen UI-Schreibweg und daneben Companion-Dateiedits. Beide Seiten verwenden dieselben semantischen Domain Operations auf demselben kanonischen Zustand.

```text
                    Shared Domain Store
                         │
         ┌───────────────┴───────────────┐
         │                               │
    Lehrkraft                         Companion
         │                               │
    Domain Operation                Domain Operation
         │                               │
         └───────────────┬───────────────┘
                         ▼
                    Change Event
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
          UI-Projektion        Companion-Kontext
```

### 8.2 Provenienz jeder Änderung

Jede semantische Änderung erhält mindestens:

- betroffene Objekt-ID(s);
- Operation;
- vorherige und neue Revision;
- Actor (`teacher`, `companion`, ggf. worker/system nur wo fachlich erlaubt);
- Session/Conversation-Bezug;
- Zeitpunkt;
- optional kurze Begründung bzw. Conversation-Evidence.

Beispiel:

```json
{
  "operation": "move_object",
  "object": "note:hoffnungsgaerten",
  "from": "whiteboard:parking",
  "to": "moment:hoffnung-handeln",
  "actor": "companion",
  "reason": "im Gespräch als passende Spur eingeordnet"
}
```

Der Change Log ist keine zweite pädagogische Wahrheit, sondern die nachvollziehbare Geschichte gemeinsamer Modellierung. Er soll Undo/Redo, Revisionsprüfung und „Was hat sich verändert?“ ermöglichen.

---

## 9. Change Awareness ohne Signalingflut

Jede Seite muss relevante Änderungen der anderen Seite wahrnehmen können. Das bedeutet ausdrücklich **nicht**, dass jede Operation als Toast, Chatnachricht oder Alarm erscheint.

### 9.1 Companion -> Lehrkraft

Während zusammenhängender Arbeit genügt eine ruhige Aktivitätsanzeige, z. B.:

> ● Companion arbeitet an **Stunde 3**

Nach Abschluss kann eine kompakte Einheit erscheinen:

> **Companion hat Stunde 3 überarbeitet** · `4 Änderungen ansehen`

Erst beim Öffnen werden die semantischen Änderungen sichtbar:

```text
+ Phase „Kontrast Hoffnung / Optimismus“ eingefügt
↳ Lernmoment „Hoffnung trotz Gegenerfahrung“ zugeordnet
↳ Recherche „Resilienz“ referenziert
~ Dauer 45 -> 50 Minuten
```

Direkt betroffene Objekte dürfen kurz dezent markiert werden. Später kann am Objekt sichtbar bleiben:

> Zuletzt geändert vom Companion · vor 5 Min.

Der bestehende Activity-Stream-Spike liefert dafür ein wichtiges Gestaltungsprinzip: **intent and progress sichtbar machen, technische Implementierungsdetails standardmäßig verbergen und zusammengehörige Vorgänge gruppieren**. vNext soll dies jedoch auf semantische Domain Operations stützen, nicht auf die Interpretation technischer Toolcalls.

### 9.2 Lehrkraft -> Companion

Änderungen der Lehrkraft werden Teil der nächsten Context Projection. Der Companion muss nicht jede UI-Handlung kommentieren.

Beispiel:

```text
Seit dem letzten Companion-Beitrag:
- moment:hoffnung-handlungsfaehig vom roten Lernweg auf den Parkplatz verschoben
```

Regel:

> **Änderungen der Lehrkraft sind Kontextsignale, keine Aufforderung, jede Handlung zu verbalisieren.**

Der Companion greift eine Änderung nur auf, wenn sie für den aktuellen Denkfaden bedeutsam ist.

---

## 10. Autorisation ohne bürokratisches Ping-Pong

PTS vNext unterscheidet semantische Tragweite, ohne daraus einen sichtbaren Freigabeapparat zu machen.

### 10.1 Gemeinsames Modellieren

Reversible Arbeitsbewegungen im aktuellen Mandat dürfen flüssig erfolgen, z. B.:

- verschieben;
- zuordnen;
- Notiz anlegen;
- Entwurf umformulieren;
- Materialreferenz ergänzen;
- Phase skizzieren.

Eine eindeutige Äußerung im Gespräch reicht.

### 10.2 Pädagogische Festlegung

Auch eine pädagogische Entscheidung kann bereits im Gespräch eindeutig getroffen sein:

> „Ja, das ist unser zentraler Lernmoment.“

> „Dann machen wir das in Stunde 3.“

Diese Äußerung ist die Entscheidung. Sie wird dokumentiert, nicht erneut eingeholt.

### 10.3 Folgenreiche oder irreversible Handlung

Für Veröffentlichung, endgültiges Löschen, externes Versenden oder vergleichbar folgenreiche Operationen kann eine ausdrückliche Autorisation erforderlich sein. Auch hier gilt: Hat die Lehrkraft die konkrete Handlung bereits eindeutig beauftragt, wird nicht noch einmal dieselbe Zustimmung abgefragt.

### 10.4 Technische Fehler sind keine pädagogischen Rückfragen

Wenn eine bereits autorisierte Änderung technisch nicht gespeichert werden kann, ist das ein Systemfehler. Der Companion darf dies nicht als angeblich fehlende Lehrkraftbestätigung maskieren.

---

## 11. DSH-/PTS-Grenze

### DSH soll besitzen

- Conversation und Session History;
- Agent Composition und Presets;
- Model Routing;
- native Subagents;
- Background/Continuation und deren Lifecycle;
- Toolfilter und Toolausführung;
- Skills Runtime;
- Web-/Client-Plugin-Runtime;
- Unterbrechung und Fortsetzung von Agenten;
- weitere generische Agent-Harness-Funktionen, soweit vorhanden.

### PTS soll besitzen

- pädagogisches Domänenmodell;
- Workspace/Domain Store;
- stabile PTS-Objektidentitäten;
- Object Resolver und Beziehungen;
- Attention Context;
- Object ↔ Conversation Bindings und Conversation-Tree-Metadaten;
- Denkstand;
- Whiteboard;
- Lernmoment-Dossiers;
- Teaching Product / Unterrichtswerkstatt;
- Schauraum-Projektion;
- Companion-Journal;
- pädagogische Decisions und Provenienz;
- semantische Domain Operations und Change Log;
- Context Projection für den Companion;
- PTS-spezifische Orchestrierungsregeln.

---

## 12. Was aus dem bisherigen PTS ausdrücklich bewahrt werden soll

Diese Konzepte gehören zur PTS-DNA und sind unabhängig von bisherigen Dateiformaten wertvoll:

1. Lehrkraft bleibt Autorin bzw. Autor.
2. Companion statt Generator oder simulierte Autorität.
3. Critical Friendship als situative Fähigkeit.
4. Systemisch-reflexive Haltung.
5. Epistemische Disziplin und transparentes Nichtwissen.
6. Multiperspektivität ohne Ventriloquismus.
7. workload-sensitive Modi `stabilise`, `orient`, `explore`.
8. Reflection before production, aber „sufficient for now“ als legitimer Standard.
9. Research erweitert Urteil, entscheidet aber nicht.
10. Worker führen begrenzte Arbeiten aus, aber keine pädagogischen Richtungsentscheidungen.
11. Materialien sind situierte pädagogische Antworten, nicht neutrale Assets.
12. Komplexe Hintergrundarbeit wird zu einem einfachen brauchbaren Beitrag für das Gespräch verdichtet.
13. Entscheidungen, offene Fragen und Gründe bleiben nachvollziehbar.
14. DSH-native Worker-/Skill-/Continuation-Architektur statt eigenem PTS-Dispatcher.
15. Bestehende Focus-/Conversation-Binding-Ansätze als Grundlage für die allgemeine Referenzarchitektur.
16. Activity-Stream-Prinzip: ruhige semantische Aktivität statt technischer Toolflut.

---

## 13. Was keinen automatischen Bestandsschutz erhält

Folgende heutige Strukturen dürfen für vNext neu bewertet, ersetzt oder nur als Migrationsquelle gelesen werden:

- `learning-design.md` als monolithisches Zentraldokument;
- `learning-landscape.md` in seiner heutigen stark strukturierten Form;
- Lernmoment-Pflichtfelder wie globale didaktische Funktion, konkrete Lernaktivität und erwartete Erfahrung;
- Funktionsspalten `Einstieg/Erkunden/Erarbeiten/...` als primäre Werkstattordnung;
- Übergänge als primäres Landkartenmodell;
- `temporal-plan.yml` als Zielmodell;
- Planning Board als allgemeines Kanban;
- `draft/stable/needs_review` als Hauptmetapher für Lernmomente;
- fest codierte Focus-Kinds;
- 1 Objekt = exakt 1 Conversation;
- Panel-spezifische Referenz- und Schreiblogik;
- parallele Parser/Stores je Plugin;
- technische Approval-Schleifen für bereits im Gespräch autorisierte Änderungen.

Dies bedeutet nicht automatisch, dass jedes Element gelöscht wird. Es bedeutet nur, dass vNext zuerst vom Zielmodell her entscheidet.

---

## 14. Arbeitsreihenfolge für vNext

Diese Arbeitsfassung soll zunächst **ohne Implementierungsdruck** zu einer widerspruchsarmen Architektur verdichtet werden.

Empfohlene nächste Dokumente/Schritte:

1. Domain Model: Objekttypen, Beziehungen, Lebenszyklen und epistemische Zustände.
2. DSH Boundary: Welche Runtime-Funktionen werden ausschließlich von DSH übernommen?
3. Object Reference + Resolver + Attention.
4. Conversation Tree und Bindings auf DSH-Sessions.
5. Shared Modeling + Domain Operations + Change Log.
6. UI Spaces: Denkstand, Whiteboard, Lernmoment-Dossier, Unterrichtswerkstatt, Schauraum.
7. Companion-Journal und Context Projection.
8. Persistenzmodell – erst jetzt entscheiden, welche Dateien/Verzeichnisse kanonisch werden.
9. Audit des heutigen Repos gegen `KEEP / ADAPT / RETIRE`.
10. Danach erst ein Migrations- und Implementierungsplan.

---

## 15. Noch offene Architekturfragen

Diese Arbeitsfassung entscheidet bewusst noch nicht:

- konkretes Persistenzformat der neuen Objektwelt;
- ob Lernmomente physisch als Verzeichnisse mit `moment.md` oder als andere kanonische Struktur gespeichert werden;
- wie virtuelle Sammlungen/Ordner und Materialreferenzen genau persistiert werden;
- welche Objektarten im ersten vNext-Slice wirklich nötig sind;
- wie Undo/Redo technisch umgesetzt wird;
- ob alle Domain Operations event-sourced oder nur revisionsprotokolliert werden;
- wie lange Change-Awareness-Informationen im UI hervorgehoben werden;
- welche Conversation-Tree-Tiefe UX-seitig sichtbar sein soll;
- welche v1-Artefakte automatisch migriert werden können und wo ein bewusster Lehrerentscheid nötig ist.

Diese Fragen sollen aus dem Zielmodell beantwortet werden, nicht aus Rücksicht auf die aktuelle Dateistruktur.

---

## Kurzform

PTS vNext ist ein DSH-nativer gemeinsamer pädagogischer Denkraum.

```text
                         DENKSTAND
                „Was trägt für uns gerade?“
                              ▲
                              │
WHITEBOARD -> LERNMOMENTE -> UNTERRICHTSWERKSTATT -> SCHAURAUM
  Ideen       Verdichtung       Konkretisierung        Nutzung

                              ▲
                              │
              gemeinsame referenzierbare Objektwelt
              Attention · Links · Conversation Tree
              Shared Modeling · Change Awareness
                              │
                              ▼
                      PEDAGOGICAL COMPANION

Hintergrund:
Companion-Journal · Artefakte · Memory · Knowledge · Skills

Technische Laufzeit:
DSH Conversations · Agents · Subagents · Tools · Skills · Models · UI Runtime
```

Der zentrale Qualitätsmaßstab lautet nicht, wie vollständig das System Datenstrukturen ausfüllt, sondern ob die Lehrkraft sagen kann:

> **„Wir denken hier gemeinsam. Ich sehe, was sich entwickelt, ich kann auf dieselben Dinge zeigen wie mein Companion, und am Ende ist der Unterricht trotzdem meiner.“**
