# Migration der PTS-Instanz auf das DSH-0.1.7-alpha.2-Workspace-Modell

Stand: 2026-09-23
Instanz: `DSH_HOME = F:\dsh-instances\pts-017\.dsh`, DataRoot `F:\dsh-instances\pts-017`
Laufzeit: `C:\dsh-labs\dsh-017` (DSH 0.1.7-alpha.2), Profil `pts`
Werkzeug: `scripts/migrate-dsh-017-workspaces.mjs`, Abnahme: `scripts/check-dsh-017-workspace-acceptance.mjs`

Ergebnis in einem Satz: die vier importierten Sessions sind idempotent und nachweisbar
ihrem echten `SessionHeader.cwd` zugeordnet, drei Workspaces wurden dafür angelegt,
kein Session-Log, kein SessionHeader, kein Whiteboard-Snapshot und keine boardId
wurde dabei verändert.

## 1. Auftrag und Ausgangslage

Die Instanz `pts-017` war gestartet worden, bevor die Whiteboard-Kompatibilität für
DSH 0.1.7 fertig war. DSH gruppiert bestehende Sessions nur bei der ersten
Initialisierung des Workspace-Registers. Dieses eine Mal war bereits verbraucht, also
blieben die importierten Sessions trotz gültigem `SessionHeader.cwd` unter
"Ungrouped". Aufgabe war eine idempotente, nachvollziehbare Nachgruppierung.

Die Whiteboard-Kompatibilität selbst war ausdrücklich nicht Teil des Auftrags und
wurde nicht angefasst. `git status` im Whiteboard-Repo zeigt unveränderte
Alt-Änderungen aus der abgeschlossenen Reparatur (`client.js`, `index.js`,
`docs/WHITEBOARD-SPEC.md`, jeweils mit Zeitstempel vor Beginn dieser Arbeit). Diese
Migration hat dort nichts hinzugefügt und nichts geändert.

## 2. Vorgefundene DSH-Mechanik (Phase 1)

Die sechs Fragen, an der echten Implementierung beantwortet:

1. **Wo liegt das Register.** `F:\dsh-instances\pts-017\.dsh\storages\workspace.json`.
   Backend ist `storage-json` mit `root: !!js dshHomePath('storages')`.
2. **Wie liest man bestehende Workspaces.** Über `ctx.workspaceRegistry.list()` und
   `get(id)`. Der `sessionIds`-Getter ist synchron gegen den Header-Index gefiltert,
   liefert also nur Sessions, deren kanonischer cwd noch zur Workspace-Bahn passt.
3. **Wie findet man einen Workspace sicher über den Pfad.** Über
   `registry.resolveByPath(path)`, das ausschließlich auf kanonischer
   `realpath`-Gleichheit matcht. Das Werkzeug baut stattdessen einen Index über
   `list()`, was gleichwertig ist und das Werfen-bei-Nichttreffer vermeidet.
4. **Wie `attachSession` validiert.** Kurzschluss, wenn die Session im gefilterten
   Konto schon steht. Sonst: Header lesbar, `header.cwd` vorhanden, `realpathNormalize`
   löst auf, `stat` ist ein Verzeichnis, `cwd` gleich dem registrierten Pfad. Danach
   läuft `mutate` über die Schreibkette und prüft erneut.
5. **Amtliche Lesenaht für persistierte SessionHeaders.**
   `ctx.sessionPersistence.list()` liefert Snapshots mit abgelöstem `header`. Nur
   Header, keine Event-Körper.
6. **Gibt es einen amtlichen Rebuild oder Migrationsbefehl.** Nein. `bootstrap()` läuft
   genau einmal, gesteuert über `state.initialized`. `initializeDefault()` kehrt sofort
   zurück, sobald `defaultWorkspaceId` gesetzt ist. Die CLI hat keinen Unterbefehl
   dafür. Deshalb der gewählte Weg: ein formales `--patch`-Overlay, also der amtliche
   Kompositionsmechanismus von DSH, ausschließlich über die Domänen-API. Keine
   privaten Speicherdateien wurden von Hand geschrieben.

Nebenbei geprüft: alle sieben persistierten Sessions sind Top-Level
(`delegationDepth: 0`, kein `parentSession`, kein `origin: 'subagent'`). Die
Subagent-Frage aus Phase 2 stellte sich also nicht.

## 3. Das Migrationswerkzeug

`scripts/migrate-dsh-017-workspaces.mjs` hat zwei Rollen in einer Datei:

