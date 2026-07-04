# Pädagogischer Denkraum

> **Eine reflektive Architektur für die Zusammenarbeit von Mensch und KI in der Unterrichtsgestaltung**
>
> *Lehrkräfte unterstützen beim Denken — nicht ihr Denken ersetzen.*

---

# Unterrichten ist kein Produktionsproblem.

Sprachmodelle sind bemerkenswert gut darin geworden, pädagogische Artefakte zu produzieren.

Innerhalb von Sekunden können sie erzeugen:

* Lehrpläne,
* Arbeitsblätter,
* Präsentationen,
* Quizze,
* LiaScript-Kurse,
* Moodle-Aktivitäten,
* komplette Unterrichtseinheiten.

Die Herausforderung liegt nicht mehr in der Produktion.

Die echte Herausforderung ist pädagogisches Urteilsvermögen.

Guter Unterricht entsteht nicht, weil jemand ausgezeichnete Arbeitsblätter schreibt.

Guter Unterricht entsteht, weil Lehrkräfte durchdachte didaktische Entscheidungen treffen.

Gute Unterrichtsmaterialien entstehen aus guten pädagogischen Entscheidungen.

Gute pädagogische Entscheidungen entstehen durch gemeinsame Reflexion.

Dieses Projekt erkundet, wie KI diesen Reflexionsprozess unterstützen kann.

---

# Die Vision

Anstatt die Frage zu stellen

> "Welche Stunde soll ich generieren?"

beginnt das Gespräch mit einer anderen Frage:

> **"Was für eine Lernerfahrung wollen wir schaffen?"**

Das Ziel besteht nicht darin, die Lehrkraft zu ersetzen.

Das Ziel besteht darin, das professionelle Denken der Lehrkraft zu stärken.

Die Lehrkraft bleibt verantwortlich für pädagogische Entscheidungen.

KI wird zum nachdenklichen Gestaltungspartner.

---

# Die Kernidee

Das Projekt trennt vier grundlegend unterschiedliche Tätigkeiten, die heutige KI-Systeme oft vermischen.

* Reflexion
* Erfahrung
* Produktion
* Veröffentlichung

Jede verdient ihren eigenen Platz.

Nur Reflexion findet gemeinsam mit der Lehrkraft statt.

Alles andere unterstützt diese Unterhaltung.

---

# Architektur
<img width="1600" height="1100" alt="pedagogical-thinking-space-de" src="https://github.com/user-attachments/assets/23b00ebb-f57e-4395-b092-9f9879db3079" />

Der Critical Friend ist der einzige sichtbare Gesprächspartner.

Alles andere arbeitet leise im Hintergrund.

---

# Das Learning Design

Das Learning Design ist das Herzstück des Systems.

Es ist weder

* ein Lehrplan,
* ein LiaScript-Kurs,
* ein Arbeitsblatt,
* noch ein Moodle-Kurs.

Stattdessen

ist es das gemeinsame pädagogische Verständnis, das von der Lehrkraft und dem Critical Friend entwickelt wird.

Es enthält

* pädagogische Absicht,
* Lernendenkkontext,
* Lernweg,
* Gestaltungsentscheidungen,
* Lernaktivitäten,
* Reflexionen
* und offene Fragen.

Alles andere wird davon abgeleitet.

---

# Reflexion vor Produktion

<img width="1600" height="950" alt="pedagogical-thinking-space-flow-de" src="https://github.com/user-attachments/assets/60668614-1dcd-4b87-a0c7-fc195d07e07c" />

Ein zentrales Designprinzip dieses Projekts ist die bewusste Trennung von Denken und Produzieren.

Das Gespräch läuft weiter, während die Umsetzung an anderer Stelle stattfindet.

Lehrkraft und Critical Friend bleiben auf pädagogische Reflexion konzentriert.

Routinearbeit findet im Hintergrund statt.

Dies schafft einen langsameren und nachdenklicheren Gestaltungsprozess, ohne die Produktion zu verlangsamen.

---

# Kernkomponenten

## CRITICAL_FRIEND.de.md

Definiert das Verhalten des reflektierenden Gesprächspartners.

Der Critical Friend moderiert den Gestaltungsprozess, stellt Fragen, hinterfragt Annahmen und schützt das Denken der Lehrkraft.

---

## LEARNING_DESIGN.md

Definiert den gemeinsamen Gegenstand jedes Gesprächs.

Er repräsentiert das sich entwickelnde pädagogische Design.

---

## ORCHESTRATION.md

