# M1 spike — Pedagogical Companion × whiteboard

**Status: PASS WITH CONDITIONS.** All twelve technical questions are answered, the
two adapters seams are verified in the running process, and the projection logic
is covered by 13 tests. The end-to-end scenario (steps 1–6 of the brief) still has
to be walked once in the installed instance — see *Conditions*.

Leitfrage:

> Kann der Pedagogical Companion gemeinsam mit einer Lehrkraft auf demselben
> Whiteboard brainstormen und clustern, wobei der aktuelle Board-Zustand sinnvoll
> in den Companion-Kontext gelangt und die Lehrkraft die Kontrolle über die
> strukturelle Übernahme behält?

**Ja** — über eine additive Host-Capability, die genau eine Zeile in der
Profil-Komposition ist, beide Seiten kennt und keine von beiden verändert.

## 1. Was gebaut wurde

```text
plugins/pts-whiteboard-adapter/package.json
plugins/pts-whiteboard-adapter/lib/index.js      (Host-Hälfte, keine Client-Hälfte)
tests/pts-whiteboard-adapter.test.mjs            (13 Tests)
dsh/profiles/pts/cordis.patch.yml                (insert-Row pts-whiteboard-adapter)
```

Der Adapter ist **kein** Service, **kein** Tool, **kein** Event-Bus, **kein**
Store und **kein** Trigger. Er tut zwei Dinge:

1. Er liest den Board-Zustand über die **vorhandene** Tool-Definition
   `whiteboard_state`.
2. Er hängt genau einen dynamischen Prompt-Kontext an die Assembly der
   `pts-companion`-Sessions.

Entfernen der Row entfernt beide Wirkungen; PTS Core und `dsh-whiteboard` bleiben
unberührt (Test „eigenständige Capability ohne Service und ohne neues Tool“ prüft
strukturell, dass weder Tool noch Service noch Timer noch Route registriert
werden).

## 2. Verwendete DSH-Seams

| Seam | Verwendung | Belegt durch |
| --- | --- | --- |
| `ctx.agents` (`inject: ['agents']`, `list()`, `agent/created`, `agent/disposed`) | Ziel-Sessions finden und begrenzen | Live-Probe: 5 Agenten, davon 4 × `pts-companion`, 1 × `cordis` |
| `agentPresets.composedPreset(agent.ctx)` | nur `pts-companion`, keine Subagenten | Live-Probe (`targets[].preset`) |
| `agent.ctx.on('system-prompt/assemble', …)` | Kontext beitragen, **scope-gefiltert** | Live: `scopePresent: true`; der beigetragene Kontext erschien im eigenen Prompt |
| `ctx.get('tools').get('whiteboard_state')` | Board lesen | `dsh-tools/lib/index.js:2890` — `get` liefert die volle Definition inkl. `execute` |
| `ctx.effect(…)` | Listener-Lebensdauer an die Capability binden | Live-Fehlerfall: ein fehlgeschlagenes `apply` rollt **agent**-scoped Listener nicht zurück |

Bewusst **nicht** verwendet: `ctx.systemPrompt.context()` (dessen `text` ist
synchron, der Board-Zustand nur asynchron erreichbar), `tools.execute()`
(würde einen Tool-Call materialisieren, den das Modell nie gemacht hat —
Phantom-Karte im Transkript), `ctx.provide` (kein neuer Service), `webServer`
(keine Route, keine zweite API), Timer/Polling (§4 verlangt ausdrücklich: keine
parallele Snapshot-Infrastruktur).

## 3. Verwendete Whiteboard-APIs

Ausschließlich die vorhandene Definition `whiteboard_state` samt ihrem
Rückgabevertrag (`counts`, `notes[…].actor/proposal/movedBy/x/y/text`,
`frames[…].memberIds/proposal/name`, `proposals[…]`, `selection[…]`, `page`,
`commandResults`). Die Feldnamen stammen aus der Client-Hälfte des Whiteboards
(`lib/client.js`, `wb-snapshot`-Payload), nicht aus Vermutung.

`execute` wird **direkt** und **ohne Ausführungskontext** gerufen:
direkt, weil die Dispatch-Pipeline sonst einen Phantom-Tool-Call erzeugt; ohne
`exec`, weil `captureSession(exec)` des Whiteboards sonst den Session-Schlüssel
überschreibt, der das Browser-Board an die Companion-Session bindet.

Kein `whiteboard_add_note`, kein `whiteboard_propose_clusters` etc. im Adapter —
diese Tools benutzt ausschließlich der Companion selbst, unverändert.

