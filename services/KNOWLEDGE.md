# KNOWLEDGE.md

> *Connecting educational reflection with professional knowledge.*

---

# Purpose

Knowledge provides access to the shared knowledge of the educational profession. 

Unlike Memory,

Knowledge does not belong to the individual teacher.

It belongs to the wider educational community.

---

# What Knowledge contains

Knowledge may include

* curriculum documents,
* educational standards,
* educational research,
* subject didactics,
* developmental psychology,
* learning sciences,
* educational law,
* OER resources,
* professional literature,
* exemplary Learning Designs.

Knowledge is curated.

It is not an unrestricted web search.

---

# Knowledge as a Living Wiki

Knowledge is organised as a living educational wiki.

Rather than storing isolated documents,

it connects concepts, methods, research findings and educational practices.

Examples include

* Position Line
* Role Play
* Inquiry Learning
* Moral Dilemmas
* Formative Assessment
* Existential Questions
* Cooperative Learning

Every concept is connected to related ideas.

---

# OKF Compatibility

The shared Knowledge base should be compatible with the Open Knowledge Format (OKF).

Knowledge is represented as markdown files with YAML frontmatter.

Each curated knowledge document should include at least:

- `type`
- `title`
- `description`
- `tags`
- `status`
- `timestamp`

Where applicable, it should also include:

- `resource`
- `jurisdiction`
- `school_type`
- `subject`
- `grade`
- `license`
- `source_status`

Knowledge Proposals are not curated Knowledge.

They should remain in `knowledge/_proposals/` until reviewed.

---

# Relationship to the Pedagogical Companion

The Pedagogical Companion consults Knowledge when professional expertise is needed.

Knowledge never enters the conversation directly.

The Pedagogical Companion interprets it in relation to the current Learning Design.

---

# Relationship to Learning Design

Learning Design determines the question.

Knowledge offers possible answers.

The Pedagogical Companion decides whether and how they become relevant.

Knowledge never determines the educational design.

---

# Relationship to Memory

Knowledge contains

shared professional knowledge.

Memory contains

personal professional experience.

Both complement one another.

Neither replaces the other.

---

# Relationship to Workers

Workers may retrieve information from Knowledge,

but they never change it.

Knowledge evolves through careful curation,

not automatically through generated content.

---

# Guiding Principle

Knowledge does not tell teachers what to do.

It expands the range of well-founded possibilities.

Professional judgement remains with the teacher and the Pedagogical Companion.

A Knowledge request must define source expectations and citation requirements.


---

# Knowledge Proposals

Knowledge may grow from conversations.

When the Pedagogical Companion develops a reusable insight, method pattern, professional caution or source pointer, it may propose adding it to Knowledge.

Such material must first be stored as a Knowledge Proposal.

A Knowledge Proposal is not yet curated Knowledge.

It may contain:

- reusable didactic patterns,
- source candidates,
- curriculum connections,
- professional cautions,
- method distinctions,
- language formulations,
- examples of Learning Design moves.

Knowledge Proposals must clearly mark:

- what is verified,
- what is interpreted,
- what is uncertain,
- which sources still need checking.

Knowledge Proposals should be stored in:

- `workspace/<project-slug>/knowledge-proposals/` for project-specific knowledge,
- `knowledge/_proposals/` for generally reusable knowledge.

They should be written as OKF-compatible Markdown with YAML frontmatter and a Markdown body.

Use:

`specs/KNOWLEDGE_PROPOSAL_TEMPLATE.md`

to keep proposal structure consistent.

Only reviewed and curated proposals may be moved into `knowledge/`.

---

# Direct work orders and the proposal boundary

A direct teacher work order is itself the authorization for one bounded,
public, source-grounded knowledge check. A question or instruction such as
„Kannst du … verifizieren?", „Prüfe den Lehrplanbezug", „Recherchiere …" or
„Speichere das als Knowledge" already authorises exactly that check as an
`implied_bounded_request`. The Pedagogical Companion does not answer it with a
second permission question such as „Soll ich recherchieren?" or „Möchte ich
jetzt die Recherche starten?", and it never devalues an authorization already
given with a second approval question. On an open scope detail — for example the
denomination in religious education — the check begins with the reasonable
public default (evangelische and katholische Religionslehre) instead of blocking
on a clarifying question.

When the Companion itself proposes capturing an insight, it may still ask
whether to keep it as a Knowledge Proposal. But when the teacher has explicitly
asked to store the verified information in Knowledge, the verified result is
filed immediately as a reviewable, not-yet-curated Knowledge Proposal under
`knowledge-proposals/` — without a second approval for the proposal creation and
never directly into curated `knowledge/`. Adoption into curated Knowledge
remains a later, separate decision after the result has returned. This keeps the
Knowledge review boundary intact: the proposal stays reviewable and provisional.
