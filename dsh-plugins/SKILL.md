---
name: dsh-web-ui-plugin
description: DSH Web-UI als Cordis-Plugin erweitern – Panels, Tabs, Chips, Toolviews oder eigene Host-Routen anlegen, aktualisieren und testen. Enthält die exakten Slot-Regeln (Shadowing-Prioritäten, Chain-Election, exclusive Deklarationen), die Ankerpunkte in ui-conversation und die Fallstricke aus der Praxis. Nach Neustart aktiv; HMR gibt es im Web-Profil nicht.
trigger: /dsh-web-ui-plugin
---

# /dsh-web-ui-plugin

Erfahrungsgeprüfte Anleitung für **statische DSH-Web-UI-Plugins** (Client-Slots + optionale Host-Routen). Alle Regeln hier wurden gegen den realen Code von `dsh-client-ui-slots`, `dsh-client-ui-renderer`, `dsh-client-runtime` und `dsh-client-ui-conversation` verifiziert – nicht geraten. Referenz-Implementierung: `F:\code\pedagogical-thinking-space\dsh-plugins\artifact-panel` („pts-artifact-panel“).

## 1. Architektur: zwei Hälften, ein Paket

| Hälfte | Ort             | Format                                                                                                                                                                                                                                    | Läuft in     |
| ------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Host   | `lib/index.js`  | ESM, **named export `apply`** (+ optional `export const inject = ['webServer']`)                                                                                                                                                          | Node-Prozess |
| Client | `lib/client.js` | **Classic Script**, ruft `window.__ModuleLoader__.load({ id, factory })` auf; Factory `(require) => ({ inject:['slots'], apply(ctx){…} })`; React via `require("react")`, Runtime via `require("@deepseek-ai/dsh-client-runtime/client")` | Browser      |

`package.json`-Pflichtmerkmale:

```json
{
  "name": "mein-panel",
  "private": true,
  "type": "module",
  "main": "./lib/index.js",
  "exports": { ".": "./lib/index.js", "./client": "./lib/client.js", "./package.json": "./package.json" },
  "dsh": { "client": { "inject": [], "platform": "web" } }
}
```

Der Client-Roster-Scan liest ausschließlich diesen `dsh.client`-Marker plus den `./client`-Export. Reine UI-Plugins exportieren auf Host-Seite ein leeres `apply(ctx){}` – genau so machen es die shipped UI-Pakete; das reicht damit die Row im Loader existiert.

**Verboten in beiden Hälften:** TypeScript, JSX, `import`/`require`-Statements im Client-Bundle (Classic Script!), Top-level-await. Client-React immer `React.createElement(...)`.

## 2. Installation & Verdrahtung (einmalig pro Rechner)

1. Plugin-Ordner beliebig ablegen (Repo o. ä.).
2. Windows-Junction ins Profil (`New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\<pkg-name>" -Target <Ordner>`) – kein pnpm install nötig; Node muss `<pkg-name>/package.json` vom Profil aus auflösen können.
3. Persönliche Patch-Ebene `$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml` (**niemals** die shipped Bundle-Patches editieren):

```yaml
- insert:
    - id: mein-panel
      name: mein-panel
      inject: [webServer]   # nur wenn die Host-Hälfte ctx.get('webServer') braucht
```

4. **DSH neu starten** – jede Änderung (auch Client-only) erfordert Neustart; der Bundle-Rev-Hash wird beim Boot neu gehasht (Cache-Buster). HMR ist im Web-Profil bewusst deaktiviert.

Die Patch-Ebene liegt **außerhalb** des Agenten-Workspaces → Schreibzugriffe brauchen Eskalation; Junction ebenfalls.

## 3. Slot-System: die harten Regeln

Kinds: `single` | `keyed` | `list` | `chain`. Scope: `root` | `session-maybe` | `session`.