- **Plugin-Hälfte.** `inject = ['workspaceRegistry', 'sessionPersistence']`. Läuft nur,
  wenn `PTS_WS_MIGRATION_MODE` gesetzt ist, ist also in jedem Profil inert.
- **CLI-Hälfte.** Schreibt ein temporäres Overlay-Patch mit einer `insert`-Zeile und
  startet `dsh --profile pts --patch <tmp> --port 0 --no-open` mit gesetztem
  `DSH_HOME`. Danach liest es den Report und gibt eine Zusammenfassung aus.

Aufruf:

```
node scripts/migrate-dsh-017-workspaces.mjs --dsh-home F:\dsh-instances\pts-017\.dsh --dry-run
node scripts/migrate-dsh-017-workspaces.mjs --dsh-home F:\dsh-instances\pts-017\.dsh --apply
```

Aktionen kommen aus einer geschlossenen Menge: `already-correct`, `attach-to-existing`,
`create-and-attach`, `no-cwd`, `invalid-cwd`, `missing-directory`, `conflict`.

Verbotene Abkürzungen sind im Code nicht enthalten und wurden im Betrieb nicht
beobachtet: kein `process.cwd()`, kein `sandboxPolicy.workspaceRoot`, kein
Default-Workspace als Rückfall, kein Titelabgleich, kein Zeichenkettenvergleich ohne
Kanonisierung, kein Schreiben eines SessionHeaders.

## 4. Abschlussbericht: die zwölf Punkte

1. **Anzahl persistierter Sessions: 7.** Alle sieben Top-Level, null Subagent-Kinder.
2. **Bereits korrekt gruppiert: 3.** Alle drei in `Default workspace`.
3. **Neu zugeordnet: 4.**
   - `session-4be2290a` nach `F:\dsh-instances\pts\denkraeume\Test1`
   - `session-abc8110c` nach `F:\dsh-instances\pts\denkraeume\Freundschaft`
   - `session-b42155a3` nach `F:\dsh-instances\pts\denkraeume\Freundschaft`
   - `session-b1ecce35` nach `F:\dsh-instances\pts\denkraeume\KI und Gott`
4. **Neu angelegte Workspaces: 3.** `KI und Gott` (`d367a0f4`), `Freundschaft`
   (`b6fd44ce`), `Test1` (`0374e4d2`).
5. **Sessions ohne gültigen cwd: 0.** Aufgeschlüsselt: `no-cwd` 0, `invalid-cwd` 0,
   `missing-directory` 0.
6. **Konflikte: 0.** Weder im Trockenlauf noch im Anwenden noch im zweiten Lauf.
7. **Zustand "Default workspace".** Pfad `F:\Documents\deepseek-harness\Default workspace`,
   Verzeichnis vorhanden, ID `87c5bce9-30ea-48e9-9e2b-01b0c9f6d729`. Sie ist die in
   `defaultWorkspaceId` eingetragene Bahn, und dieser Eintrag ist unverändert. Drei
   Sessions hängen an ihr, alle drei waren schon vor der Migration korrekt. Die drei
   Logs sind 340, 425 und 418 Byte groß, also reine Header-Stümpfe aus den früheren
   `pts-017`-Starts. **Bewertung: sinnvoll zu behalten, nicht entbehrlich.**
   `initializeDefault()` kehrt bei gesetztem `defaultWorkspaceId` immer früh zurück, ein
   Löschen wäre über die Automatik nicht wiederherstellbar. Nicht gelöscht.
   **Nicht migrationsrelevant:** sie war vorher und nachher korrekt.
8. **Zustand "KI und Gott".** Neuer Workspace `d367a0f4-8b77-4500-bb6f-834d693f9184`,
   Pfad `F:\dsh-instances\pts\denkraeume\KI und Gott`, Verzeichnis vorhanden, genau eine
   Session (`session-b1ecce35`). Maßgeblich ist der tatsächlich gespeicherte Header-cwd,
   nicht ein älterer Dokumentationspfad. Die in der Aufgabe genannten
   `F:\dsh-workspaces\pts\KI und Gott` und `F:\dsh-instances\pts-017\denkraeume\KI und Gott`
   sind **nicht** der cwd dieser Session. In der Sidebar erscheint die Session unter der
   Gruppe "KI und Gott", wie erwartet.
   **Einschränkung, siehe Punkt 9 der Diagnosen:** das Board dieser einen Bahn lädt
   nicht, und zwar wegen eines Altdatensatzes, der schon vor der Migration dort lag.
