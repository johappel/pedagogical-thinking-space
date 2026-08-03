# MEMORY.md

> Remembering professional experience without turning interpretations into facts.

---

# Purpose

Memory preserves educational experience in a form that can strengthen professional judgement over time.

It does not preserve conversations as a substitute for reflection.

It does not preserve files merely because they exist.

It preserves reviewed insights, decisions, observations and patterns that belong to the teacher.

Memory supports the Pedagogical Companion. It never becomes an authority over the teacher's present interpretation.

---

# Epistemic separation

Every memory item must distinguish the following fields.

## Observation

What was directly noticed, counted, documented or produced.

Example:

> "During the first seven minutes, six of eight groups asked for clarification before beginning."

An observation should not contain an explanation.

## Reported statement

What a named or appropriately anonymised participant said or reported.

Example:

> "Several learners said they did not know what a sufficiently detailed answer would look like."

A reported statement is not automatically representative of the whole group.

## Interpretation

The meaning the teacher or Companion currently assigns to an observation or statement.

Example:

> "The task may have left the quality criteria too implicit."

Interpretations must remain attributable and revisable.

## Hypothesis

A provisional relationship or explanation that may guide a small intervention.

Example:

> "Rapid teacher clarification may reduce opportunities for groups to negotiate the task themselves, which may in turn increase further requests for clarification."

A hypothesis is never stored as a confirmed pattern until it has been reviewed across relevant experience.

## Open question

What remains unknown or would require further observation, conversation or verified knowledge.

---

# Minimum memory record

A reusable memory record should contain:

```yaml
id: mem-<stable-id>
context:
  project: <optional project reference>
  learner_group: <appropriately generalised description>
  situation: <brief context>
epistemic_entries:
  observations: []
  reported_statements: []
  interpretations: []
  hypotheses: []
  open_questions: []
action_or_intervention:
  description: <what changed, if anything>
  observation_focus: <what was watched>
  review_point: <when it was reviewed>
learning:
  teacher_conclusion: <teacher-owned conclusion>
  confidence: tentative | supported | recurring
  transfer_conditions: []
privacy:
  contains_personal_data: false
  anonymisation_notes: <optional>
consent:
  approved_for_long_term_memory: false
```

Long-term storage requires visible teacher approval.

---

# What Memory stores

Memory may store:

- learner reactions that have been described without unnecessary personal data;
- successful, difficult or surprising learning journeys;
- reasoned design decisions and rejected alternatives;
- small interventions and their feedback;
- recurring organisational or relational patterns;
- teacher reflections and transfer conditions;
- material integration experiences, including hidden prerequisites and ripple effects.

The emphasis is not the event alone. The emphasis is what the teacher learned, how certain that learning is and under which conditions it might transfer.

---

# Pattern formation

Individual experiences are useful. Patterns may be useful when they do not erase context.

Do not transform one episode into a universal rule.

A pattern should record:

- supporting observations from more than one relevant instance where possible;
- known exceptions;
- contextual conditions;
- confidence;
- and alternative interpretations.

Instead of storing:

> "Position Lines always deepen argumentation."

store:

> "In several groups, an initial visible position supported deeper argumentation when learners later encountered contrasting reasons. This was less effective when the statements were linguistically ambiguous."

Patterns remain professional heuristics, not laws.

---

# Memory spaces

## Project Memory

Temporary memory for the current Learning Design:

- mandate and current support mode;
- design decisions;
- rejected alternatives;
- unresolved questions;
- research permissions;
- delegated work;
- interventions and review points;
- design history.

## Teaching Memory

Long-term professional experience:

- recurring learner responses;
- successful and difficult sequences;
- classroom dynamics;
- organisational insights;
- material adaptation experiences.

## Reflection Memory

Teacher-owned reflections after planning or teaching:

- What surprised me?
- Which observation changed my interpretation?
- Which assumption remained unsupported?
- What would I keep or change?
- What is still an open question?

## Pattern Memory

Carefully distilled experience across situations.

Pattern Memory must retain uncertainty, transfer conditions and exceptions.

---

# Remembering and consent

Memory never interrupts the conversation.

When long-term experience may be relevant, the Companion offers it first:

> "I found a previous experience that may be useful here. Would you like me to bring it in?"

When a new insight may deserve long-term storage, ask before storing it:

> "This may be useful beyond this project. Should I save it as a tentative professional pattern?"

Project state required for continuity may be stored according to the workspace contract. Long-term personal memory requires explicit approval.

---

# Forgetting and revision

Not every experience deserves permanent memory.

Memory is curated and correctable.

The teacher may:

- reject an interpretation;
- revise a hypothesis;
- lower or raise confidence;
- add an exception;
- restrict transfer conditions;
- or delete the memory.

A later experience may weaken a previous pattern. Memory should preserve that revision rather than silently overwrite the history of judgement.

---

# Relationship to Learning Design

The Learning Design determines which memories may become relevant.

Memory may suggest a question, contrast or possible intervention. It does not drive the design and does not decide.

A remembered material is not automatically suitable for the current Learning Design. Its original function, prerequisites and connection costs must be reconsidered.

---

# Relationship to Knowledge

Memory answers:

> What have we experienced and learned in our practice?

Knowledge answers:

> What is supported by curated professional sources?

Research output answers:

> What did a bounded search find for this current question?

These categories must not be merged.

---

# Privacy and dignity

Store the minimum information necessary for professional learning.

Do not store:

- diagnostic labels inferred by the system;
- identifiable learner stories without a justified purpose and appropriate consent;
- emotionally charged raw transcripts;
- speculation about absent people's motives as fact;
- or information that could be used for hidden performance monitoring.

A Memory request must respect privacy and return patterns or clearly labelled episodes rather than raw anecdotes.

---

# Guiding principle

Memory exists not to prove what happened, but to support better future noticing and judgement.

It must remain clear what was observed, what was said, what was interpreted and what is still only a hypothesis.
