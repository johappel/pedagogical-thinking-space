# DSH PTS Web Profile — Architektur- und Installationsspike

> **Status:** abgeschlossen (2026-08-24) · **Ergebnis: PARTIAL** (Details in §13)
>
> Ein eigenes, separat startbares `pts-web` existiert und läuft stabil parallel zum
> unveränderten Standard-DSH-Web. Der parallele Betrieb mit **gemeinsamem Session-Store**
> ist für unterschiedliche Sessions sauber, für dieselbe Session aber nur mit
> Disziplinregeln sicher (§7/§8) — daher PARTIAL statt PASS.

---

## 1. Verwendete Versionen

| Komponente | Wert |
|---|---|
| DSH (`@deepseek-ai/dsh`) | **0.1.1-rc.2** |
| Installationspfad | `C:\Users\Joachim\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh` |
| Node | v24.19.0 (nvm4w, Shim `C:\nvm4w\nodejs\dsh.ps1`) |
| `$DSH_HOME` | `C:\Users\Joachim\.dsh` (Umgebungsvariable gesetzt) |
| OS | Windows (Junctions, deutsches Locale) |

## 2. Aufbau des Standard-Web (unverändert übernommen)

Ein DSH-Profil ist ein Verzeichnis unter `$DSH_HOME\profiles\<name>\`:

```
profiles/web/
├── package.json          # Manifest: dsh.profile.bundles = [dsh-base, dsh-web-app]
├── cordis.yml            # LEERE Root-Liste; wird bei JEDEM Boot neu geschrieben
├── cordis.patch.yml      # persönliche Patch-Ebene (User-Layer)
├── pnpm-workspace.yaml   # nodeLinker: hoisted (für Out-of-Tree-Plugins)
└── node_modules/         # optionale Junctions für eigene Plugin-Pakete
```

**Komposition zum Boot** (Reihenfolge, später übersetzt früher komplett per Row-`id`):

1. Bundle-Layer in `dsh.profile.bundles`-Reihenfolge (`dsh-base`, dann `dsh-web-app`)
2. Profil-Patch-Ebene `cordis.patch.yml`
3. Home-Patch-Ebene `$DSH_HOME\cordis.patch.yml` (optional, maschinenweit)
4. `--patch`-Overlays der CLI
5. Telemetrie-Schalter (Env)

Wichtige Mechaniken (aus dem installierten Code verifiziert, nicht geraten):

- `prepareProfile()` schreibt `cordis.yml` **bei jedem Boot neu** → jeder Boot braucht
  Schreibrecht im Profilverzeichnis.
- **Zwei-Anker-Auflösung:** Bundle-Pakete kommen immer aus der Installation, nie aus dem
  Profil. Eigene Plugins werden vom Loader via Parent-Walk gefunden:
  `<profil>\node_modules` → `$DSH_HOME\profiles\node_modules` (geheilte Junction-Farm
  des Installationsabschlusses, pro Boot idempotent gepflegt).
- Port: Der Row `webserver` (`@deepseek-ai/dsh-host-webserver`) liest
  `port: ctx.webStartup.port ?? 3080`; das App-Flag `--port N` setzt `webStartup.port`.
- Der laufende Web-Host **watcht** beide User-Patch-Ebenen und recomponiert live
  (`watchUserPatches`) — Patch-Edits greifen ohne Neustart.
- Client-Roster: Rows mit `dsh.client`-Marker werden zu `window.__DSH_BOOT__.entries`
  und unter `/plugins/<pkg>/client.js` serviert.

## 3. Aufbau von `pts-web`

```
$DSH_HOME\profiles\pts-web\
├── package.json          # identische Bundles wie web: [dsh-base, dsh-web-app]
├── cordis.yml            # leere Root (Boot schreibt sie ohnehin neu)
├── cordis.patch.yml      # PTS-Patch-Ebene (siehe unten)
├── pnpm-workspace.yaml   # identisch zu web
├── cordis.patch.yml.pre… # — entfällt; Backup liegt unter profiles\web\ !
└── node_modules\
    ├── pts-activity-stream  → Junction → F:\code\pedagogical-thinking-space\dsh-plugins\pts-activity-stream
    ├── pts-artifact-panel   → Junction → F:\code\pedagogical-thinking-space\dsh-plugins\artifact-panel
    └── pts-web-brand        → Junction → F:\code\pedagogical-thinking-space\dsh-plugins\pts-web-brand
