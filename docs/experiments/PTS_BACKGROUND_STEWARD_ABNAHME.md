# PTS Background Steward — Abnahmekriterien

> Prüfung der Hintergrundpflege (`dsh-plugins/pts-background-steward`) gegen
> die im Kernel vereinbarten Abnahmekriterien. Stand: DSH 0.1.1-rc.2,
> pts-web-Profil, Port 3081. Das Standard-Web (Port 3080) bleibt unberührt.

## Automatisch geprüft (`npm test` im Plugin-Ordner)

| # | Kriterium | Abdeckung |
|---|---|---|
| 4 | Child-Agent-Turns lösen keinen weiteren Steward aus | Observer-Filter (`parentSession`, Child-ID-Menge) — Filterlogik im Code verifiziert; Live-Anteil siehe unten |
| 5 | Mehrere schnelle Turns werden zusammengefasst | `test/scheduler.test.mjs`: Coalescing, Debounce-Reset, Sammelpuffer |
| 6 | Ein veralteter Patch wird niemals übernommen | Hash-Vorher/Nachher-Vergleich vor Anwendung (`stale`); Politiktests in `test/patch-validator.test.mjs`; Transform-Schutz in `test/workspace-state.test.mjs` |
| 7 | `decisions.yml` wird nur bei eindeutiger Lehrerentscheidung verändert | Validator verlangt `teacher_decisions[].explicit: true` mit passender Evidence; Test „decisions.yml ohne explizite belegte Entscheidung" |
| 8 | Drafts bleiben als Drafts markiert | `landscapeAppendMoment` erzwingt `- Status: draft`; Validator lehnt fehlende Pflichtfelder ab; `stable` ist für den Steward nicht erreichbar |

## Bereits live verifiziert (laufende pts-web-Instanz)

| Prüfung | Ergebnis |
|---|---|
| Mount über Junction + Patch-Row (Live-Rekomposition des Watchers) | ✔ Status-Route antwortet |
| Row-Konfiguration erreicht das Plugin (`defaultsUsed: false`) | ✔ provider/model/maxTokens/debounceMs wie gesetzt |
| PTS-Root-Erkennung | ✔ `F:\code\pedagogical-thinking-space` |
| Werkzeugfilter-Zusammensetzung | ✔ `[read, glob, grep]` in der Status-Konfiguration |
| Modellsteuerung über Settings | ✔ `modelSource: "settings"`, `reasoningEffort: "low"`, `reasoningEffortApplied: false`. Hinweis: webServer-/settings-Dienst werden reaktiv via `ctx.inject` erwartet (Aktivierungs-Race beim `apply()`); Code-Änderungen erfordern einen pts-web-Neustart. |
| Standard-Web 3080 unverändert | ✔ Plugin existiert nur als Row des pts-web-Profils |

## Live-Prozedur (manuell, gegen Port 3081)

Voraussetzungen: pts-web läuft; für den Steward ist `lmstudio` /
`ornith-1.5-9b-mtp` über den `pts-background-steward:`-Abschnitt in
`profiles/pts-web/settings.yaml` konfiguriert (LM Studio erreichbar und Modell
geladen) — oder nach Änderung des Settings-Blocks ein anderes Ziel.

1. **Kriterium 1 + 2 (Antwort wartet nicht):**
   Denkraum öffnen (z. B. `ki-und-religion`), einen substanziellen Beitrag
   schreiben. Der Companion-Text erscheint sofort; währenddessen zeigt
   `GET /api/pts-background-steward/status` den Denkraum nach ~1,5 s als
   `running`. Ein weiterer Beitrag ist jederzeit möglich.
2. **Kriterium 3 (anderes Modell):**
   Nach dem Lauf prüfen, dass die Child-Session (Sessionliste des Profils,
   Kind der Companion-Session) Anfragen an `lmstudio/ornith-1.5-9b-mtp`
   gestellt hat (LM-Studio-Log bzw. Modellprovenienz der
   `assistant/message`-Events); alternativ kurzzeitig ein sichtbar anderes
   Modell konfigurieren.
3. **Kriterium 4 (keine Kettenauslösung):**
   Nach Abschluss des Steward-Laufs erneut `/status` aufrufen: keine neuerliche
   `running`-Phase ohne neuen Nutzerbeitrag; die Child-Session taucht nicht als
   neuer Trigger auf (auch nicht nach deren `turn/end`).
4. **Kriterium 9 (Steward-Absturz):**
   LM Studio stoppen oder Timeout provozieren (`runTimeoutMs` klein setzen):
   Der Job endet als `failed`/`aborted` in `/status` und im Host-Log; der Chat
   bleibt bedienbar, die Companion-Session zeigt keinen Fehler.
5. **Kriterium 10 (keine Toolzeilen im Chat):**
   Während des Laufs und danach: keine Read-/Glob-/Grep-Zeilen und keine
   Schreibaktivität im Gesprächsverlauf (Struktur: nur Companion-Turns).
6. **Kriterium 11 (Port 3080):**
   Standard-Web parallel nutzen — kein Verhaltens- oder Konfigurationsunterschied.
7. **Revisionsschutz unter Last (zu Kriterium 6):**
   Während eines laufenden Steward-Jobs die Datei `learning-design.md` von Hand
   ändern → der Lauf endet mit `stale` in `/status`; die manuelle Änderung
   bleibt unverändert.
8. **Begrüßungsfilter (optional):**
   Mit `minPromptChars > 0`: reine Begrüßung → kein Lauf (Logzeile „ohne
   substanziellen Beitrag").

## Bekannte Grenzen dieses Durchlaufs

- Ein vollständiger Dialog-End-to-End-Lauf wurde bewusst **nicht** automatisiert:
  Er würde echte Sitzungen und Modellaufrufe auf der live genutzten
  pts-web-Instanz erzeugen. Die mechanischen Anteile sind durch Unit-Tests und
  die Live-Verifikation oben abgedeckt; der Rest ist mit der Prozedur oben in
  wenigen Minuten geprüft.
- Ein eigener picker-sichtbarer Preset `pts-steward` bleibt zurückgestellt, bis
  ein Spike bestätigt, dass DSH 0.1.1-rc.2 Children zuverlässig mit konkreter
  Preset-ID erzeugt (derzeit: Spawn erbt die Eltern-Preset-Komposition;
  Modell/Persona/Werkzeuge sind bereits vollständig entkoppelt).
