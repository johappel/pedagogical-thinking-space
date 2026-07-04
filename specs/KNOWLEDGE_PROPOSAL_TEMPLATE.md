# KNOWLEDGE_PROPOSAL_TEMPLATE.md

> Template for Knowledge Proposals before curation into the shared Knowledge base.

---

# Purpose

Knowledge Proposals capture reusable professional knowledge without moving it directly into curated `knowledge/`.

They are the required intermediate form when:

- a conversation produces reusable professional insight,
- a Knowledge request produces material that may outlive one project,
- a review identifies a reusable caution or pattern,
- a source-based summary should become part of the shared Knowledge base later.

Knowledge Proposals are:

- reviewable,
- source-transparent,
- OKF-compatible in structure,
- still provisional.

They remain proposals until reviewed.

---

# Storage Locations

Use:

```text
workspace/<project-slug>/knowledge-proposals/
```

for project-specific proposals.

Use:

```text
knowledge/_proposals/
```

for generally reusable proposals.

Do not write directly into curated `knowledge/`.

---

# Required Structure

Every Knowledge Proposal should be an OKF-compatible Markdown file with YAML frontmatter and a Markdown body.

Minimum frontmatter fields:

- `type`
- `title`
- `description`
- `tags`
- `status`
- `timestamp`
- `source_status`
- `suggested_location`

Optional frontmatter fields when relevant:

- `resource`
- `jurisdiction`
- `school_type`
- `subject`
- `grade`
- `license`

The body should clearly distinguish:

- verified source content,
- source candidates,
- interpretation,
- uncertainty,
- review readiness.

---

# Review Expectations

A Knowledge Proposal should make it easy to review:

- whether claims are source-grounded,
- whether interpretation is separated from source content,
- whether curriculum or legal claims are still uncertain,
- whether the proposal is reusable beyond one Learning Design,
- whether sensitive learner data has been excluded,
- where the proposal would belong after curation.

---

# Template

```markdown
---
type: Knowledge Proposal
title: <clear title>
description: <one-sentence description>
tags:
  - <tag-1>
  - <tag-2>
status: proposal
timestamp: YYYY-MM-DD
resource: <optional primary resource or topic>
jurisdiction: <optional>
school_type: <optional>
subject: <optional>
grade: <optional>
license: <optional>
source_status: <unverified|source-candidates-unverified|partly-verified|verified>
suggested_location: knowledge/<area>/<filename>.md
---

# Summary

Briefly summarize the reusable professional knowledge.

# Proposal

Describe the knowledge candidate itself.

# Why It Matters

Explain why this may be useful for future Learning Designs.

# Verified Sources

List sources that have actually been checked.

# Source Candidates

List sources that still need checking.

# Interpretation

Explain what is inferred from sources or professional reasoning.

# Uncertainty

List what remains open, context-bound or unverified.

# Review Checklist

- [ ] Sources checked where claims require verification
- [ ] Source content and interpretation are clearly separated
- [ ] No unsupported curriculum, legal or research claims
- [ ] Reusable beyond one Learning Design
- [ ] No private learner data
- [ ] Suggested location is plausible
```

---

# Example

```markdown
---
type: Knowledge Proposal
title: Rechtsextremismus im RU - Erkennen, Pruefen, Handeln
description: Didaktisches Muster fuer einen RU-Lernweg zu rechter Ideologie, Menschenwuerde und christlicher Ethik.
tags:
  - religionsunterricht
  - rechtsextremismus
  - menschenwuerde
  - ethik
  - didaktisches-muster
status: proposal
timestamp: 2026-07-04
source_status: source-candidates-unverified
suggested_location: knowledge/didactics/rechtsextremismus-erkennen-pruefen-handeln.md
---

# Summary

Ein moeglicher Lernweg im RU: Erkennen - Pruefen - Handeln.

# Proposal

...

# Why It Matters

...

# Verified Sources

Noch keine.

# Source Candidates

- Lehrplannavigator NRW
- KMK Demokratiebildung
- bpb Primaerpraevention Rechtsextremismus

# Interpretation

...

# Uncertainty

- Schulform offen
- Konfession offen
- konkrete Kernlehrplanfassung offen

# Review Checklist

- [ ] Sources checked where claims require verification
- [ ] Source content and interpretation are clearly separated
- [ ] No unsupported curriculum, legal or research claims
- [ ] Reusable beyond one Learning Design
- [ ] No private learner data
- [ ] Suggested location is plausible
```
