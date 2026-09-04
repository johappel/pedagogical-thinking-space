---
id: ppt-builder
name: ppt-builder
description: Baut aus einem markdown-basierten Folien-Entwurf eine PPTX-kompatible Struktur (Titel-/Inhaltsfolien, Sprechernotizen), ohne das Lernziel zu verändern.
roles: [material, renderer]
status: draft
---

# PPTX-Builder aus Markdown-Entwurf

Konvertiert einen markdown-basierten Folien-Entwurf in eine PPTX-kompatible
Zwischenstruktur. Der Skill ist bewusst **format-, nicht didaktisch**:
Bedeutung, Sprache und Lernziel des Entwurfs bleiben unangetastet.

## Eingabe

- Ein Markdown-Dokument mit Folien-Abschnitten:
  - `# Titel` → Titelfolie
  - `## Überschrift` → neue Inhaltsfolie
  - Bullet-Listen, Tabellen und `> Notiz`-Zeilen
- Die Zielstruktur wird als JSON/Strukturdatei unter
  `workspace/<slug>/rendered/pptx/` abgelegt.

## Ablauf

1. Lese den Markdown-Entwurf und zerlege ihn in Folienblöcke.
2. Bilde jeden `##`-Block auf eine Inhaltsfolie ab; `> Notiz`-Zeilen werden
   Sprechernotizen, Tabellen zu PPTX-Tabellen, Bullets zu Textfeldern.
3. Schreibe die Struktur als `.pptx`-fähige Datei (officedruck) oder als
   manifestierte PPTX (abhängig von der Renderer-Aufgabe) unter
   `rendered/pptx/<name>.pptx`.

## Ergebnis

- Pfad der erzeugten Datei und eine Liste der getroffenen Format-Entscheidungen
  (z. B. „Tabelle 2 wurde auf Folie 4 gespalten").
- Bei Widersprüchen im Entwurf: nicht umbauen, sondern im Bericht benennen.