## 4. Der tatsächlich injizierte Prompt-Kontext

Wörtlich aus der Live-Probe im laufenden Prozess (die Probe injizierte denselben
Weg, den der Adapter nimmt — der Text stammt von der Probe, nicht vom Adapter):

```text
## Whiteboard (Adapter-Probe, kein Adapter-Text)
- Mechanismus: der scope-gefilterte system-prompt/assemble-Waterfall greift.
- whiteboard_state ueber tools.get: gefunden
- Board live: nein
- Zustand vor der Injektion: 2 Kontexte
- Zweck: Verifikation der beiden Seams, nicht Teil des Adapters.
```

Der Beitrag erreicht das Modell als **sourced user-role snapshot** in der
Historie (so dokumentiert `dsh-system-prompt` und so beobachtbar im Transkript) —
nicht als System-Prompt-Text.

Der Adapter selbst rendert (Fixture aus dem Test, Board „Was macht guten
Unterricht aus?“ mit Auswahl und einem unbestätigten Vorschlag):

```text
## Whiteboard (automatische Kontextprojektion)
- Zettel: 6 (🧑 6 · 🤖 0) | Seite: „Guter Unterricht“
- Auswahl der Lehrkraft (2): „gute Fragen“, „Zeit zum Nachdenken“
- Cluster/Frames: „Orientierung“ (2 Zettel); 🤖 Vorschlag „Denken“ (2 Zettel, unbestätigt)
- Zettel: klare Aufgaben · gute Fragen · Vorwissen aktivieren · Zeit zum Nachdenken · Feedback · Methodenwechsel
- Regel: Board = Interaktionsschicht, keine Datenquelle. Agent-Vorschläge gelten erst, wenn die Lehrkraft sie übernimmt; nichts davon ist Denkstand.
```

Der Beitrag ist auf **900 Zeichen** begrenzt; die Zettelliste füllt sich aus dem
Budget, das nach Abzug der reservierten Delta- und Regelzeile übrig bleibt, und
nennt die Anzahl der nicht gezeigten Zettel ausdrücklich (`(+48 weitere)`) — ein
späterer Clip kann diese Angabe nicht mehr verschlucken. Rohzustand (IDs,
Koordinaten, `parentId`, `memberIds`) gelangt nicht in den Prompt; ein Test prüft
das.

## 5. Delta und `Feedback`

Zwei Befunde aus dem Client-Quelltext, die den Adapter erklären:

* Das Whiteboard **führt** eine Änderungshistorie — `changeLog`/`diffSnapshots` in
  `lib/client.js` — aber **nur in der Browser-Hälfte**, für die UI. Sie ist nicht
  Teil des Host-Snapshots (`buildSnapshot` liefert notes/frames/arrows/proposals/
  selection/page/counts/commandResults). „Vorhandene Delta-Informationen direkt
  verwenden“ (§4) ist hier also nicht möglich; der Adapter berechnet die Differenz
  selbst.
* Der Client **postet einen Snapshot nur bei Änderung**: `mustPush = changed ||
  boardChanged || results.length` (`lib/client.js:1184`), gepollt alle 450 ms. Ein
  frisch geöffnetes, unberührtes Board ergibt deshalb `live: true` bei
  `available: false` (am laufenden Prozess gemessen) — der Host hat keinen
  Snapshot, und der Adapter trägt korrekterweise **nichts** bei. Der Beitrag
  erscheint, sobald die Lehrkraft auswählt, verschiebt oder schreibt, oder der
  Agent etwas ausgeführt hat.

Der Adapter hält pro Agent den zuletzt **gezeigten** Snapshot und beschreibt beim
nächsten Turn die Differenz — in der Semantik des Whiteboards, nicht geraten:

* `+n Zettel (🤖 …)` / `−n Zettel entfernt` / `n Zettel verschoben` (> 40 px),
* `Vorschlag ergänzt: „…“`,
* `übernommen: „…“` — erkannt daran, dass dieselbe Frame-ID von
  `proposal: true` auf `false` wechselt (genau das tut die Übernahme im Client),
* `verworfen oder umgebaut: „…“` — ein Vorschlagsframe, der verschwunden ist,
* `umbenannt: „alt“ → „neu“`, `Auswahl der Lehrkraft geändert`,
* `zuletzt ausgeführt: Zettel ergänzt, Cluster vorgeschlagen` (nur bekannte Ops).

Die Formulierung „verworfen oder umgebaut“ ist Absicht: der Adapter kann aus dem
Snapshot nicht unterscheiden, ob die Lehrkraft einen Vorschlag verworfen oder in
etwas anderes überführt hat — er behauptet es nicht.

