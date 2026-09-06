# pts-landscape

This package owns the host routes and the canonical `Product Status` and
`Unterrichtsreihe` views. The separate `pts-moment-workshop` plugin shadows
only the `conversation.view` entry `landscape`; it provides the primary
learning-moment surface as a calm board.

`learning-landscape.md` remains the Thinking Model's collection of
independent learning moments. `teaching-product.json` is the canonical product
after explicit migration: `series -> lessons -> phases -> materials`. A moment
may be referenced by several phases; changing it never rewrites an accepted
phase. `temporal-plan.yml` remains readable as a legacy migration source and
is write-protected after migration.

The existing host routes support structured moment and material edits, artifact
reads, layout persistence and legacy transition reading. Product operations
use `/api/pts-product`; temporary Focus Context uses `/api/pts-focus`. The
`pts-conversation-binding` plugin adds `/api/pts-conversation-binding` for the
minimal technical mapping from an object to a DSH session. No route stores chat
messages or creates a PTS dispatcher.

The workshop's default didactic functions are configured in
`config/moment-workshop.json`:

`Einstieg`, `Erkunden`, `Erarbeiten`, `Vertiefen`, `Sichern`, `Transfer`.

Workspace-specific overrides live at `.pts/moment-workshop.json`. Dragging a
card changes only its didactic `Funktion`; it creates no phase, placement or
transition. Existing transitions remain readable under a collapsed
`Legacy-Übergänge` section.

“Werkstatt” opens the editor. “Darüber sprechen” sets a temporary focus and
asks the binding plugin to reuse or create one DSH Companion session for that
object. DSH owns session creation, history, reopening and navigation. The
registry under `.pts/conversation-bindings.json` stores only `{ kind, id,
sessionId }` metadata and is not pedagogical content. Main, moment, phase,
material and question threads therefore keep separate histories while the
prompt snapshot reads the current shared workspace.

Install the canonical preset and then the two profile plugins:

```powershell
pwsh -File .\scripts\install-pts-preset.ps1
pwsh -File .\scripts\install-pts-web-plugins.ps1
```

Restart DSH after installation. The profile routine creates only junctions
that are absent or already point at this checkout; it refuses unrelated
directories and adds idempotent rows to the personal `pts-web`
`cordis.patch.yml`.

The deterministic checks are:

```powershell
npm run check:dsh-client-contract
npm run test:product
npm run test:product:e2e
node --test --test-isolation=none tests/pts-web-plugin-install.test.mjs
```

The browser tests verify the UI and navigation contract with a local,
deterministic DSH-shaped fixture. They do not prove autonomous model quality.
A live acceptance still requires a restarted authenticated `pts-web` profile,
real DSH session creation and reopening, and the browser flow in that profile.
