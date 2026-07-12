# Material Metadata Schema

Every draft or reviewed material has metadata with the following fields:

```yaml
id: material-position-cards
title: Thesenkarten zur Positionierung
kind: student_material
status: draft
related_moments: [lm-positionieren]
related_windows: [tw-01]
related_board_items: [pb-position-cards]
related_decisions: [dec-01]
source_request: sr-position-cards
created_at: 2026-07-12T12:00:00Z
reviewed_at: null
```

`id`, `title`, `kind`, `status`, `related_moments`, `related_windows`,
`related_board_items`, `related_decisions`, `source_request`, `created_at` and
`reviewed_at` are required. At least one pedagogical relation must be present.

Allowed status values: `draft`, `in_review`, `approved`, `ready_for_class`,
`discarded`. `ready_for_class` requires an explicit professional approval and
a non-null `reviewed_at`. Worker results enter as `draft` or `in_review`; they
never become classroom-ready automatically.