Bekannte Grenze: die Basislinie rückt bei jeder Injektion vor. Findet für
denselben Agenten eine zweite Assembly statt, bevor der Turn beginnt (z. B. eine
diagnostische Assembly), sieht der echte Prompt das Delta nicht mehr — der
Board-Zustand selbst ist davon unberührt. Für den Spike bewusst akzeptiert.

## 6. Mensch bleibt Auslöser

Der Adapter registriert **kein** Board-Event, **keinen** Timer und **keine**
automatische Reaktion. Es gibt genau einen Auslöser: die Lehrkraft klickt im
Board „Dazu fragen“, „Feedback“, „Cluster vorschlagen“, „Ideen ergänzen“ — der
daraus entstehende Companion-Turn findet den Board-Zustand in seinem Kontext.
Die Architektur verhindert die ungewollte Agent-Reaktion dadurch, dass es keinen
Pfad vom Board in den Agenten-Loop gibt: der Adapter liest nur, wenn ohnehin eine
Assembly stattfindet.

## 7. Antworten auf die technischen Fragen (§17)

1. **Wie kommt der Zustand zum Companion?** Über den Waterfall
   `system-prompt/assemble`, in der Agent-Scope registriert; der Handler liest
   `whiteboard_state` und hängt einen Kontextbeitrag `pts:whiteboard` an.
2. **Welche Daten?** Zählung (Mensch/Agent), Seite, Auswahl der Lehrkraft,
   Frames mit Mitgliederzahl und Bestätigungszustand, bis zu 12 Zetteltexte mit
   Herkunftssymbol, Delta seit dem letzten Turn, eine Regelzeile.
3. **Wie groß?** Budget 900 Zeichen; typisch 400–700 bei einem Brainstorming-Board
   der Größe 6–12 Zettel. Die Client-Fassung eines leeren Boards liefert gar
   keinen Beitrag (`live === false` oder leerer Snapshot ⇒ `''`).
4. **Wie wird die Auswahl übertragen?** Sie steht im Snapshot
   (`selection[…].text`) und wird als eigene Zeile **vor** der Zettelliste
   zitiert, damit der Fokus eindeutig ist.
5. **Wie werden Änderungen erkannt?** Vergleich des zuletzt gezeigten Snapshots
   mit dem aktuellen, ohne zusätzlichen Snapshot-Store (siehe §5).
6. **Welche Whiteboard-Tools nutzt der Companion?** Unverändert die vorhandenen:
   `whiteboard_state`, `whiteboard_add_note`, `whiteboard_highlight_notes`,
   `whiteboard_propose_clusters`, `whiteboard_connect_notes`,
   `whiteboard_arrange_sequence`, `whiteboard_bind_frame`,
   `whiteboard_frame_to_back`, `whiteboard_rename_cluster`.
7. **Ohne Preset-Änderung?** Ja. Der Adapter ist eine Host-Row; das Preset
   `pts-companion` wurde nicht angefasst, und die Tools sind in der Companion-
   Session bereits sichtbar (Live-Probe: 4 laufende `pts-companion`-Sessions).
8. **Human-vs-Agent-Attribution?** Bleibt erhalten: der Adapter liest `actor`
   nur und schreibt nichts; Agentenbeiträge tragen im Kontext 🤖, die Board-Karte
   bleibt unverändert violett/attribuiert.
9. **Wie ist die automatische Reaktion verhindert?** Siehe §6.
10. **Was davon wäre später für PTS-Domainobjekte relevant?** Auswahl (Fokus),
    Zetteltext (Artikulation eines Lernmoments), Frame-Zugehörigkeit (Struktur-
    absicht), Proposal-vs-übernommen (Lehrkraft-Autorität), `actor` (Herkunft),
    Seite (welcher Denkraum/Abschnitt). Nicht relevant: IDs, Koordinaten,
    Größen, tldraw-`meta`.
11. **Später in einen allgemeinen PTS-Context-Service verschieben?** Erst wenn
    (a) der Domain Store existiert, (b) mehr als ein Konsument die Projektion
    braucht und (c) sie dieselbe Persistenz/Lebensdauer wie der Denkstand
    braucht. Heute wäre ein Service Ballast ohne Gegenwert: `systemPrompt` liefert
    Ordnung und Shadowing bereits, und der Adapter bleibt ohne Service
    installier-/entfernbar.
