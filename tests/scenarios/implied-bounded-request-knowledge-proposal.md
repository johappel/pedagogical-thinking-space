# Scenario: Implied Bounded Request with Knowledge Proposal Storage

Exact real case for the "explicit order delegates without a second approval"
contract. The visible-response guard is executable in
[../companion-response-guard.test.mjs](../companion-response-guard.test.mjs).

## User Prompt

Kannst du die Quellen verifizieren und im Knowledge speichern?

## Expected Behavior (Companion, visible turn)

The Companion:

- treats the order as an authorization (`implied_bounded_request`) and does
  **not** ask a second permission question;
- gives a short confirmation that the check starts in the background;
- names the provisional storage target (a Knowledge Proposal in the Denkraum);
- treats the missing denomination as non-blocking (evangelisch **and**
  katholisch);
- does **not** explain the internal schema/agent/plugin process;
- does **not** claim the proposal was already created before the background job
  succeeded;
- ends the visible turn (does not wait for the research).

A compliant first response looks roughly like:

> Ja. Ich lasse die offiziellen NRW-Lehrplanquellen jetzt im Hintergrund prüfen.
> Da die Konfession noch offen ist, werden evangelische und katholische
> Religionslehre berücksichtigt. Das Ergebnis lege ich zunächst als
> überprüfbares Knowledge Proposal im Denkraum ab. Nach Abschluss bringe ich den
> quellenbasierten Befund zurück; erst danach geht es um die Übernahme ins
> kuratierte Knowledge.

## Expected Behavior (Background Steward, after the turn)

- recognises the authorized knowledge need;
- emits exactly **one** `service_intents` entry (`verify_curriculum_alignment`,
  `authorization.type: implied_bounded_request` grounded in the teacher message)
  carrying `expected_output.type: knowledge_proposal` with a
  `knowledge-proposals/` location;
- does **not** research itself (keeps `read`, `glob`, `grep`).

## Expected Behavior (separate DSH research subagent)

- is the only actor with web access;
- checks evangelische **and** katholische Religionslehre;
- returns a validated brief with official sources and named uncertainties.

## Expected Storage

- the result is written as an OKF-compatible Knowledge Proposal under
  `workspace/<project-slug>/knowledge-proposals/`;
- it is **not** written into curated `knowledge/`;
- verified sources, source candidates, interpretation and uncertainty are
  separated; `status: proposal`.

## Back-channel

- the internal summary returns to the Companion, which then produces one short,
  source-based follow-up contribution;
- the raw research answer never appears verbatim in chat;
- a failed job is never presented as success (no claimed file that does not
  exist);
- duplicate turns for the same scope produce no duplicate job or proposal.

## Fail If Response Contains

- Soll ich recherchieren
- Möchte ich jetzt die Recherche starten
- Wenn ja
- Soll ich evangelisch oder katholisch prüfen

## Fail If Behavior Shows

- the Companion or the Steward performs a web search itself;
- a blocking denomination question;
- a second approval question after the explicit order;
- a proposal written directly into curated `knowledge/`;
- a claimed saved file that does not exist;
- a second identical job for the same scope.

## Negative and boundary cases

- General reflection about hope without a knowledge question starts no research.
- A broad or sensitive search remains approval-bound.
- A general curriculum question **without** a storage order stays a draft under
  `drafts/` (no Knowledge Proposal).
- A duplicate turn produces no second job.
- A storage order without a successful source check produces no seemingly
  verified proposal.

## Target Flow

```text
Expliziter Nutzerauftrag
→ kurze Companion-Bestätigung ohne zweite Genehmigung
→ sichtbarer Turn endet
→ Steward erzeugt autorisierten Service Intent (expected_output: knowledge_proposal)
→ separater Research-Subagent recherchiert beide Konfessionen
→ OKF-kompatibles Knowledge Proposal wird gespeichert
→ Ergebnis kehrt zum Companion zurück
→ kurzer quellenbasierter Anschlussbeitrag
```