1. **Single/Keyed/List = Shadowing über `priority`.** Aufsteigend sortiert, **die niedrigste Priorität rendert**, Default `0`. Gleiche Zelle + gleiche Priorität → **Boot-Fehler** (`already has a registration at priority N … register at a different priority to shadow it`). Takeover einer shipped Fläche also konsequent mit `priority: -1`.
2. **Chain = Election über `priority`** (nicht `order`!): Selektoren laufen aufsteigend, „lower tries first“, der erste Nicht-null-Return wählt und landet als `props.matched`. `null` = Decline → nächster Eintrag. Ties nach Registrierungs-/Assembly-Reihenfolge (User-Patch kommt zuletzt → bei Gleichstand gewinnt shipped!).
3. **Chain-Selektoren müssen rein sein** (Funktion der Owner-Props, keine Seiteneffekte). Ein geworfener Fehler wird nur geloggt und als Decline behandelt.
4. **Deklarationen sind exklusiv**: Einen bereits von einem anderen Entry deklarierten Kind-Slot-Key selbst zu deklarieren → **Boot-Ablehnung des ganzen Entries** (`slot "x" is already declared`). Nie blind `children:` kopieren.
5. **`renderSlot`/`renderSlotChain` sind entry-gebunden**: Das Binding verlangt den Key in der **eigenen** `children`-Tabelle, sonst `SlotOwnershipError` zur Renderzeit. Konsequenz: Wenn man einen Seat übernimmt, dessen Panel Kind-Slots dispatched, kann man deren Keys weder deklarieren noch dispatchen → **stattdessen die Body-Komponente direkt rendern** (sie ist ein einfacher Funktionsaufruf).
6. **Store-Seats sind kapseltief**: `useStore`/`actions` bekommen nur Komponenten des Entries, das den Store deklariert hat. Fremde Stores (z. B. Chat-Auswahl) sind nicht erreichbar – Ausweichmuster siehe §5.
7. **Inject-Faces** (`inject: (sessionId?, actions?) => ({...})`) liefern Props-Zusätze; `actions` existiert nur bei deklariertem Store. Services holt man sich im Client per `ctx.get('layout')` o. ä. in `apply()` und schließt sie in die Inject-Factory ein.
8. **Empty-States dispatchen keine Kinder**: z. B. rendert das shipped DetailsPanel `conversation.details.tool` **nur bei vorhandener Auswahl**. Eigene Inhalte, die unabhängig davon erscheinen sollen, brauchen den eigenen Seat (Takeover) oder eine additive Fläche (`shell.overlay`).

## 4. Ankerpunkte in ui-conversation (Stand dieser Version)

- **Rechte Spalte**: Seat `details` (single, scope session), Occupant `DetailsPanel` mit Store `chatStore` (init `{selection,draft,view,inspect}`, persist `"dsh.conversation.chat"`), Kind `conversation.details.tool` (single/session) wird mit `{block,cwd}` dispatcht, `closeDetails` via Inject-Face.
- **Chat-Store-Auswahl ohne Store-Zugriff beobachten**: Der Store persistiert jede Änderung nach `localStorage` unter `dsh.conversation.chat.<sessionId>` (`attachPersistence`: Rehydrate + Write-through). Muster: eigenes Seat pollt den Key rein lesend (300 ms), liest `JSON.parse(raw).selection.callId`. Keine Writes, graceful Degradation wenn Key sich ändert.
- **Call-Material auflösen** (Port der internen Helfer): Snapshot `s.chat.nodes.values()` → Nodes mit `node.kind==='tool-call'` → `node.data.root` = Blockbaum (`block.callId`, `block.subCalls[]` rekursiv); `'kind' in found` ⇒ settled (`found.call?.name/argsRaw`, `content[]`, `isError`), sonst running (`name`,`argsRaw`).
- **Produzierte Dateien**: Chain `conversation.chat.turnTail`, Owner-Props `{turn, seq, openFile}`. Shipped Occupant `ProducedFiles` selektiert aus `owner.turn.data.get("deliverables")` → `{produced:[{seq,path}], calls:Map(callId→view)}`; produced Paths stammen aus Call-Views mit Render-Intent (`view.card==='diff'` oder `generic && kind==='edit'`, dann `locations[].path`).
- **Tabs**: `conversation.view` (list): Registrierung `{name,id:'<unique>',order,label}`; Standard-Props enthalten `sessionId`.
- **Tool-Ergebnis-Anzeigen**: keyed `tool.call.toolview` (Key = Wire-Toolname); generischer Fallback sitzt auf `conversation.details.tool`.
- **Layout-Dienste**: `ctx.get('layout').openDetails()/closeDetails()`. `shell.overlay` (list, root) ist die dokumentierte additive Fläche für frame-weite Eigenflächen.

## 5. Host-Hälfte: Routen sauber anbinden

```js
export const inject = ['webServer'];   // hart sequenzieren, sonst läuft apply vor dem Service
export function apply(ctx) {
  const webServer = ctx.get('webServer');
  if (webServer === undefined) { console.error('[plugin] webServer fehlt'); return; }
  const dispose = webServer.register({
    kind: 'prefix',                    // 'prefix' matcht p und p/*; 'exact' nur exakt
    path: '/api/v2',
    handler(req, res) { /* subpath-dispatch */ },
  });
  ctx.effect(() => dispose, 'mein-panel: route');   // PFLICHT
}
```