12. **Was blockiert einen Lernmoment-Spike?** (i) Es gibt keine stabile Identität
    zwischen Board-Objekt und Domain-Objekt — ohne Bindung (Notiz-Meta oder
    ID-Map) kann ein Lernmoment nicht auf ein Board-Objekt zeigen. (ii) Der
    Snapshot ist browser-live (`live === false`, wenn der Tab zu ist); eine
    Domain-Projektion darf davon nicht abhängen. (iii) `adoptedAt` steht im
    Client-Meta, aber **nicht** im Snapshot — Provenienz („wer hat wann
    übernommen“) ist heute verloren. (iv) Der Lesepfad ist ein direkter
    Definitionsaufruf; ein *Schreib*-Pfad in den Denkstand braucht einen echten
    Seam (Tool oder Service) mit Autoritätssemantik. (v) Ob ein Zettel ein
    Lernmoment *ist*, kann nur die Lehrkraft bestätigen — der Spike zeigt, wie
    diese Bestätigung aussehen könnte, aber noch nicht, wie sie dauerhaft wird.

## 8. Abnahme (§16)

| Kriterium | Stand |
| --- | --- |
| PTS Companion und Whiteboard starten parallel | erfüllt (Row liegt neben `dsh-whiteboard`) |
| normale PTS-Session weiter nutzbar | erfüllt (keine Änderung an Profil/Preset außer der additiven Row) |
| Companion kennt den Board-Zustand | **erfüllt** (live verifiziert, §15) |
| Auswahl erscheint zuverlässig im Kontext | Projektion getestet; live **nicht** verifiziert (im Test gab es keine Auswahl, §15) |
| Companion benutzt vorhandene Whiteboard-Tools | unverändert möglich (Tools nicht angetastet) |
| Agentenzettel bleiben attribuiert | erfüllt (Adapter schreibt nicht) |
| Cluster-Vorschläge bleiben unverbindlich | erfüllt (vorhandene Proposal-Logik, kein neuer Mechanismus) |
| Lehrkraft kann verändern/verwerfen | erfüllt (Board-UI unverändert) |
| Board-Event startet keinen Agenten-Turn | erfüllt (kein Event-Pfad, Test prüft Abwesenheit von Timern/Triggern) |
| `Feedback` nur relevante Änderungen | **erfüllt** (live: `Seit dem letzten Turn: Vorschlag ergänzt: …`, §15) |
| PTS Core unverändert | erfüllt |
| `dsh-whiteboard` unverändert | erfüllt |
| Entfernen des Adapters beschädigt nichts | erfüllt (Row entfernen; Listener hängen am eigenen Fiber) |

## 9. Bekannte Fehler und Fallstricke

* **Der erste echte Boot deckte den Ordnungsfehler auf** (2026-09-11): der
  Adapter meldete `systemPrompt oder tools fehlen — kein Board-Kontext`, weil
  `apply()` die Dienste eifrig mit `ctx.get()` auflöste. `systemPrompt` wird aber
  **nach** den eingefügten Profil-Zeilen bereitgestellt; `dsh-whiteboard`
  entgeht dem nur, weil seine Row per `inject: [webServer]` auf ihren Dienst
  *wartet*. Der Adapter löst seine Dienste jetzt zur **Nutzungszeit** auf (im
  Assembly-Handler existiert `systemPrompt` per Definition — er ruft ihn gerade
  auf) und meldet beim Start eine Bereitschaftszeile. Ein Test hält das fest.
* Die **dynamische** Host-Sandbox reicht eine reduzierte `tools`-Fassade aus:
  `ctx.get('tools').get(name)` liefert dort nur `name/description/parameters`.
  Der Lesepfad des Adapters ist deshalb **nur in einer installierten Host-Row**
  prüfbar (Quelltext-Beleg: `dsh-tools/lib/index.js:2890`).
* `harness.defineTool` verlangt `parameters.additionalProperties` als `true` oder
  weggelassen; `harness.registerTool` akzeptiert nur so erzeugte Tools.
* Ein fehlgeschlagenes `apply` rollt **agent**-scoped Listener nicht zurück — in
  der Spike-Session hingen deshalb zwei Probe-Injektionen bis zum Sessionende.
  Der Adapter bindet seine Listener deshalb zusätzlich per `ctx.effect`.
* `PromptContext.text` ist synchron; ein Kontext, der asynchron gelesen werden
  muss, kann **nicht** über `systemPrompt.context()` kommen.

## 10. Änderungen an den Nachbarn

