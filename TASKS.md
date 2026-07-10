# Pedagogical Thinking Space – Implementation Tasks

This file turns the reference architecture into small, testable work packages. It is intentionally separate from individual application roadmaps.

## Current Decisions

- [x] Learning Design is the shared pedagogical object.
- [x] Workers operate only from approved Service Requests.
- [x] Knowledge, Worker, Renderer and Review remain invisible services.
- [x] The app is a teacher-facing environment, not a harness UI.
- [ ] Learning Landscape is the canonical topology for non-linear as well as linear learning.
- [ ] Planning Board models teacher planning work separately from learner pathways.
- [ ] Teaching Windows place learning nodes in time without reducing them to one-lesson objects.

## Phase K1 — Kernel Contracts

- [x] Define `specs/LEARNING_LANDSCAPE_SCHEMA.md`.
- [x] Define `specs/PLANNING_BOARD_SCHEMA.md`.
- [ ] Add a machine-readable validation schema for Learning Landscape.
- [ ] Add a machine-readable validation schema for Planning Board.
- [ ] Define stable material ids and a material manifest.
- [ ] Define compatibility and migration rules for existing `learning-design.md` workspaces.
- [ ] Define the migration of legacy `service-requests/` into Planning Board items and the teacher-facing translation “Nächste Schritte”.

**Done when:** an agent can validate a landscape, board and their cross-references without interpreting free prose.

## Phase K2 — Critical Friend Behaviour

- [ ] Extend `CRITICAL_FRIEND.de.md` with the distinction:
  - learner pathway / Learning Landscape,
  - teacher planning work / Planning Board,
  - material outputs.
- [ ] Require a proposal preview for every AI landscape change.
- [ ] Forbid silent node deletion, goal changes, temporal replanning and material release.
- [ ] Define one-at-a-time Planning Board proposal behaviour.
- [ ] Add conversation examples for linear, stations, buffet, project and hybrid learning landscapes.

**Done when:** the Critical Friend does not misuse “Nächste Schritte” for lessons or learning activities, and the term always points to an actionable Planning Board item.

## Phase K3 — Service Contracts

- [ ] Extend Service Request schema with `related_nodes`, `related_windows` and expected material ids.
- [ ] Define Worker input snapshots for landscape-bound material tasks.
- [ ] Define Review criteria for changed nodes, transitions and time placements.
- [ ] Define Knowledge result requirements: official sources, citation, retrieval date, uncertainty.
- [ ] Define an explicit `landscape_change_proposal` artefact.

**Done when:** every service result can be traced to a node, time window or board item.

## Phase K4 — Tests and Examples

- [ ] Create a linear example landscape.
- [ ] Create a stations/buffet example landscape.
- [ ] Create a project/deeper-learning example landscape.
- [ ] Test invalid references, cycles, missing material ids and unsafe AI patches.
- [ ] Test that layout-only changes never alter semantic files.
- [ ] Test that unapproved proposals never change the canonical landscape.

## Handover Order

1. Complete K1 before application implementation.
2. Complete K2 before enabling AI canvas changes.
3. Complete K3 before connecting Workers or Knowledge to the board.
4. Complete K4 before declaring the new model stable.
