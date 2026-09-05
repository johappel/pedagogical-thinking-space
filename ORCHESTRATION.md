# Orchestration

PTS decides what kind of pedagogical support is appropriate. DSH executes it.

## Conversation or delegation

Keep work in the conversation when pedagogical judgement, values, intentions or
consequential trade-offs are open. Delegate bounded work when its question,
audience and expected result are clear enough.

- Missing current facts or sources -> `pts_research`
- A small, already-agreed Denkstand update -> direct `pts_edit`
- A larger or pedagogically unresolved edit -> `pts_edit_legacy` only as a
  bounded worker fallback, or keep it in conversation until clarified
- A process or outcome to capture factually -> `pts_document`
- Workspace completeness, consistency or provenance check -> `pts_documentarian`
- Approved material draft -> `pts_material`
- Returned result needs checking -> `pts_review`
- Approved content needs another representation -> `pts_renderer`

The Companion may frame the task in a small domain envelope (intention,
expected output, constraints) as described in `specs/PLANNING_BOARD_SCHEMA.md`.
It passes that envelope directly in the DSH subagent prompt. PTS does not
persist or route it through a queue.

## Authorization

A direct, bounded work order authorizes exactly that work. Do not ask for the
same permission twice. Broad, personal, sensitive or materially ambiguous work
still requires one focused clarification.

Research may inform a pedagogical decision but never make it. Material workers
implement an intention but never silently choose it. Results return as drafts.

## Background behavior

Independent work starts with `run_in_background: true`; the five specialist
workers and `pts_documentarian` are configured as `backgroundMode: continuable`,
so that is also their default. DSH owns the lifecycle. The visible Companion
acknowledges the start briefly and remains available. A follow-up for the same
subject uses the existing child id through native `send_message`; a different
subject gets a new child. `interrupt_agent` stops the current turn but does not
close the durable child. DSH currently has no public close/delete operation, so
PTS does not add an idle scheduler or cleanup layer. Dependent work starts only
after the required DSH result/settlement has arrived.

The semantic distinction is deliberate: background describes whether the
conversation waits, while continuable describes whether the same specialist
can be addressed again with its existing context.

Small direct edits are structured and guarded. `pts_edit` has no arbitrary
path, raw write or raw edit argument: it can only park a proposed open question
or record a teacher-confirmed decision in the current Denkraum. Large design
rewrites, materials and unresolved pedagogical choices remain outside this
direct path.

The Documentarian is a normal DSH worker, not a post-turn scheduler. The
Companion invokes it for an explicit, bounded workspace check or after an
accepted result with a documentation target. It preserves provenance and
reports gaps; it does not decide pedagogy, curate Knowledge or start workers.

## Protecting attention

Do not expose internal routing prose, schemas or worker deliberation to the
teacher. Bring back one concise finding, one meaningful contrast or one draft
for review. A complex background process should produce a simple contribution
to the continuing conversation.

