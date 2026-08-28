# Worker Task Envelope

This is a pedagogical input shape, not a queue, registry or runtime protocol.
The Companion may serialize it into the prompt of a role-specific DSH subagent.
It is not persisted for routing and has no PTS-owned lifecycle.

```yaml
role: research                # research | material | review | renderer
purpose: Verify the NRW curriculum relation for the proposed topic.
authorization:
  type: explicit_chat
  evidence: <teacher-message-id>
input:
  learning_design: workspace/<slug>/learning-design.md
  topic: Utopie und Hoffnung
constraints:
  public_sources_only: true
  language: de
expected_result:
  kind: source_grounded_brief
  draft_location: workspace/<slug>/drafts/curriculum-check.md
return_to: companion
```

Required information:

- one role and bounded purpose;
- recognizable authorization;
- only the relevant workspace context;
- explicit constraints and expected result;
- return to the Companion.

The envelope contains no model id, tool list, retry state, job state or output
handler. Those belong to the DSH preset and DSH runtime.