9. **Trockenlauf und Anwenden.**
   - Trockenlauf: 7 Sessions, 3 bereits korrekt, 4 `create-and-attach`,
     0 `attach-to-existing`, Änderungen **0**, Registerdatei unverändert `true`,
     Session-Logs unverändert `true`, Snapshots unverändert `true` (4 Ziele),
     geplante Gruppierung vollständig `true`.
   - Anwenden: 3 Workspaces angelegt, 4 Sessions angehängt, Konflikte 0,
     Änderungen 7, Registerdatei geändert (erwartet), Session-Logs unverändert `true`,
     Snapshots unverändert `true`, alle korrekt gruppiert `true`.
10. **Zweiter Lauf, Idempotenz.** 7 bereits korrekt, 0 `attach-to-existing`,
    0 `create-and-attach`, 0 angelegte Workspaces, 0 angehängte Sessions, Konflikte 0,
    **Änderungen 0**, Registerdatei unverändert `true`, Logs und Snapshots unverändert
    `true`. Keine Doppelanlage, kein Doppelanhängen, die Reihenfolge der bestehenden
    korrekten Mitgliedschaft blieb erhalten.
11. **Browser-Abnahme (Phase 8): bestanden, mit einem benannten Vorbehalt.**
    Protokoll in Abschnitt 6. Der Vorbehalt ist die eine Bahn "KI und Gott", deren
    Board wegen des Altdatensatzes nicht lädt. Das ist kein Identitäts- und kein
    Gruppierungsfehler.
12. **Vier Bestätigungen.**
    - **Keine Session-Logs verändert.** Jede `session.v<N>.jsonl.zstd` wurde vor und
      nach dem Lauf gehasht: unverändert `true`.
    - **Keine SessionHeaders verändert.** Der Header ist der erste Datensatz des
      Session-Logs. Identische Log-Hashes beweisen identische Header. Das Werkzeug hat
      zudem keinen Schreibpfad zu Headern.
    - **Keine Whiteboard-Snapshots verändert.** Vier Snapshot-Ziele vor und nach dem
      Lauf gehasht, plus eine Nachmessung nach dem Boot: unverändert `true`.
    - **Keine boardId durch die Gruppierung geändert.** Die boardId ist eine reine
      Funktion des kanonischen cwd. Der cwd ist unverändert, also auch die boardId.
      Gemessen: alle sechs auflösbaren Sessions liefern exakt den Wert, den
      `boardIdForWorkspace(cwd)` unabhängig nachrechnet, und die gespeicherten
      Snapshots tragen dieselben IDs mit ihren alten Versionen (Test1 Version 481,
      Freundschaft 67, Default workspace 6).

## 5. Diagnosen zu Phase 6, 7 und 9

**Phase 6, Default workspace.** Siehe Punkt 7. Drei Sessions, alle vorher korrekt,
`defaultWorkspaceId` zeigt auf sie. Behalten.

**Phase 7, KI und Gott.** Maßgeblich ist der gespeicherte Header-cwd
`F:\dsh-instances\pts\denkraeume\KI und Gott`. Drei Verzeichnisse mit fast gleichem
Inhalt existieren, aber nur eines ist der cwd dieser Session. Der Workspace zeigt
nach der Migration auf genau dieses, mit genau einer Session.

**Phase 9, der Altdatensatz.** `KI und Gott\.dsh-whiteboard\snapshot.json` in der
Zielbahn deklariert `boardId workspace-653007c12fd903f6fe170c81bf6e94b2`, Version 930.
Der zu seinem eigenen Pfad gehörende Wert wäre `workspace-adf201176319695f43b75a9d60193b8e`.
Der deklarierte Wert gehört zu `F:\dsh-workspaces\pts\KI und Gott`. Dort liegt die
Originaldatei mit Version 934, also einem **höheren** Stand. Die Datei in der Zielbahn
ist damit eine ältere Kopie, die einen fremden Board-Namen mitgeschleppt hat.
Byte-Vergleich: die Dateien in `F:\dsh-instances\pts\denkraeume\KI und Gott` und in
`F:\dsh-instances\pts-017\denkraeume\KI und Gott` sind identisch (SHA-256-Kopf
`dd820e963fc92ba6136dfc8728d19cb4`).

