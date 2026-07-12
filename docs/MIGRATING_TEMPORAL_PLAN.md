# Migration to Temporal Plan v1

Legacy learning landscapes may contain a `Teaching Windows` YAML block with
`teaching_windows` and `placements`. Migrate it deterministically:

1. Preserve the original `learning-landscape.md` as
   `learning-landscape.pre-temporal-plan-v1.md`.
2. Create `temporal-plan.yml` with `schema: ptspace.temporal-plan/v1` and
   `landscape: learning-landscape.md`.
3. Copy every legacy window id and title. Map a missing legacy kind to `lesson`.
4. Copy every placement without changing its referenced moment id. Map `node`
   to `moment_id`, `window` to `window_id` and `minutes` to `duration_minutes`.
   Use `start_minute: 0`, `dramaturgical_role: other` and `mode: common` when
   legacy data does not provide them.
5. Remove the legacy time block from the canonical landscape only after the new
   file validates. Keep all learning moments, transitions and IDs unchanged.
6. Commit the migration with a teacher-facing message. Repeated migration must
   detect an existing `temporal-plan.yml` and leave it unchanged.

No time data is discarded. Ambiguous legacy information is retained in the
placement `note` and marked for review rather than guessed.