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

# Relationship to the Critical Friend

The Critical Friend consults Knowledge when professional expertise is needed.

Knowledge never enters the conversation directly.

The Critical Friend interprets it in relation to the current Learning Design.

---

# Relationship to Learning Design

Learning Design determines the question.

Knowledge offers possible answers.

The Critical Friend decides whether and how they become relevant.

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

Professional judgement remains with the teacher and the Critical Friend.

A Knowledge request must define source expectations and citation requirements.


---

# Knowledge Proposals

Knowledge may grow from conversations.

When the Critical Friend develops a reusable insight, method pattern, professional caution or source pointer, it may propose adding it to Knowledge.

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