Folge, gemessen: `wb-board` für `session-b1ecce35` antwortet mit HTTP 500 und
`ungültiges Whiteboard-Snapshot-Format`. Der Store wirft bei abweichender boardId,
statt auf einen Zweitspeicher auszuweichen. Die Identität der Bahn ist dabei korrekt
aufgelöst, sonst käme die Fehlermeldung "Session oder Workspace nicht gefunden". Nur
der Inhalt der Datei passt nicht zu ihrem eigenen Pfad.

**Dieser Fehler ist nicht durch die Migration entstanden.** Die boardId hängt allein
am cwd, der cwd ist unverändert, und die Datei wurde nicht angefasst (Hash unverändert).
Der zugehörige Session-Log enthält zudem schon vom 2026-09-20, also Tage vor dieser
Arbeit, die Rückmeldung an den Nutzer, dass der gespeicherte Stand sich nicht auslesen
ließ. Der Befund ist damit älter als die Migration.

**Nicht angefasst:** die Datei wurde nicht gelöscht, nicht migriert, nicht
überschrieben. Sie ist hiermit nur diagnostiziert.

## 6. Protokoll der Browser-Abnahme (Phase 8)

Aufbau: eigener Start, um die laufende Nutzerinstanz auf Port 3030 (PID 3908) nicht zu
berühren.

```
cd C:\dsh-labs\dsh-017
DSH_HOME=F:\dsh-instances\pts-017\.dsh
node --import tsx/esm apps/cli/src/bin.ts --profile pts --port 3040 --no-open
```

- URL: `http://127.0.0.1:3040/?token=<Token aus der Startmeldung>`
- Browser: Chromium headless, Viewport 1700 mal 1100, `waitUntil: domcontentloaded`
- Werkzeug: `playwright-core` direkt, Skript im Repo
- Wartezeiten: 6 s auf die Session-Liste, 900 ms je Gruppenaufklappen, bis 20 s auf
  Canvas oder Fehlerüberlagerung

Ergebnis, in der Reihenfolge der Aufgabe:

1. **Workspace-Sidebar geöffnet.** Sichtbar sind die Gruppen `KI und Gott`,
   `Freundschaft`, `Test1`, `Default workspace`. Kein Eintrag "Ungrouped" mehr.
2. **Zuvor ungruppierte Sessions unter ihrem echten cwd.** Nach dem Aufklappen der
   Gruppen:
   - `KI und Gott` enthält `session-b1ecce35`
   - `Freundschaft` enthält `session-b42155a3` und `session-abc8110c`
   - `Test1` enthält `session-4be2290a`
   - `Default workspace` enthält die dritte Stumpf-Session
3. **Session geöffnet.** `session-4be2290a` (Test1) angeklickt, Hauptansicht wechselt.
4. **Board geöffnet.** Schwebender Öffner `button.wb-opener` angeklickt.
   `tldrawCanvasMounted: 1`, `boardErrorVisible: false`, Panelinhalt zeigt echte
   Board-Daten (Zettel und Rahmen aus dem gespeicherten Stand).
5. **Kein Identity-Fehler, dasselbe Board, keine boardId-Änderung.** `wb-board` für
   `session-4be2290a` liefert `workspace-d3bfeb585ceb36b84f5fd906b108b943`, Version 481.
   Das ist exakt die boardId und die Version der vor der Migration dort liegenden
   Snapshot-Datei. Die Gruppierung hat daran nichts geändert, weil sie die boardId
   nicht berührt.
6. **Session gewechselt.** Von `session-cf61495d` über `session-4be2290a` zu
   `session-b1ecce35`, jeweils mit Anklicken der Zeile.
7. **Verschiedene cwd, verschiedene Workspaces und Boards.** Test1
   `workspace-d3bfeb58`, Freundschaft `workspace-300ff4ab`, Default workspace
   `workspace-6c275ad7`, KI und Gott `workspace-adf20117` (Identität aufgelöst,
   Laden scheitert am Altdatensatz). Vier verschiedene cwd, vier verschiedene
   Board-Namen.
8. **Gleiches cwd, gleiche Gruppe und gleiche boardId.** Freundschaft hat zwei
   Sessions in derselben Gruppe und beide liefern `workspace-300ff4aba48f84c99415cfdcf9be9b76`
   bei Version 67. Default workspace hat drei Sessions, alle mit
   `workspace-6c275ad752369ad5bac1c1fdfd507408` bei Version 6.