```

**Kein Fork:** Das Profil dupliziert nur die vier kleinen Steuerdateien (zwei davon
identisch zum shipped Template). Die komplette Oberfläche kommt aus denselben
Bundels der Installation. Keine shipped-Datei wurde editiert.

### Die PTS-Patch-Ebene (`profiles\pts-web\cordis.patch.yml`)

```yaml
- insert:
    - id: pts-web-brand
      name: pts-web-brand
    - id: artifact-panel
      name: pts-artifact-panel
      inject: [webServer]
    - id: pts-activity-stream
      name: pts-activity-stream

- id: webserver                     # Patch ersetzt die ganze Row → alle Keys restaten!
  name: '@deepseek-ai/dsh-host-webserver'
  inject: [webStartup]
  config:
    host: !!js ctx.webStartup.host ?? '127.0.0.1'
    port: !!js ctx.webStartup.port ?? 3081     # ← Profil-Fallback-Port
```

Der Port ist bewusst **nicht hardcodiert**, sondern nur der *Fallback* dieser Ebene:
`dsh --profile pts-web --port X` hat weiterhin Vorrang.

## 4. Wiederverwendung vs. Eigenleistung

| Teil | Quelle |
|---|---|
| Gesamte Shell, Conversation, Settings, Agent-Infrastruktur | shipped Bundles (Installation) |
| Frontend-Dist, API-Gateway, Session-Persistenz | shipped Bundles (Installation) |
| PTS-UI-Plugins | Repo `dsh-plugins/*` via Junction |
| Ports, Plugin-Aktivierung | Profil-Patch-Ebene |

## 5. Aktive PTS-Plugins (nur im pts-web)

| Paket (Repo) | Version | Wirkung |
|---|---|---|
| `pts-activity-stream` | 0.2.0 | Takeover `conversation.chat.node` Keys `tool-call`/`context` @ priority −1: technische Tool-Zeilen → teacher-facing Aktivitätseinheiten |
| `pts-artifact-panel` | 0.1.0 | Takeover `details` + `conversation.details.tool` @ −1, Chain-Sitz `conversation.chat.turnTail` @ −1, Tab „Artefakte" (`conversation.view`), Host-Route `/artifacts/v2/*` |
| `pts-web-brand` | 0.1.0 | **Neu (Spike §10):** `sidebar.brand.mark`/`sidebar.brand.name` @ −1 („P"-Kreis + „Pedagogical Thinking Space"), `document.title = "PTS · Denkraum"` (verzögert reassertet) |

Keine doppelten Varianten: dieselben Slots werden nicht gleichzeitig durch ein
dynamisches Prototyp-Plugin belegt.

## 6. Ports & Start

| Oberfläche | Port | Start |
|---|---|---|
| Standard DSH Web | **3080** | `dsh web` bzw. `dsh --profile web` |
| PTS Web | **3081** | `dsh --profile pts-web` oder `scripts\start-pts-web.ps1` |

Port-Override jederzeit: `--port <n>` (App-Flag). Beide binds auf `127.0.0.1`;
`--host 0.0.0.0` ist upstream absichtlich gesperrt.

```powershell
# komfortabel:
powershell -File scripts\start-pts-web.ps1 [-Open] [-Port 3082]
# direkt:
dsh --profile pts-web --no-open
```

Beide Instanzen waren während des gesamten Spikes **gleichzeitig** am Netz
(Standard-Web = der laufende Host-Prozess dieser Session, PID 3928).

## 7. Session-/Persistenzarchitektur und Sharing-Befund

### Ablageorte (Host-Plane, profilscharf geteilt)

| Pfad | Inhalt | Backend |
|---|---|---|
| `$DSH_HOME\sessions\<workspace-slug>\<sessionId>\session.jsonl.zstd` | Append-only Event-Logs je Session (Workspace = cwd!) | `dsh-session-persistence-jsonl` |
| `$DSH_HOME\storages\session_projcache.json` | Projektions-Cache (Titel, Statistiken, Listen-Metadaten) | `dsh-storage-json` |
| `$DSH_HOME\storages\workspace.json` | Workspace-Registry | `dsh-storage-json` |
| `$DSH_HOME\settings.yaml` | Einstellungen | settings-file |
| SQLite-Fulltext-Query | im Web-Profil **deaktiviert** (`':memory:'`, `openAt: never`) | kein Datei-Lock-Thema |

### Offizielle Verträge (aus den shipped READMEs)

- `dsh-session-persistence-jsonl`: **„One live writer per session"** — append/repair
  koordiniert nur innerhalb der besitzenden Backend-Instanz; „another backend instance
  **or process must not write the same session** until that owner reaches quiescent
  disposal". Materialisierung ist kollisionssicher (no-overwrite), danach Append-only
  mit Contiguous-seq-Prüfung.
- `dsh-storage-json`: **„No cross-process write locking"** — zwei Prozesse auf demselben
  Root interleaven Whole-File-Replaces (**last write wins**, verlorene Updates möglich);
  Multi-Process ist explizit vertagt.

### Empirische Befunde (CDP-gesteuerter Chrome gegen beide Flächen)

| Test | Ergebnis |
|---|---|
| **A)** Gleiche persistierte Sessions sichtbar? | **Ja.** `session.list` liefert auf beiden Flächen identische ID-Mengen desselben Workspace-cwd (Live-Disk-Read). Eine im PTS-Web erzeugte+beschriebene Session erschien sofort in der Liste des Standard-Webs. |
| **A′)** Sidebar-Index auf der *fremden* Fläche? | **Verzögert.** Titel/Ranking/„blank"-Filter der Sidebar stammen aus `session_projcache.json` (Snapshot beim Prozessboot; storage-json beobachtet Fremd-Writes nicht). Neue Sessions des anderen Hosts fehlen/misranken dort **bis zu dessen Neustart**. Nachweislich selbstheilend: PTS-Web-Restart → Eintrag korrekt sichtbar. Direkter Datenzugriff (History-RPC) funktioniert auch ohne Restart sofort. |
| **B)** Dieselbe Session gleichzeitig geöffnet? | **Ja, lesend unproblematisch.** Dieselbe Session war parallel in beiden Flächen offen; History renderte beim Besitzer vollständig; keine Fehler/Banner. Besitzer-UI bekommt Live-Updates, zweiter Prozess sieht den Öffnungszeitpunkt (kein Cross-Prozess-Push — erwartet). |
| **C)** Gleichzeitige Schreibaktivität in dieselbe Session? | **Nicht ausgeführt** — verstößt nachweisbar gegen den One-live-writer-Vertrag (Contiguous-seq + instanzlokaler Cursor ⇒ Interleaving/Desync-Risiko). Disziplinregel siehe §8. |
| **D)** Resume nach Flächenwechsel? | **Ja.** Im PTS-Web geschriebene Turn-Events lagen korrekt im JSONL-Log, wurden vom anderen Host per History gelesen und nach dessen Restart voll in der UI geführt. |
| UI-Zustand | Browser-localStorage ist **origin-getrennt** (`:3080` ≠ `:3081`): `dsh.workspace.view.v5`, `dsh.sessions.current` etc. persistieren je Oberfläche — die Flächen kämpfen nicht um den „aktuellen Session"-Zeiger. Beobachtung: „Running"-Badge erscheint nur im besitzenden Prozess (prozeslokal). |

## 8. Sichere Betriebsregeln (dünnste Lösung, keine neue Sync-Schicht)

1. **Eine Session wird immer nur von genau einer Instanz beschrieben.**
   Zum Wechsel der Oberfläche: dort schließen/ruhen lassen und idealerweise die alte
   Instanz neu starten (quiescent disposal), bevor die andere Fläche weiterschreibt.
2. Paralleler Betrieb für **unterschiedliche Sessions** ist ohne Einschränkung sauber
   (getrennte Logs, append-only, kollisionssichere Erstanlage).
3. Frisch in der anderen Instanz entstandene Sessions erscheinen im eigenen Sidebar-Index
   erst nach eigenem Neustart — Datenzugriff geht trotzdem sofort; nicht als Fehler
   interpretieren, ggf. Instanz neu starten.
4. Variantenbewertung (§8 des Auftrags):
   - **Variante A (2 Web-Prozesse, gemeinsame Runtime/Store):** aktueller Stand; ok mit Regel 1–3.
   - **Variante B (PTS-Web nur alternative Client-Surface auf demselben Host):** würde alle
     Sharing-Themen eliminieren (ein Prozess, zwei Ports/Roster) — braucht upstream eine
     zweite `webserver`-Bind im selben Baum; heute nicht ohne Patch-Ebene abbildbar,
     weil `webserver` eine Single-Bind-Row ist. Langfristig die sauberste Option.
   - **Variante C (separates DSH_HOME für pts-web):** maximale Isolation, aber Session-
     Kontinuität zwischen den Flächen wäre ganz weg und Modell-/Credentials-Setup doppelt.
     Für den Spike verworfen.

## 9. Parallelbetriebs-Nachweis (Zusammenfassung)

- Beide Hosts liefen durchgängig parallel (3080 + 3081).
- HTTP: Index + Roster auf beiden; PTS-Routen exklusiv auf 3081; `/artifacts/v2/*`
  antwortet mit JSON-Dispatcher-Fehlern (= registriert).
- CDP-UI: keine Loader-Fehlerbanner auf beiden Flächen; Sidebar-Vergleich;
  End-to-End-Prompt im PTS-Web (New Session → Prompt → Modellantwort → Log-Datei).
- Hot-Reload: Entfernen der PTS-Rows aus `profiles\web\cordis.patch.yml` wurde vom
  laufenden Standard-Web ohne Neustart sauber recomponiert (Roster 404, Host lebendig).

## 10. Bekannte Risiken

| Risiko | Bewertung | Minderung |
|---|---|---|
| Doppelter Live-Writer auf einer Session (2 Prozesse) | Vertraglich verboten, real corruptiv | Regel §8.1; Produktphase: Variante B |
| Sidebar-/Projektions-Staleness auf lange laufender Gegeninstanz | Kosmetisch/funktional leicht | Neustart der Instanz; Aufklärung der Nutzer |
| `storages/*.json` Last-Write-Wins über Prozesse | Selten heutzutage (workspace.json/projcache), aber real | Nicht simultan instanzübergreifend umstrukturieren (Workspaces/Settings) |
| Boot braucht Schreibrecht in `$DSH_HOME` (`cordis.yml`-Rewrite, Junction-Healing) | Betriebsumstand | Serverkontext mit entsprechenden Rechten starten |
| Phantom-Leer-Sessions bei Automatisierungs-Churn (jede frische Seite kann Header materialisieren) | Kosmetisch | Testartefakte gelöscht (§12) |
| Junctions sind absolute Pfade | Umzug des Repos bricht Auflösung | Junctions neu anlegen (Skript §12) |
| Beide Flächen teilen Modell-Credentials/Kontingente | Erwartet | Bewusst so (dieselbe Runtime) |

## 11. Rollback (vollständig, in dieser Reihenfolge)

1. **pts-web stoppen:** Konsole Ctrl+C bzw. Hintergrundjob beenden.
2. **Profil entfernen/deaktivieren:** `$DSH_HOME\profiles\pts-web\` löschen (oder erst nur
   die drei `node_modules`-Junctions entfernen, um das Profil dormient zu halten).
3. **Patch-Ebene des Standard-Web wiederherstellen:** Entweder
   `Copy-Item $DSH_HOME\profiles\web\cordis.patch.yml.pre-pts-migration.bak
   $DSH_HOME\profiles\web\cordis.patch.yml -Force`
   oder manuell die beiden dokumentierten `insert`-Rows zurückkopieren (stehen als
   Kommentar in der aktuellen Datei). Der laufende Standard-Web recomponiert hot;
   sonst genügt der nächste reguläre Start.
4. **Standard-Web neu starten** (falls nicht hot): `dsh web`.
5. Repo-seitige Dateien (`dsh-plugins/pts-web-brand`, `scripts/start-pts-web.ps1`,
   `scripts/pts-cdp-*.mjs`, diese Doku) sind inert und können bleiben oder entfernt werden.

Nach Schritt 4 läuft das Standard-Web exakt wie vor dem Spike (PTS-Plugins inklusive,
falls Schritt 3 das Backup zurückkopiert).

## 12. Geänderte / erzeugte Dateien

**Im Repository `F:\code\pedagogical-thinking-space`:**

| Datei | Zweck |
|---|---|
| `dsh-plugins/pts-web-brand/package.json` | Neu: minimale PTS-Kennung (Client-UI) |
| `dsh-plugins/pts-web-brand/lib/index.js` | Host-Hälfte (leeres apply) |
| `dsh-plugins/pts-web-brand/lib/client.js` | Brand-Slots @ −1 + Titel-Retry |
| `scripts/start-pts-web.ps1` | Startkomfort für pts-web |
| `scripts/pts-cdp-probe.mjs`, `-probe2.mjs`, `-probe3.mjs` | CDP-UI-/Roster-Probes (Testwerkzeug) |
| `scripts/pts-cdp-drive.mjs` | End-to-End-New-Session/Prompt-Treiber (Testwerkzeug) |
| `scripts/pts-cdp-open.mjs`, `pts-cdp-meta.mjs`, `pts-cdp-history.mjs` | Open/Metadata/History-Probes (Testwerkzeug) |
| `docs/experiments/DSH_PTS_WEB_PROFILE.md` | diese Dokumentation |

**Außerhalb des Repos (alle reversibel):**

| Pfad | Änderung |
|---|---|
| `$DSH_HOME\profiles\pts-web\**` | **Neu** angelegt (4 Dateien + 3 Junctions) |
| `$DSH_HOME\profiles\web\cordis.patch.yml` | Zwei PTS-insert-Rows entfernt (Hot-Reload aktiv); Wiederherstellungs-Kommentar eingefügt |
| `$DSH_HOME\profiles\web\cordis.patch.yml.pre-pts-migration.bak` | Backup des Ist-Zustands vor Migration |
| `$DSH_HOME\sessions\...\session-{fbc1c362,7910626c,4c32fbbd}-*` | Spike-Testsessions wieder **gelöscht** |

**Nicht angefasst:** alles unter dem Installationspfad `...\@deepseek-ai\dsh` (shipped
Bundles, Patches, Frontend-Dist), shipped `agent-presets`, `settings.yaml`,
`$DSH_HOME\cordis.patch.yml` (existiert nicht/wurde nicht angelegt), PTS-Kernel-Dateien,
`AGENTS.md`.

### Trennungsdisziplin (Auftrag §11)

Das Profil enthält **keinen** PTS-Kernel: keine Kernel-Dateien, kein `AGENTS.md`,
keine Workspace-Artefakte. Die Companion-Identität bleibt im PTS-Workspace bzw.
dessen übergeordnetem Kernel; `pts-web` stellt ausschließlich die Oberfläche bereit.

## 13. Akzeptanzkriterien und Einstufung

- [x] Standard-Web weiterhin unverändert startbar (läuft seit Spike-Anfang durch; Patch-Ebene wieder generisch)
- [x] `pts-web` als eigene Web-Variante existiert
- [x] Unterschiedliche Ports (3080 / 3081)
- [x] Beide gleichzeitig lauffähig (durchgehend getestet)
- [x] `pts-activity-stream` nur im pts-web aktivierbar (Junction+Row ausschließlich dort)
- [x] Weitere PTS-Plugins einbindbar (artifact-panel aktiv; Muster pts-web-brand zeigt Einbindung neuer Pakete)
- [x] Keine shipped DSH-Dateien editiert
- [x] Kein PTS-Kernel ins Profil kopiert
- [x] Session-Sharing real untersucht (Codeverträge + CDP-Experimente)
- [x] Parallelzugriff auf dieselbe Session real untersucht (lesend; schreibend bewusst nicht zerstörerisch getestet)
- [x] Risiken gemeinsamer Persistenz dokumentiert
- [x] Rollback dokumentiert (+ Backup-Datei liegt bereit)
- [x] Klares Ergebnis in dieser Datei

### Einstufung: **PARTIAL**

**Begründung:** Parallelbetrieb, Profiltrennung und Plugin-Exklusivität funktionieren
stabil und sind eine tragfähige Grundlage. Aber: Session-Sharing über zwei Prozesse hat
relevante Einschränkungen — derselbe Store darf pro Session nur von einem Prozess
schreibend genutzt werden (offizieller Vertrag), und Listen-/Titel-Metadaten der
Gegeninstanz aktualisieren sich erst bei deren Neustart. Für den produktiven Anspruch
(„PTS-Web als Dauer-Oberfläche neben technischem Standard-Web") ist das mit den
Disziplinregeln §8 beherrschbar; solange es gilt, ist PARTIAL die ehrliche Note.

## 14. Nächste Schritte (Vorschläge)

1. **Nutzungsmodell festlegen:** PTS-Web als primäre Lehrerfläche (dann Standard-Web
   meist ruhend) — damit verschwinden die Sharing-Einschränkungen in der Praxis.
2. **Upstream-Option Variante B prüfen:** zweite Webserver-Bind/Client-Roster pro
   Surface im selben Host-Prozess anregen (eliminiert sämtliche Two-Process-Themen);
   bis dahin Disziplinregeln §8 als Betriebshinweis dokumentieren.
3. **pts-web produktiv ausbauen** auf dem etablierten Overlay-Muster (nächste
   PTS-Perspektiven als weitere Repo-Plugins + Rows in `profiles\pts-web\cordis.patch.yml`),
   inklusive kleinem Healthcheck im Startskript (Roster-/Port-Probe nach Boot).

## 15. Verifikation der strukturierten Companion-Fragen (2026-08-25)

Die installierte DSH-Version ist `0.1.1-rc.2`. Die tatsächlich verwendete
Komposition des Profils `pts-web` besteht aus `dsh-base@0.1.1-rc.2`,
`dsh-web-app@0.1.1-rc.2`, dem User-Preset `pts-companion` aus
`$DSH_HOME/.agent-presets/pts-companion/agent.cordis.yml` und den vier
PTS-Plugins aus `dsh-plugins/`.

`@deepseek-ai/dsh-tool-ask-user@0.1.1-rc.2` ist im `pts-companion`-Preset als
`tool-ask-user` aktiv. `@deepseek-ai/dsh-user-questions@0.1.1-rc.2` wird im
unveränderten `dsh-base` geladen. Die unveränderte `dsh-web-app`-Komposition
lädt `@deepseek-ai/dsh-client-ui-user-questions@0.1.1-rc.2`. Eine eigene
PTS-Frageoberfläche oder eine `/plan`-Aktivierung ist deshalb nicht erforderlich.

Der Profil-Patch musste dafür nicht erweitert werden. Vor einem Profilneustart
ist weiterhin die Backup-Regel für `cordis.patch.yml` einzuhalten; shipped DSH-
Dateien bleiben unangetastet.

Nach dem Neustart des PTS-Web-Prozesses auf Port 3081 wurde mit Chrome-CDP
folgender belastbarer Lauf durchgeführt:

| Test | Ergebnis |
|---|---|
| PTS-Web/Standard-Web parallel | PASS, 3081/3080 antworten mit HTTP 200 |
| PTS-Scope und Scaffold-Dialog | PASS, 10/10 im vorhandenen UI-Treiber |
| Vorläufiger Denkstand ohne Schreibfrage | PASS, beide Denkstand-Dateien aktualisiert |
| Lernmomentstatus | PASS, vorläufig als `draft`, kein `stable` |
| Offene Schwerpunktfrage | PASS, echte `ask_user_question`-Karte sichtbar |
| Auswahlmöglichkeiten | PASS, genau drei Optionen mit didaktischen Folgen |
| Freitextfeld sichtbar | PASS, Feld in der echten Fragekarte vorhanden |
| Auswahl `Motive verstehen` | PASS, Auswahl wurde per UI ausgelöst |
| `decisions.yml` vor der Entscheidung | PASS, blieb leer |
| Freitextantwort, Überspringen, Schließen | nicht belastbar abgeschlossen; das lokale Modell erzeugte in Wiederholungsläufen nicht reproduzierbar eine neue Fragekarte |

Der erfolgreiche Test-Denkraum wurde nach `workspace/.trash/` verschoben. Sein
Diff zeigt den dokumentierten Zwischenstand und die unveränderte leere
`decisions.yml`; er ist für Nachprüfung recoverabel. Die Antwortpfade sollten
mit einem stabilen tool-fähigen Modell noch einmal als vollständiger
Abnahmelauf ausgeführt werden.
