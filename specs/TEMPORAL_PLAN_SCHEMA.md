# Temporal Plan Schema

> Canonical temporal realisation of `learning-landscape.md`.

```yaml
schema: ptspace.temporal-plan/v1
title: Standardplanung
landscape: learning-landscape.md

windows:
  - id: tw-01
    title: Stunde 1 – Irritation und Positionierung
    kind: lesson
    duration_minutes: 45
    note: ''

placements:
  - id: tp-01
    moment_id: lm-impuls
    window_id: tw-01
    start_minute: 0
    duration_minutes: 8
    dramaturgical_role: opening
    mode: common
    note: Kein vorwegnehmendes Unterrichtsgespräch.
```

## TeachingWindow

A teaching window has `id`, `title`, `kind`, `duration_minutes` and optional
`note`. Allowed kinds are `lesson`, `double_lesson`, `project_block` and
`open_learning_time`.

## TimePlacement

A placement has `id`, `moment_id`, `window_id`, `start_minute`,
`duration_minutes`, `dramaturgical_role`, `mode` and optional `note`.

Allowed roles: `opening`, `irritation`, `exploration`, `deepening`,
`practice`, `decision`, `consolidation`, `reflection`, `closing`,
`transition`, `buffer`, `other`.

Allowed modes: `common`, `choice`, `parallel`, `individual`, `group`, `open`.
`choice` represents alternatives, and `parallel` represents simultaneous
paths; neither may be displayed as one compulsory sequence.

## Validation

IDs are unique. Every placement references an existing learning moment and an
existing window. Start and duration are non-negative, and a placement must end
within its window unless explicit overbooking is documented. A learning moment
may have zero, one or many placements. Changing a placement never changes the
learning landscape. AI changes are proposals until teacher approval.