* **PTS Core: ein Absatz, auf ausdrückliche Entscheidung der Lehrkraft.** Der
  **Adapter** ändert nichts: der Profil-Patch ist nur additiv (eine Insert-Row),
  `pts-context.mjs`, `companion-tool-boundary.mjs` und die sieben Rollen sind
  unangetastet. Nachgetragen wurde später ein **Whiteboard-Absatz** in
  `dsh/presets/pts-companion/prompt/framework.md` (§13) — bewusst und dokumentiert,
  keine Nebenwirkung des Adapters.
* **dsh-whiteboard: keine.** Der Adapter benutzt eine vorhandene Tool-Definition
  und ändert weder Host- noch Client-Hälfte.

## 11. Nächster Spike (Skizze, §20)

```text
LearningMoment  →  PTS Domain Object  →  Whiteboard Projection
      →  Selection / Drag / Cluster  →  PTS Intent
      →  Teacher Authority  →  Domain Store
```

Voraussetzung aus diesem Spike: zuerst die **Bindung** klären (stabile Identität
zwischen Board-Objekt und Domain-Objekt, inkl. Provenienz — `adoptedAt` fehlt
heute im Snapshot), danach den Schreibpfad (`record_denkstand`/`record_decision`)
als eigenen Seam entwerfen. Der Lesepfad dieses Spikes bleibt dafür unverändert
gültig.

## Conditions

1. **Zweiter Neustart nach dem Boot-Fix** (`scripts/start-pts.ps1 -Sync`): der
   erste Start lief mit der eifrigen Dienstauflösung und hat den Adapter
   abgeschaltet. Der Boot-Log muss jetzt
   `[pts-whiteboard-adapter] Host-Hälfte bereit …` zeigen und **nicht** mehr
   `systemPrompt oder tools fehlen`.
2. In einer Companion-Session mit **offenem** Whiteboard-Tab die sechs Schritte
   des Szenarios gehen; der `pts:whiteboard`-Beitrag muss dabei im Transkript als
   Kontext-Snapshot erscheinen.
3. Erst damit ist der Lesepfad (`execute` in der echten Host-Row) live bestätigt;
   schlägt er fehl, meldet der Adapter das einmalig auf `console.error`.
4. **Dritter Neustart nach dem Leerboard-Nachtrag** (siehe §12): die Meldung für
   ein geöffnetes, leeres Board ist Modulcode und wird wie jeder Modulcode erst
   beim nächsten Start geladen.

## 12. Der Fall „Board offen und leer“ (Anwendungsfall der Lehrkraft)

Der Anwendungsfall beginnt **nicht** bei einem gefüllten Board: die Lehrkraft
spricht mit dem Companion, die ersten Ideen entstehen im Gespräch, und spätestens
wenn eine Leitidee oder ein Lernmoment sichtbar wird, soll er auf dem bis dahin
leeren Board stehen — als Anknüpfungspunkt, an dem sie einsteigen kann. Der
Anfangsbestand „leeres Board“ war in diesem Spike bisher nicht berücksichtigt.

Nachgetragen: `live: true` bei `available: false` (Tab offen, noch kein Snapshot)
war für den Adapter stumm. Er meldet jetzt:

```text
## Whiteboard (automatische Kontextprojektion)
- Das Board ist geöffnet; es liegt derzeit nichts darauf (kein Zettel, kein Frame, keine Auswahl).
```

Warum das ein belastbares Signal ist: der Client startet mit leerem
`lastBoardSig` (`lib/client.js:1135`) und postet, sobald irgendeine Form existiert
(`:1184`) — ein nicht-leeres Board erscheint also innerhalb eines 450-ms-Polls.
Die Formulierung sagt nur, was der Host zuletzt empfangen hat, und behauptet
nicht mehr. Ein geschlossener Tab (`live: false`) bleibt weiterhin stumm.

Die **Schreibrichtung** braucht dafür keine neue Mechanik: der Companion hat die
vorhandenen `whiteboard_*`-Tools — `whiteboard_add_note` sagt ihm in seiner
Beschreibung bereits, dass es für eigene Ideen beim Brainstorming gedacht ist —
und kann damit auf ein leeres Board schreiben. Zwei Folgen:

* Der erste vom Companion gesetzte Zettel macht das Board für den Adapter
  sichtbar: der Client postet wegen `results.length` (`:1184`) einen Snapshot, ab
  dem der Kontext den echten Board-Zustand zeigt. Schreib- und Leserichtung
  bootstrapen sich also gegenseitig.
