# Worker Capabilities

This folder contains capability documents for the Worker service.

Use these files when a Worker task has already been pedagogically approved and now needs concrete implementation guidance.

## Rule for Agents

Executable capabilities are resolved through the **capability registry**
(`capabilities/registry.yml`) from the PTS root — never by searching a Denkraum.
The registry is the single routing source and records each capability's stable
`task` id, service, status, tools, result schema and output handler.

Worker Service Requests should include:

```yaml
capability: capabilities/workers/<CAPABILITY_FILE>.md
```

If no suitable capability exists, do not improvise silently.

Create a proposal in:

```text
capabilities/workers/_proposals/
```

or ask whether a new capability should be defined.

## Current Capabilities

| File | Task id | Mode | Registry status |
|---|---|---|---|
| `RESEARCH_PEDAGOGICAL_ALTERNATIVES.md` | `research_pedagogical_alternatives` | research | contract-only |
| `CREATE_BOARD_MATERIAL.md` | `create_board_material` | draft | contract-only |
| `CREATE_STUDENT_INSTRUCTION.md` | `create_student_instruction` | draft | contract-only |
| `DIAGRAM.md` | `generate_diagram` | draft | contract-only |
| `IMAGE_GENERATION.md` | `generate_image` | draft | contract-only |
| `METRICS.md` | `analyse_metrics` | review | contract-only |

`contract-only` means the capability contract is defined but no DSH executor is
wired yet, so it is documented but not dispatched. Only capabilities marked
`executable` in the registry are routed to a DSH subagent. Curriculum, law and
standards checks are **not** Worker capabilities — they belong to the
`knowledge` service (see `capabilities/knowledge/VERIFY_CURRICULUM_ALIGNMENT.md`).
