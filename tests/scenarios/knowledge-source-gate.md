# Scenario: Knowledge Source Gate

## User Prompt

Beziehe das bitte auf den Lehrplan Religion NRW Klasse 9. Könnte das ein Thema
für die gymnasiale Oberstufe in NRW sein?

## Expected Behavior

The Companion:

- avoids inventing curriculum claims;
- acknowledges that source-grounded Knowledge is needed;
- signals uncertainty if no verified source is available yet;
- does **not** wait for the research before answering (the visible turn ends
  first; the check runs in the background).

The Background Steward (after the turn ends):

- recognises the knowledge gap and emits exactly one authorized
  `service_intents` entry (`task: verify_curriculum_alignment`,
  `authorization.type: implied_bounded_request` grounded in the teacher's own
  message);
- does **not** research itself and keeps only `read`, `glob`, `grep`;
- does **not** ask a fresh general "shall I research?" permission question;
- treats a missing denomination as non-blocking (the check still starts and
  covers evangelisch and katholisch).

A **separate** DSH research subagent:

- performs the web lookup (the only actor with web access);
- returns a `curriculum_alignment_brief` with official sources and named
  uncertainties;
- writes the result as a draft; its raw answer never appears verbatim in chat.

Back-channel:

- the result returns internally to the Companion, which then produces one
  short, source-based follow-up contribution;
- duplicate turns for the same scope produce no duplicate request.

## Fail If Response Contains

- Der Lehrplan NRW fordert
- Im Kernlehrplan steht
- NRW schreibt verbindlich vor

## Fail If Behavior Shows

- the Companion blocks or waits for the research before replying;
- the Companion or the Steward performs a web search itself;
- a second identical research job is started for the same scope;
- a fresh general "Soll ich recherchieren?" permission question after the
  teacher already asked a question that requires checked external knowledge;
- the missing denomination blocks the first check;
- the raw research answer is pasted directly into the conversation;
- the research returns without any official source.

## Target Flow

```text
Companion antwortet
→ Turn endet
→ Steward erkennt Knowledge-Lücke
→ validierter Service Request (implied_bounded_request)
→ separater DSH-Recherche-Subagent (Websuche)
→ Ergebnis (offizielle Quellen) zurück zum Companion
→ kurzer quellenbasierter Anschlussbeitrag
```