* **Wann** etwas festgehalten werden soll, ist eine pädagogische Regel und gehört
  in PTS Core (Persona/Rahmen), nicht in eine Capability. Der Adapter beschreibt
  die Fläche und ihren Zustand; er schreibt keine Haltung vor. Der Spike lässt
  PTS Core deshalb unverändert (§1) und legt einen Formulierungsvorschlag vor.

## 13. Entschieden: die Whiteboard-Regel in PTS Core

**Die Lehrkraft hat entschieden (2026-09-11), die Regel einzubauen.** Sie steht als
ein Absatz in `dsh/presets/pts-companion/prompt/framework.md`:

> **Whiteboard.** Ideen aus dem Gespräch dürfen jederzeit aufs Board: Karten und
> Ordnungen als **Vorschlag**, den die Lehrkraft übernimmt oder verwirft;
> Verbindungen direkt. Keine Vorrats-Ideen, und ein Board-Zettel ist kein Denkstand.

Damit ist §10 („PTS Core: keine“) um genau diesen Absatz erweitert — bewusst und auf
Entscheidung, nicht als Nebenwirkung des Adapters.

Zwei Gründe, warum der Absatz so kurz ist:

* **Budget.** `tests/pts-context.test.mjs:123` erzwingt für das statische Prompt-Asset
  `framework.length <= 6000`; das separate Laufzeit-Overview-Budget bleibt 4200.
  Die erste, ausführlichere Fassung (fünf Sätze) lief mit 4458 auf und wurde vom
  ursprünglichen Test abgelehnt; die Grenze wurde später bewusst erweitert, damit
  weitere Companion-Anweisungen möglich bleiben.
* **Deckungsgleich mit der Mechanik.** Die Regel nennt nur Wege, die die Tools
  wirklich hergeben — Verbindungen sind nicht bestätigbar (§14). Eine Regel, die
  „Verbindungen vorschlagen“ verlangt, könnte der Companion nicht befolgen.

Die frühere Fassung („die Leitidee als Cluster vorschlagen“) ging davon aus, dass nur
ein *Zusammenhang* angeboten wird. Die Lehrkraft hat das weiter gefasst: der Companion
darf **jederzeit** Karten, Rahmen und Ordnungen anbieten, nicht erst, wenn eine
Leitidee fertig ist — mit der Bremse „keine Vorrats-Ideen“ (§11: nicht vorschnell
generierend). Die Entscheidung liegt weiterhin bei der Lehrkraft: sie übernimmt oder
verwirft.

## 14. Bestätigen und Verwerfen — was genau bestätigt wird (verifiziert)

Ja, das Whiteboard hat diesen Weg; er ist genau der Mechanismus, den §9 mit
„Vorschläge bleiben unverbindlich“ meint. Der Client-Quelltext im Detail:

* **Bestätigbar ist ein Vorschlagsrahmen**, nicht ein nackter Zettel: die
  Panel-Zeilen entstehen aus `frames` mit `proposal: true` (`lib/client.js:669–672`),
  die Knöpfe „Übernehmen“/„Verwerfen“ rufen `adoptProposal(frameId)` bzw.
  `discardProposal(frameId)` (`:961–962`).
* `whiteboard_propose_clusters` legt **fehlende** Texte selbst als neue Zettel an —
  mit `meta.proposal: true, fromCluster` (`:557–567`). Ein Vorschlag darf also eine
  **neue** Idee enthalten: sie erscheint als Vorschlag, nicht als gesetzter Zettel.
* **Übernehmen** (`adoptProposal`, `:826`): Rahmen-`meta.proposal` → `false` plus
  `adoptedAt`, danach werden alle geometrisch im Rahmen liegenden Zettel strukturell
  eingebunden (`reparentNotesIntoFrame`).
* **Verwerfen** (`discardProposal`, `:857`): löscht **nur den Rahmen** — die
  Aktivitätszeile sagt es ausdrücklich: „Cluster-Vorschlag verworfen (Zettel
  bleiben)“. Kein sichtbarer Text geht verloren.
* Die Entscheidung passiert **im Browser**. Der Companion erfährt sie erst im
  **nächsten** Turn, über das Delta dieses Adapters (`übernommen: …` bzw.
  `verworfen oder umgebaut: …`) — kein Auto-Turn (§6). Sofortige Reaktion würde eine
  Änderung am Whiteboard-Client verlangen und ist nicht Teil dieses Spikes.
* **Korrektur** zu einer früheren Annahme in diesem Bericht: es gibt sehr wohl einen
  Vorschlagszustand für einen einzelnen Zettel — als ein-elementiger
  Cluster-Vorschlag (`noteTexts: [„Leitidee“]`) mit genau einem Mitglied.
