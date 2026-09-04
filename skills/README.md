# PTS Skill-Bibliothek

Versionierte, DSH-native Skills für die vier PTS-Worker. Jeder Skill lebt in
`skills/<id>/SKILL.md`; der Verzeichnisname ist die eindeutige Skill-ID und
zugleich der DSH-Skill-Name.

## Frontmatter-Schema

```yaml
---
id: google-search          # slug, kebab-case, eindeutig = DSH-Name = Verzeichnisname
name: google-search        # Pflicht für DSH: muss identisch zu id sein (kebab-case)
description: Google-Suche über CDP statt nativer web_search
roles: [research]          # research | material | review | renderer
status: own                # draft | own | verified
---
```

- **`id` / `name`:** kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). DSH verwirft
  Dateien ohne gültiges `name` und ohne nicht-leeres `description`.
- **`roles`:** für welche Worker die Lehrkraft den Skill im Manager zuweisen
  kann. Ohne Feld beim Import: `roles: []`.
- **`status`:** Vertrauensstufe für die Badge-Anzeige. Ohne Feld beim Import:
  `status: draft`.
- **`description`:** ein Satz, wird auch in den DSH-Skill-Katalog
  (`<available_skills>`) übernommen.

Zusätzliche Frontmatter-Felder sind für DSH unschädlich (nur ein
`metadata:`-Objekt wird durchgereicht).

## Bedienung

- Import/Löschen/Zuweisen läuft über den „Skills"-Tab im Gesprächsraum
  (`pts-skill-manager`), nicht per Hand.
- `status: verified` setzt die Lehrkraft bewusst, nachdem sie den Skill über den
  `pts_material`-→`pts_review`-Flow prüfen ließ.
- Die Zuweisungs-Matrix steht in der Settings-Sektion `pts-worker-skills:` des
  Profils und wirkt für neue Worker-Ausführungen (Komposition wird beim
  Session-Start fixiert).

## Enthaltene Skills

| Skill | Rolle | Status | Zweck |
|---|---|---|---|
| `google-search` | research | own | Google-Suche über Chrome-DevTools-Protokoll statt nativer `web_search` |
| `ppt-builder` | material, renderer | draft | Konvertiert einen markdown-basierten Folien-Entwurf in eine PPTX-Struktur |
