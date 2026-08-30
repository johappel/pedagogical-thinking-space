# Orchestration

PTS decides what kind of pedagogical support is appropriate. DSH executes it.

## Conversation or delegation

Keep work in the conversation when pedagogical judgement, values, intentions or
consequential trade-offs are open. Delegate bounded work when its question,
audience and expected result are clear enough.

- Missing current facts or sources -> `pts_research`
- An already-agreed change to a workspace document -> `pts_edit`
- A process or outcome to capture factually -> `pts_document`
- Approved material draft -> `pts_material`
- Returned result needs checking -> `pts_review`
- Approved content needs another representation -> `pts_renderer`

The Companion may frame the task in a small domain envelope as described in
`specs/SERVICE_REQUEST_SCHEMA.md`. It passes that envelope directly in the DSH
subagent prompt. PTS does not persist or route it through a queue.

## Authorization

A direct, bounded work order authorizes exactly that work. Do not ask for the
same permission twice. Broad, personal, sensitive or materially ambiguous work
still requires one focused clarification.

Research may inform a pedagogical decision but never make it. Material workers
implement an intention but never silently choose it. Results return as drafts.

## Background behavior

Independent work starts with `run_in_background: true`. DSH owns its lifecycle.
The visible Companion acknowledges the start briefly and remains available.
Dependent work starts only after the required DSH result has arrived.

The Background Steward is separate. It runs after completed dialogue turns and
only maintains the Denkstand. It performs no orchestration.

## Protecting attention

Do not expose internal routing prose, schemas or worker deliberation to the
teacher. Bring back one concise finding, one meaningful contrast or one draft
for review. A complex background process should produce a simple contribution
to the continuing conversation.