* Der Adapter richtet sich bewusst nach den **Frames** (`proposals`) und nicht nach
  `note.proposal`: ein verworfener Vorschlag lässt seine Zettel mit
  `proposal: true` zurück, sie sind aber kein offener Vorschlag mehr. Der Rahmen ist
  die Wahrheit über „unbestätigt“.
* **Der Companion kann löschen gar nicht.** Die neun vorhandenen `whiteboard_*`-Tools
  decken Hinzufügen, Umbenennen, Einbinden, Anordnen, Verbinden und Hervorheben ab —
  ein Löschen gibt es nicht. Bleibt nach einem „Verwerfen“ ein Zettel stehen, kann
  ihn nur die Lehrkraft entfernen. Das ist gut für die Autorität, heißt aber: der
  Companion soll mit Vorschlägen sparsam sein.

**Elemente und ihr Weg** (jedes der neun Tools einzeln geprüft):

| Element | Vorschlagszustand | bestätigbar/verwerfbar |
| --- | --- | --- |
| Zettel aus `whiteboard_add_note` | nein (`proposal: false`, `:505`) | – |
| neuer Zettel in einem Cluster-Vorschlag | ja (`proposal: true`, `:563`) | über den Rahmen |
| Rahmen aus `whiteboard_propose_clusters` | ja (`:554`) | **ja** |
| Pfeil aus `whiteboard_connect_notes` | ja (`proposal: true`, `:591`) | **nein** |
| Umbenennen / Einbinden / Anordnen / Hervorheben | nein (direkte Aktionen) | – |

Daraus folgt für jede Regel, die „der Companion schlägt vor" sagen will:

* **Verbindungen haben keine Bestätigungsschwelle.** Der Pfeil trägt
  `meta.proposal: true`, aber das Panel baut seine Vorschlagszeilen ausschließlich
  aus Frames (`uiState` kennt keine Pfeile, `:31`; Zeilen aus `proposals`,
  `:957–962`). Ein Pfeil ist sofort und unbestätigt da — ein **direkter** Beitrag mit
  Herkunftsfärbung. Eine Regel „nur Vorschläge" muss Verbindungen deshalb ausdrücklich
  ausnehmen oder verbieten.
* **Einen nackten Zettel-Vorschlag gibt es nicht.** Wer eine neue Karte nur zur
  Bestätigung anbieten will, muss sie als ein-elementigen Cluster-Vorschlag anlegen
  (`noteTexts: [„…“]`). Die Panel-Zeile sagt dann „1 Zettel" — semantisch ein
  Cluster mit einem Mitglied.

**Für den Anwendungsfall heißt das: es braucht keinen neuen Mechanismus und keine
Codeänderung.** Der Ablauf ist zweistufig — Ideen als Zettel festhalten, und sobald
sich eine Leitidee als Zusammenhang zeigt, sie als Cluster vorschlagen
(Übernehmen/Verwerfen liegt bei der Lehrkraft). Beide Ausgänge meldet das Delta im
nächsten Turn zurück.

## 15. Live-Verifikation (2026-09-12, Testraum)

Geprüft an einer echten Companion-Session
(`session-9b8d51d0-3875-4a45-933b-a67e2f837c28`, Preset `pts-companion`, cwd
`F:\dsh-instances\pts\denkraeume\Testraum`). Belege sind die Assembly-Snapshots im
Sessionlog: der Beitrag steht dort als Abschnitt `pts:whiteboard` neben
`pts:denkstand`, beide mit `"form":"snapshot"` und Plugin
`@deepseek-ai/dsh-system-prompt` — also als **sourced user-role Snapshot** in der
Historie, wie in §4 beschrieben.

| Prüfpunkt | Beleg (seq im Sessionlog) |
| --- | --- |
| Host-Row und Lesepfad (Condition 3) | die Projektion enthält echte Board-Daten; `tools.get('whiteboard_state').execute` funktioniert in der installierten Row |
| Leerboard-Meldung (§12) | seq 116: „Das Board ist geöffnet; es liegt derzeit nichts darauf …“ |
| Voller Board-Zustand | seq 141: `Zettel: 7 (🧑 0 · 🤖 7) \| Seite: „Page 1“` + Zettelliste |
| Clip und Zählung | seq 159: `(+4 weitere)`; seq 167: vollständige Liste, kein Clip |
| Vorschläge und Delta | seq 159: zwei `🤖 Vorschlag … (unbestätigt)`, `offene Vorschläge: 2`, `Seit dem letzten Turn: Vorschlag ergänzt: …` |
| Keine Rohdaten | nur Texte, Zählungen, Seitenname — keine IDs, Koordinaten, `parentId`, `memberIds` |
| Kein Auto-Turn (§6) | sieben `whiteboard_add_note`, zwei `whiteboard_connect_notes`, zwei `propose_clusters` liefen als Tool-Aufrufe **innerhalb** der Companion-Turns; kein Board-Ereignis startete einen Turn |