Gegenprobe zum Auflösungsweg: alle sieben Sessions wurden per `wb-board` abgefragt.
Sechs antworten mit genau dem Wert, den `boardIdForWorkspace(kanonischer cwd)`
unabhängig nachrechnet. Die siebte (KI und Gott) scheitert erst beim Lesen des
Snapshots, nicht bei der Identität.

Nebenbefund, der keine Fehlfunktion ist: die drei Sessions der Default workspace
erscheinen nur dann als Zeile, wenn eine von ihnen gerade die geöffnete ist. Das sind
header-only Stümpfe ohne Nachrichten, und leere Sessions sind in DSH eine vorläufige
Platzhalterzeile. Beim Wegklicken verschwindet die Zeile wieder. Das Verhalten ist
unabhängig von der Migration.

## 7. Was ausdrücklich nicht angefasst wurde

- Kein Session-Log, kein SessionHeader.
- Kein Whiteboard-Snapshot, auch nicht der diagnostizierte Altdatensatz.
- Keine boardId.
- Kein Code in `F:\code\dsh-tldraw`. Das Whiteboard-Repo trägt nur seine
  vorbestehenden, unveränderten Alt-Änderungen.
- Der `defaultWorkspaceId`-Eintrag und die Bahn "Default workspace" selbst.
- Die laufende Nutzerinstanz auf Port 3030.

## 8. Offene Punkte und Unsicherheiten

1. **Das Board "KI und Gott" lädt nicht.** Ursache ist der Altdatensatz mit fremder
   boardId. Drei Wege wären denkbar, und die Wahl gehört dem Nutzer:
   die Datei unverändert liegen lassen und den Stand aus
   `F:\dsh-workspaces\pts\KI und Gott` (Version 934) bewusst als den neueren behandeln;
   die Kopie entfernen, damit die Bahn leer startet; oder die Originaldatei an die
   Stelle der Kopie setzen, womit der Stand von Version 934 unter dem neuen Board-Namen
   läge. Jede der drei Varianten verändert Daten und wurde deshalb nicht ausgeführt.
2. **Drei Verzeichnisse mit fast gleichem Inhalt** für denselben Denkraum
   (`F:\dsh-workspaces\pts\KI und Gott`, `F:\dsh-instances\pts\denkraeume\KI und Gott`,
   `F:\dsh-instances\pts-017\denkraeume\KI und Gott`). Nur das zweite ist cwd einer
   Session. Welche der drei künftig die führende sein soll, ist eine
   Datenhaltungsentscheidung und nicht aus dem Code ableitbar.
3. **`F:\dsh-instances\pts-017\denkraeume\KI und Gott` ist kein cwd irgendeiner
   Session.** Das Verzeichnis ist damit kein Migrationsziel und liegt außerhalb der
   Registry. Ob es überhaupt gebraucht wird, ist offen.
4. **Der Proxy der Umgebung** bricht Zugriffe auf `localhost` um, solange nicht
   `--noproxy '*'` gesetzt ist. Für künftige Messungen relevant.
5. **Nicht geprüft:** die Szenarien A bis F aus `docs/TESTING.md` des
   Whiteboard-Repos. Sie betreffen die Whiteboard-Abnahme, die ausdrücklich nicht Teil
   dieses Auftrags war. Die hier protokollierte Browser-Abnahme ist eine
   Workspace-Abnahme und darf nicht als Whiteboard-E2E ausgegeben werden.

## 9. Korrekturen während der Arbeit

Zwei eigene Fehlannahmen, benannt, weil sie den Bericht sonst verzerren würden:

1. **Eine erste Fassung des Werkzeugs dekodierte Session-Verzeichnisnamen zurück in
   Pfade.** Das ist kein umkehrbarer Vorgang, weil mehrteilige Segmente ihr Leerzeichen
   zu einem Bindestrich verlieren. Dadurch meldete der erste Trockenlauf
   fälschlich `snapshotsUnchanged: false`. Die Dekodierung wurde entfernt und die
   Snapshot-Aufzählung in die Plugin-Hälfte verlegt, die die kanonischen cwd kennt.
   Die oben genannten Zahlen stammen aus dem bereinigten Lauf.
2. **Eine Zwischennotiz behauptete, der Snapshot in der KI-und-Gott-Bahn passe zu
   seinem Pfad.** Das ist falsch. Die Nachrechnung mit dem byte-genauen
   Hash-Spiegel zeigt die Abweichung. Punkt 9 der Diagnosen gibt den gemessenen Stand
   wieder.
