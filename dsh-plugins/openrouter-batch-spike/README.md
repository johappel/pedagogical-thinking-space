# DSH OpenRouter Batch Spike

Experimenteller Host-Plugin-Prototyp. Er registriert den normalen DSH-
SubagentProvider `openrouter-batch`; `dsh-tool-subagent` und der DSH-Kern bleiben
unverändert. Pro Run wird bewusst genau ein OpenRouter-Batch-Request gesendet.

Die aktuelle OpenRouter-Dokumentation (`/docs/batch-quickstart.md`, abgerufen
2026-09-05) verlangt `endpoint`, `model`, `requests` in dieser Reihenfolge.
Für Chat Completions ist der Endpoint `/v1/chat/completions`; Ergebnisse werden
bei `GET /api/beta/batches/:id` inline geliefert und per `custom_id` zugeordnet.
Terminal sind `completed`, `failed`, `expired` und `cancelled`. Die Doku weist
keinen Cancel-Endpunkt aus; `dispose()` bricht deshalb lokal ab und stoppt das
Polling. Ein bereits eingereichter Remote-Batch wird nicht künstlich als
abgebrochen gemeldet.

Der Schlüssel wird ausschließlich über `ctx.credentials.resolve()` gelesen.
Erforderliche Referenz ist standardmäßig `OPENROUTER_API_KEY`; kein Secret wird
gespeichert oder geloggt. Ein realer Lauf braucht eine vorhandene DSH-Credential.

Modell und Route sind absichtlich strikt: `openrouter` plus
`openai/gpt-5.6-luna:batch`. Structured Output wird als OpenRouter
`response_format.type=json_schema` gesendet und anschließend als JSON-Objekt
gegen die für diesen Spike erwarteten drei Beobachtungen validiert.