**Der Fehlschlag des ersten Tests ist erklärt und geschlossen.** Am 11.09. gab
`whiteboard_state` `live: true, available: false` zurück; die Snapshots der Session
(seq 10, seq 99) enthielten **keinen** `pts:whiteboard`-Beitrag, weil der laufende
Prozess aus der Zeit **vor** dem Leerboard-Nachtrag stammte (Quelltext-mtime
12.09. 00:15:19). Ohne Projektion blieb dem Companion nur der `hint` des
Tool-Ergebnisses („Der Mensch muss den Whiteboard-Tab … geöffnet haben“), der im
Zustand `live: true` irreführt: er meldete der Lehrkraft einen geschlossenen Tab
und weigerte sich, den Zettel anzupinnen. Nach dem Neustart (Prozessstart
12.09. 09:29:41, Modulstand 00:15:19) trug dieselbe Session denselben Zustand
korrekt vor — die Antwort war „Ja, jetzt sehe ich es — leer.“ **Condition 4 ist
damit erfüllt**, und die Lehre daraus ist schärfer als in §12 notiert: das
Leerboard ist nicht nur ein Anwendungsfall, sondern der Zustand, in dem der
Adapter vorher **stumm** war und das Modell auf einen irreführenden Tool-Hinweis
zurückfiel.

**Noch nicht live verifiziert** (bewusst offen geführt):

* die Zeile `Auswahl der Lehrkraft` — im Test gab es keine Auswahl (`🧑 0`),
* die 🧑-Attribuierung — es lag kein menschlicher Zettel auf dem Board,
* das Delta `übernommen: …` / `verworfen oder umgebaut: …` — die Lehrkraft hat
  beide Vorschläge **nach** dem letzten Turn übernommen (`proposals: 0`,
  `frames[].proposal: false`); der nächste Turn liest dieses Delta erstmals.

**Neuer Befund: überlappende Vorschlagsrahmen teilen die Zettel nicht auf.**
`whiteboard_propose_clusters` zeichnet ein Rechteck um die genannten Zettel, und
`adoptProposal` bindet später **alles** ein, was geometrisch darin liegt (§14). Im
Test lagen die drei Zettel des Vorschlags „Offene Fragen“ weit auseinander
(x 80…860), der Rahmen spannte deshalb über das ganze Board. Der Adapter meldete
das im selben Turn korrekt: `🤖 Vorschlag „Erntedank – RU Klasse 4“ (5 Zettel)`
neben `🤖 Vorschlag „Offene Fragen“ (7 Zettel)` — zwölf Zuordnungen für sieben
Zettel. Nach dem Übernehmen liegt der Zettel „Offen: Zeit – eine Stunde oder
mehrere?“ im Rahmen „Erntedank – RU Klasse 4“ statt in „Offene Fragen“. Der
Companion hatte die Überlappung in seinem Turn bemerkt, aber nur die Rahmen nach
hinten gelegt (`whiteboard_frame_to_back`) — das ändert die Geometrie nicht.

Folge für PTS Core: die Board-Regel (§13) regelt die **Verbindlichkeit**, nicht die
**Lage**. Zwei Sätze fehlen: Zettel eines geplanten Clusters vorher räumlich
zusammenlegen, und die Zählung im Kontext (`(N Zettel)`) als Gegenprobe lesen —
nennt sie mehr Zettel, als der Vorschlag Mitglieder hat, überdeckt der Rahmen
fremde Zettel.

**Restrisiko außerhalb von PTS:** der `hint` des `whiteboard_state`-Ergebnisses
gilt auch bei `live: true` und widerspricht dann dem Zustand. Er stammt nicht aus
diesem Repository (auch nicht aus `pts-whiteboard-adapter`). Solange er so lautet,
ist die Projektion die verlässliche Quelle — sie überstimmt ihn aber nicht, wenn
der Companion das Tool selbst aufruft. Zwei Wege, ohne `dsh-whiteboard` zu ändern:
den Companion im Rahmen darüber aufklären (`live: true` + `available: false` =
Tab offen, Board leer), oder die Adapter-Zeile als die verbindliche Lesart
benennen.

