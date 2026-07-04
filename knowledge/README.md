# Knowledge

This folder contains curated professional knowledge for the Pedagogical Thinking Space.

It is not a dump of ad hoc notes or raw search results.

Curated knowledge should be:

- source-transparent,
- reviewable,
- reusable beyond one project,
- compatible with the repository's OKF-oriented structure.

---

# Structure

```text
knowledge/
  README.md
  index.md
  curricula/
  didactics/
  methods/
  concepts/
  sources/
  _proposals/
```

## Curated folders

- `curricula/` for curated curriculum knowledge
- `didactics/` for didactic patterns and subject-specific reasoning
- `methods/` for reusable classroom methods
- `concepts/` for professional concepts and distinctions
- `sources/` for curated source notes or source-grounded reference entries

## Proposal folder

`_proposals/` is the review buffer for reusable knowledge that is not yet curated.

Files in `_proposals/` should follow:

`specs/KNOWLEDGE_PROPOSAL_TEMPLATE.md`

They should remain proposals until reviewed.

---

# Flow

```text
conversation or service result
  -> Knowledge Proposal
  -> review
  -> curated knowledge/
```

Project-specific proposals belong in:

```text
workspace/<project-slug>/knowledge-proposals/
```

General proposals belong in:

```text
knowledge/_proposals/
```

Do not write directly into curated `knowledge/` without review.

---

# Import

Imported Knowledge should not be copied directly into curated `knowledge/`.

Place imports first in:

```text
knowledge/_incoming/
```

Then review the imported material.

After review, reusable candidates may move to:

```text
knowledge/_proposals/
```

Only reviewed and curated Knowledge should be moved into:

```text
knowledge/curricula/
knowledge/didactics/
knowledge/methods/
knowledge/concepts/
knowledge/sources/
```

Do not import private teacher memory from `memory.local/` into shared Knowledge.