Beschreibt, wie der Critical Friend entscheidet

* wann zu reflektieren,
* wann professionelle Erfahrung zu nutzen,
* wann pädagogisches Wissen heranzuziehen,
* wann Arbeit zu delegieren
* und wann zu veröffentlichen.

---

## services/MEMORY.md

Erfasst professionelle Erfahrung.

Nicht Unterhaltungen.

Nicht Dateien.

Pädagogische Muster.

---

## services/KNOWLEDGE.md

Bietet kurierte pädagogische Fachkenntnisse.

Forschung.

Lehrpläne.

Didaktik.

Pädagogische Psychologie.

Rechtliche Rahmenwerke.

Berufliche Praxis.

---

## services/WORKER.md

Wandelt pädagogische Entscheidungen in pädagogische Artefakte um.

Worker nehmen nie an pädagogischer Reflexion teil.

---

## services/RENDERER.md

Drückt ein Learning Design durch verschiedene pädagogische Formate aus.

Beispiele hierfür sind

* LiaScript
* RELIPULS
* Moodle
* H5P
* Druckmaterial
* Lehrerhandbücher

Das pädagogische Design bleibt unverändert.

---

## Teilbares Wissen

Die Knowledge Base kann OKF-kompatibel strukturiert werden.

Das bedeutet: Kuratiertes professionelles Wissen wird als Markdown-Datei mit YAML-Frontmatter abgelegt und kann mit Kolleg:innen über Git, ZIP-Dateien oder andere Repositorien geteilt werden.

OKF-Kompatibilität betrifft vor allem `knowledge/`.

Sie definiert nicht den gesamten Pedagogical Thinking Space.

---

# Designprinzipien

Die Architektur folgt einer kleinen Anzahl grundlegender Prinzipien.

## Menschliches Denken kommt zuerst.

KI unterstützt professionelle Reflexion.

Sie ersetzt pädagogisches Urteilsvermögen nie.

---

## Reflexion vor Produktion.

Pädagogische Entscheidungen sollten der Umsetzung vorausgehen.

---

## Erfahrung vor Optimierung.

Professionelle Erfahrung ist genauso wichtig wie technische Kompetenz.

---

## Ein Gespräch.

Die Lehrkraft spricht immer mit einem Partner.

Niemals mit einem Ausschuss von KI-Agenten.

---

## Stille Dienste.

Erinnerung.

Wissen.

Worker.

Renderer.

Alle bleiben unsichtbar, bis sie gebraucht werden.

---

## Learning Design ist die einzige Quelle der Wahrheit.

Jeder Dienst arbeitet mit dem gleichen pädagogischen Verständnis.

---

# Ein typisches Gespräch

Lehrkraft

> "Ich möchte diese Stunde mit einer Positionslinie beginnen."

Critical Friend

> "Bevor wir die Methode entscheiden:
>
> Was sollen Lernende in dieser ersten Phase erleben?"

Das Gespräch setzt sich fort.

Derweil

bereitet ein Worker einen ersten Entwurf der Positionslinie vor.

Später

kehrt der Critical Friend zurück mit

> "Ein Entwurf ist fertig.
>
> Schauen wir ihn uns an,
>
> oder verfeinern wir zunächst den Lernweg?"

Denken und Produktion werden unabhängig.

---

# Warum dieses Projekt unterschiedlich ist

Die meisten KI-Unterrichtsassistenten optimieren die Produktion.

Critical Friend optimiert pädagogisches Denken.

Das Ziel ist nicht, bessere Prompts zu erstellen.

Das Ziel ist, bessere pädagogische Gespräche zu führen.

---

# Langfristige Vision

Dieses Projekt erforscht eine andere Beziehung zwischen Lehrkräften und KI.

Nicht

Lehrkraft ← KI-Assistent

sondern

Lehrkraft ↔ Critical Friend

arbeiten zusammen an einem gemeinsamen Learning Design.

Bei Erfolg

ist das Ergebnis nicht einfach nur bessere Unterrichtsmaterialien.

Das Ergebnis ist besseres professionelles Urteilsvermögen.

---

# Erste Schritte

Sie benötigen keine Agent-Umgebung, um Pedagogical Thinking Space zu verstehen oder auszuprobieren.

Agent-Umgebungen werden nur benötigt, wenn Sie dateigestützte Workflows, Background Worker oder automatisierte Rendering-Prozesse möchten.

Lesen Sie **GET_STARTED.md** und folgen Sie den Anweisungen.
