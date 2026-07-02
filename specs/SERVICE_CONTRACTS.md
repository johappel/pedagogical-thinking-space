## Renderer Contract

Input:

- current Learning Design
- approved rendering specification
- optional artefacts produced by Workers

Output:

- rendered artefact in the requested format
- validation note
- list of assumptions
- list of unresolved issues, if any

The Renderer must fail gracefully if no approved rendering specification exists.