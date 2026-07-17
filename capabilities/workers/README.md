# Worker Capabilities

This folder contains capability documents for the Worker service.

Use these files when a Worker task has already been pedagogically approved and now needs concrete implementation guidance.

## Rule for Agents

Before creating or executing a Worker task, check this folder.

If a matching capability exists, use it.

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

- `IMAGE_GENERATION.md`
- `DIAGRAM.md`
- `METRICS.md`
- `CREATE_BOARD_MATERIAL.md`
