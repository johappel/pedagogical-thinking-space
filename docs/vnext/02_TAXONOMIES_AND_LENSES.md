# PTS vNext – Taxonomies and Lenses

> **Status:** Arbeitsfassung, 2026-09-09.  
> Dieses Dokument konkretisiert das Prinzip: Der PTS-Core bleibt klein; fachliche Ordnungen können lokal ergänzt werden, ohne den Denkraum in ein Pflichtformular zu verwandeln.

## 1. Ausgangspunkt

Pädagogische Arbeit verwendet viele mögliche Ordnungen:

- Kompetenzen;
- Methoden;
- Sozialformen;
- Lehrplanbezüge;
- epistemische Kategorien;
- fachliche Perspektiven;
- religionspädagogische Zugänge;
- Phasentypen;
- Materialfunktionen;
- Entwicklungs- oder Reifeeinschätzungen.

PTS vNext soll diese Ordnungen unterstützen, aber nicht alle als feste Core-Schemata vorwegnehmen.

> **Taxonomien dürfen das Denken präzisieren, aber nicht Voraussetzung dafür sein, einen Gedanken festzuhalten.**

Eine Lehrkraft muss jederzeit eine Note wie

> Idee: Hoffnungsgärten bauen

anlegen können, ohne vorher Typ, Kompetenzbereich, didaktische Funktion oder Status auszuwählen.

---

## 2. Core Object versus Taxonomy

Der Core beantwortet:

> Welche Dinge brauchen stabile Identität und eigenes Verhalten?

Eine Taxonomie beantwortet:

> Unter welcher fachlichen Perspektive wollen wir vorhandene Dinge lesen, filtern oder ordnen?

Beispiel:

```text
note:hoffnungsgaerten
```

bleibt dasselbe Core-Objekt, kann aber lokal klassifiziert werden als:

```text
kind = method-idea
domain = religion
perspective = existential
```

Die Klassifikation ändert nicht die Identität der Note.

---

## 3. Taxonomien sind namespaced und lokal erweiterbar

Taxonomien sollen einen Namensraum besitzen, damit lokale Erweiterungen nicht mit dem PTS-Core kollidieren.

Konzeptionelles Beispiel:

```yaml
facets:
  pts.epistemic: hypothesis
  local.preference: plus
  de.by.ru.competence: wahrnehmen-und-deuten
  workspace.hoffnung.thread: biblischer-faden
```

Die konkrete Syntax ist noch nicht festgelegt. Entscheidend sind die Regeln:

- Core-Taxonomien verwenden einen stabilen PTS-Namensraum;
- Fach-/Profil-Erweiterungen verwenden eigene Namensräume;
- Workspace-lokale Begriffe dürfen sehr leichtgewichtig sein;
- unbekannte Taxonomien dürfen ein Objekt nicht unlesbar oder unbenutzbar machen.

---

## 4. Herkunft einer Taxonomie

Eine Taxonomie kann aus verschiedenen Ebenen kommen:

### 4.1 PTS Core

Nur sehr wenige, wirklich stabile Kategorien.

Beispielhaft denkbar:

- epistemischer Status;
- einfache Präferenz;
- technische Provenienzklassen.

Auch diese Core-Menge soll klein bleiben.

### 4.2 DSH Profile / PTS Deployment

Ein konkreter Einsatzkontext kann zusätzliche Vokabulare bereitstellen.

Beispiel:

- schulartspezifische Kategorien;
- fachbezogene Perspektiven;
- institutionelle Qualitätsmerkmale.

### 4.3 Skill

Ein Skill kann eine Taxonomie mitbringen oder deren Verwendung unterstützen.

Beispiel:

Ein religionspädagogischer Skill kennt Perspektiven wie:

```text
biblisch
existentiell
ethisch
systematisch
interreligiös
```

Der Skill kann anbieten, vorhandene Notes oder Lernmomente danach zu betrachten, ohne dass diese Kategorien Pflichtfelder des Kernmodells werden.

### 4.4 Workspace lokal

Die Lehrkraft und der Companion dürfen im konkreten Denkraum eigene Begriffe etablieren.

Beispiel:

```text
„trägt gerade“
„später wieder ansehen“
„biblischer Hoffnungsfaden“
```

Nicht jeder solcher Begriff muss global wiederverwendbar sein.

---

## 5. Lenses: Taxonomie wird zur Sicht, nicht zur neuen Wahrheit

Eine `lens` ist eine Projektion oder Filter-/Ordnungslogik über vorhandene Objekte.

Beispiele:

```text
zeige nur + markierte Inhalte
zeige Kompetenz-Notes
zeige alles mit Lehrplanbezug
zeige nur Research-Fundstücke
ordne die Phasen nach lokaler Kategorie
zeige religionspädagogische Perspektiven
```

Eine Lens erzeugt keine neuen Objekte und verändert keine pädagogische Entscheidung.

Sie kann:

- filtern;
- gruppieren;
- sortieren;
- Badges anzeigen;
- eine alternative Projektion bereitstellen;
- dem Companion eine strukturierte Sicht für eine begrenzte Aufgabe geben.

> **Lenses sind Lesarten des Denkraums, keine parallelen Datenmodelle.**

---

## 6. Whiteboard und Taxonomien

Das Whiteboard bleibt zunächst frei räumlich.

Taxonomien können dort optional helfen:

- Badge an einer Note;
- Filter „nur Materialideen“;
- temporäre Gruppierung nach Perspektive;
- farbliche oder symbolische Kennzeichnung;
- Companion-Vorschlag „Diese drei Notes wirken wie Kompetenzbezüge“.

Wichtig:

