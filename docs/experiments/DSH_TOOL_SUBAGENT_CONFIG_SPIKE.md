# DSH `dsh-tool-subagent` Konfigurationsspike

Stand: 2026-09-05  
DSH: `0.1.2-rc.1`  
Paket: `@deepseek-ai/dsh-tool-subagent` `0.1.2-rc.1`

## Ergebnis

Die sechs PTS-Worker sind getrennte Konfigurationsinstanzen des offiziellen
`@deepseek-ai/dsh-tool-subagent`. Das Paket delegiert selbst nativ über
`ctx.subagents.start(...)`; ein eigener Director, Dispatcher oder
`PtsSubagentTransport` ist deshalb nicht erforderlich.

Wichtig: `provider` im Tool ist der DSH-Subagent-Transport (aktuell `spawn`).
`agentOptions.provider` und `agentOptions.model` sind die LLM-Route (aktuell
`openrouter/deepseek/deepseek-v4-flash`). Diese beiden Namensräume sind getrennt.

## Installierter Code

Untersucht wurden `lib/index.js`, `lib/types/index.d.ts` und `package.json` der
installierten Version. Der Runtime-Code verwendet:

- `ctx.subagents.start(config.provider, request)` für Foreground und one-shot;
- `jobs.start()` als DSH-Hülle für Background-Aufträge;
- `ctx.subagents.startContinuable()` für Continuation;
- `run.result` und `run.dispose()` für Foreground-Lifecycle;
- `preflightChildLlmRoute()` für Provider-/Modellauflösung;
- Capability-Prüfungen vor der Delegation.

## Konfigurationsumfang

| Fähigkeit | konfigurierbar? | Config-Key | Runtime-Nachweis / Bemerkung |
|---|---|---|---|
| Tool-/Worker-Name | Ja | `toolName` | eigener `defineTool`-Name je Instanz |
| Beschreibung | Ja/automatisch | Provider und Modus | `providerWording(...)` erzeugt die Toolbeschreibung |
| Persona/Systemprompt | Ja | `persona` | als `request.persona`, Capability wird geprüft |
| LLM-Provider | Ja | `agentOptions.provider` | LLM-Preflight und Child-Header |
| Modell | Ja | `agentOptions.model` | LLM-Preflight und Child-Header |
| Reasoning Effort | Ja | `agentOptions.reasoningEffort` | Adaptervalidierung |
| Max Tokens | Ja | `agentOptions.maxTokens` | Child-Agent-Option |
| Tool Allowlist | Ja | `toolFilter.allow` | DSH-Restriction, unbekannte Namen schlagen fehl |
| Tool Denylist | Ja | `toolFilter.deny` | DSH-Restriction |
| Max Depth | Ja | `maxDepth` | numerisch oder `provider-managed`; `0` verbietet Delegation |
| Output Schema | Nein als Config-Key | kein Key | Native Request unterstützt es, das Tool setzt es nicht |
| Foreground | Ja | `backgroundMode: one-shot`, `run_in_background: false` | `start` → `result` → `dispose` |
| Background | Ja | `enableRunInBackground`, `run_in_background: true` | DSH `jobs.start`, Job-ID, Completion |
| Continuable | Ja | `backgroundMode: continuable` | `startContinuable`, dauerhafte Child-ID |
| Parent-Kontext | Providerabhängig | kein eigener Key | `inheritsParentContext` ist Provider-Metadatum |
| Workspace/CWD | Provider-/Parent-Vertrag | kein eigener Key | In-Process-Provider leitet vom Parent ab |
| Child Label | Ja | Tool-Argument `description` | wird als `request.label`/Job-Label verwendet |
| Timeout/Abort | Teilweise | kein Timeout-Key | `exec.signal`; Background nutzt DSH-Abbruchsteuerung |
| Ergebnisformat | Modusabhängig | Modus | Foreground `runId`, Background `jobId`, Continuable `subagentId` |
| Fehlerabbildung | fest implementiert | kein Key | `completed`, `aborted`, `error`, `max-tokens`, `refusal` |
| Subagent-Transport | Ja, pro Instanz | `provider` | direktes erstes Argument von `ctx.subagents.start` |

## Die sechs PTS-Worker

Alle sechs Einträge in `dsh-presets/pts-companion/agent.cordis.yml` verwenden
individuelle Persona, Modell-/Providerroute, `maxDepth`, `maxTokens`,
Background-Modus und Toolgrenze:

| Tool | Transport | LLM-Route | Toolgrenze |
|---|---|---|---|
| `pts_research` | `spawn` | `openrouter/deepseek/deepseek-v4-flash` | read, glob, grep, web_search, write, edit, skill |
| `pts_edit` | `spawn` | `openrouter/deepseek/deepseek-v4-flash` | read, glob, grep, write, edit |
| `pts_document` | `spawn` | `openrouter/deepseek/deepseek-v4-flash` | read, glob, grep, write, edit |
| `pts_material` | `spawn` | `openrouter/deepseek/deepseek-v4-flash` | read, glob, grep, write, edit, skill |
| `pts_review` | `spawn` | `openrouter/deepseek/deepseek-v4-flash` | read, glob, grep |
| `pts_renderer` | `spawn` | `openrouter/deepseek/deepseek-v4-flash` | read, glob, grep, write, edit |

Die gewünschte Flexibilität ist daher bereits vorhanden; derzeit ist sie nur
statisch in der Cordis-Komposition gepflegt. Der Settings-Service wird vom
Tool selbst nicht als dynamische Quelle für diese Felder gelesen.

## Runtime- und Batch-Befund

Der abgeschlossene native `ctx.subagents`-Spike mit `spawn` und
`ollama/granite4.2:3b` bestätigte real Parent, Child, Persona, Modellroute,
Toolfilter, `run.result`, `completed`, `dispose()` und `outputSchema`.

Ein späterer DSH-Provider `openrouter-batch` könnte grundsätzlich über den
bestehenden Config-Key `provider` ausgewählt werden, sofern er den öffentlichen
`SubagentProvider`-Vertrag erfüllt. Dafür wäre kein PTS-Dispatcher nötig.

## Abschlussentscheidung

**NEIN – keine neue Worker-Abstraktion erforderlich.**

Allenfalls eine spätere reine Konfigurationsschicht zur Pflege der sechs
Cordis-Einträge ist sinnvoll. Die PTS-Fachlogik und die bestehenden Worker
bleiben unverändert.