- **Jeder Disposer in `ctx.effect(fn,label)`** – ein nicht fiber-getrackter Route-Disposer brennt für die Prozess-Lebenszeit; der nächste Boot-Versuch desselben Prefixes endet in `duplicate prefix route`.
- Session-Workspace bestimmen: `ctx.get('sessions').get(sessionId)?.header.cwd`, Fallback `ctx.get('sandboxPolicy')?.workspaceRoot`, dann `process.cwd()`. **Niemals relative Pfade ungeankert resolvieren** (fs-Service anchort am Prozess-cwd, nicht am Workspace).
- Path-Containment über Realpath + `path.relative` prüfen (Traversal!); MIME-Whitelist, Größenlimit, `Content-Security-Policy: sandbox` für HTML/SVG-in-iframe.

## 6. Testablauf (vor jedem Neustart)

1. `node --check lib/client.js` (CJS-Parse genügt für Classic Script) und Import-Test des Host-Moduls (`import('file:///…/lib/index.js')` → named `apply` vorhanden, ggf. `inject`-Array).
2. YAML validieren: Patch-Ebene mit `yaml.parse` parsen (shipped Bundle-Patches nutzen `!!js`-Tags → Warnungen dort sind normal; eigene Rows tag-frei halten).
3. HTTP-Probes gegen laufende Instanz: eigene Routen antworten mit **JSON-Fehlerkörpern**; ein 404 mit **leerem Body** heißt „Route gar nicht registriert“ (typisch: Apply zu früh / Service fehlte).
4. GUI-Banner „Failed to load plugins … failed to apply loader entry …“ ernst nehmen: Das ist die Loader-Diagnose des konkreten Entries (Prioritäts-/Deklarationskonflikte stehen dort wörtlich).
5. Browser: Rev-Hash bustet Cache beim Boot; bei Wunderlichkeiten hart aktualisieren (Strg+Umschalt+R). React-DevTools-Event-Listener zeigen minifizierte Root-Handler (`function Dr(){}`) – das ist normal, kein Fehlerindiz.
6. Inspect-Limitation: `Slots.listSubTree` akzeptiert objekt-Inputs in dieser Version fehlerhaft („input must be an object“) → Live-Verifikation über Quelltext-Lektüre der Profile-Pakete + Konsolenbeobachtung.

## 7. Fallstricke-Checkliste (alle in der Praxis gebissen)

- [ ] Gleiche Priority wie shipped Occupant? → Boot-Throw. Immer −1 (oder niedriger) beim Takeover.
- [ ] Chain mit `order` statt `priority` positioniert? → Election-Reihenfolge ignoriert es; shipped gewinnt bei Tie.
- [ ] `children` eines fremden Keys deklariert? → ganzer Entry fliegt beim Boot.
- [ ] `renderSlot` ohne eigene Deklaration benutzt? → Ownership-Throw erst zur Renderzeit (unsichtbar bis zur Interaktion).
- [ ] Route-Disposer nicht in `ctx.effect`? → Duplicate-Route-Fehler ab dem zweiten Aktivierungsversuch, dauerhaft.
- [ ] Relative Pfade ohne Workspace-Anker? → falsche Dateien/403.
- [ ] Beide Varianten gleichzeitig aktiv (dynamisches Prototyp-Plugin + statisches Paket)? → gleiche Slots doppelt belegt; Prototyp vorher stoppen/undefinen.
- [ ] Client-Änderung ohne Neustart erwartet? → passiert nicht (HMR aus).
- [ ] `dangerouslySetInnerHTML` ohne Escaping-first + URL-Scheme-Whitelist? → XSS-Tür.
- [ ] Persistierte Fremd-Stores **lesend** spiegeln ist ok; **schreibend** nie anfassen.

## 8. Update- & Entfernungsworkflow

- **Update**: Dateien im Repo ändern → Syntaxchecks (§6.1) → Neustart. Die Junction macht Repo-Edits sofort sichtbar; nichts muss kopiert werden.
- **Entfernen**: Patch-Zeile aus `cordis.patch.yml` löschen, Junction entfernen, Neustart. Shipped-UI kehrt automatisch zurück (eigene Entries sind reine Shadowing-Schichten).
- **Weitergeben**: Plugin-Ordner teilen; Empfänger führen §2 aus.

## 9. Mini-Skelette

Host (`lib/index.js`, reines UI):

```js
export function apply(ctx) {}
```

Client (`lib/client.js`):

```js
window.__ModuleLoader__.load({
  id: "mein-panel",
  factory: (require) => {
    const React = require("react");
    function MyView(props) { /* props.sessionId etc. je nach Slot-Kit */ }
    return {
      inject: ["slots"],
      apply(ctx) {
        ctx.slots.inject("conversation.view", () => ctx.slots.register(
          { name: "conversation.view", id: "my-view", order: 40, label: "Meins" },
          (props) => React.createElement(MyView, props),
        ));
      },
    };
  },
});
```

CSS über einmalig injiziertes `<style id="…">` in `document.head` (kein CSS-Modules-System für externe Plugins).