Eine solche Gruppierung darf nicht stillschweigend die räumliche oder semantische Ordnung des Whiteboards verändern.

Beispiel:

> `Lens: Kompetenzen`

kann drei Notes hervorheben. Die Notes bleiben dennoch dort, wo Lehrkraft und Companion sie im gemeinsamen Whiteboard modelliert haben.

---

## 7. Lernmoment-Kartons und Taxonomien

Der Lernmoment enthält keine universell vorgeschriebenen Unterordner.

Eine lokale Lens kann aber Inhalte sinnvoll strukturieren:

```text
Kompetenzen
Materialideen
Methoden
Recherche
offene Fragen
```

Das ist eine **Darstellung** über Notes, Assets und Collections, keine Pflichtstruktur des Lernmoments.

Dadurch kann derselbe Karton in einem anderen Kontext anders gelesen werden, z. B.:

```text
fachliche Bezüge
Schülerperspektiven
Irritationen
theologische Spannungen
```

Die Objektwelt bleibt gleich.

---

## 8. Unterrichtswerkstatt und lokale Phasenkategorien

Die konkrete Phase besitzt ein Feld bzw. eine Facet für ihre Kategorie. Der Core schreibt aber nicht vor, dass Unterricht immer aus `Einstieg`, `Erarbeitung`, `Sicherung`, `Transfer` bestehen muss.

Ein Deployment oder Skill kann beispielsweise anbieten:

```text
Erkunden
Erfahren
Analysieren
Verdichten
Gestalten
Reflektieren
```

Eine andere Fachdomäne kann andere Kategorien verwenden.

Die Kategorie beschreibt die konkrete Unterrichtsphase, nicht die intrinsische Identität eines Lernmoments.

---

## 9. Companion-Verhalten

Der Companion darf Taxonomien nutzen, aber nicht zum Gatekeeper machen.

### Er darf

- eine passende Klassifikation vorschlagen;
- vorhandene Facets für Filter und Kontext verwenden;
- lokale Muster erkennen;
- auf Inkonsistenzen hinweisen;
- eine neue Workspace-Taxonomie vorschlagen, wenn sich wiederholt ein nützlicher Begriff herausbildet.

### Er soll nicht

- jede neue Note sofort klassifizieren;
- fehlende Facets als unvollständigen Zustand behandeln;
- aus einer Klassifikation eine pädagogische Entscheidung ableiten;
- lokale Begriffe stillschweigend in globale Wahrheit verwandeln;
- Taxonomiepflege zum Gesprächsgegenstand machen, wenn sie dem aktuellen Denken nicht hilft.

---

## 10. Taxonomy Promotion: Wann wird etwas ein Core-Objekt?

Lokale Taxonomien dienen auch als Lernmechanismus für die Architektur.

Wenn sich beispielsweise `competence` in vielen Denkräumen als so wichtig erweist, dass Kompetenzen:

- eigene stabile IDs brauchen;
- zwischen mehreren Lessons/Moments referenziert werden;
- eigene Domain Operations benötigen;
- eigenständig besprochen und fokussiert werden sollen;
- oder unabhängig von Notes versioniert werden müssen;

kann später entschieden werden:

```text
Facet / Note-Klassifikation
          ↓
praktisch bewährt
          ↓
Core Object Candidate
          ↓
explizite Architekturentscheidung
```

Nicht umgekehrt.

> **Der Core wächst aus beobachteter Notwendigkeit, nicht aus dem Wunsch nach vollständiger Vorabmodellierung.**

---

## 11. Epistemik, Präferenz und Freigabe dürfen nicht vermischt werden

Taxonomien müssen verschiedene Bedeutungsachsen getrennt halten.

Beispiel:

```text
pts.epistemic = hypothesis
local.preference = plus
product.use = proposed
```

Das bedeutet:

- fachlich ist es eine Hypothese;
- pädagogisch möchten Lehrkraft/Companion sie derzeit weiterverfolgen;
- ihre konkrete Produktverwendung ist noch ein Entwurf.

Keine dieser Achsen darf aus einer anderen automatisch abgeleitet werden.

---

## 12. Persistenzanforderungen

Das konkrete Format bleibt für `09_PERSISTENCE.md` offen. Die Architektur verlangt aber:

- Taxonomien sind versionierbar;
- unbekannte Namespaces bleiben round-trip-fähig;
- Core-Parser dürfen lokale Facets nicht verwerfen;
- lokale Taxonomien dürfen ohne Core-Codeänderung ergänzt werden;
- eine entfernte Taxonomie darf die zugrunde liegenden Content Objects nicht zerstören;
- Lenses sind reproduzierbare Projektionen, keine versteckten Nebenwahrheiten.

---

## 13. Beispiel: Ein Gedanke wächst, ohne sein Grundobjekt zu wechseln

Ausgang:

```markdown
note:hoffnungsgaerten
Idee: Hoffnungsgärten bauen
```

Später lokale Einordnung:

```text
kind = method-idea
preference = plus
```

Später Beziehung:

```text
relates -> moment:hoffnung-handlungsfaehig
```

Später konkrete Unterrichtsverwendung:

```text
phase:stunde-03-abschluss
  uses -> note:hoffnungsgaerten
```

Die ursprüngliche Note musste dafür nicht mehrfach konvertiert oder in unterschiedliche Datentypen kopiert werden.

---

## 14. Leitprinzip

PTS soll fachliche Präzision ermöglichen, ohne vor der eigentlichen pädagogischen Arbeit ein Schema zu verlangen.

> **Die Taxonomie folgt dem Denken. Das Denken folgt nicht der Taxonomie.**
