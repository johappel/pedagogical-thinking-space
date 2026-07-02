# RENDERER.md

> *Expressing one Learning Design in many forms.*

---

# Purpose

A Renderer transforms a Learning Design into a specific representation.

It does not redesign learning.

It does not reinterpret educational decisions.

Its task is to faithfully express the existing Learning Design in a form that serves a particular audience or platform.

---

# Principle

One Learning Design

can become

many representations.

The educational design remains identical.

Only its expression changes.

---

# Input

Every Renderer receives

* the current Learning Design,
* completed design decisions,
* the intended target format,
* optional formatting constraints.

The Renderer never invents educational intentions.

---

# Output

Typical renderers include

* LiaScript
* RELIPULS
* Moodle
* H5P
* teacher guides
* worksheets
* presentations
* workshop material
* project documentation
* printable PDFs

Future renderers may support additional educational ecosystems.

---

# Fidelity

A Renderer preserves

* educational intention,
* learning journey,
* design decisions,
* terminology,
* learning activities.

It may adapt

* layout,
* structure,
* navigation,
* formatting,
* interaction model,
* media representation.

The pedagogy must remain unchanged.

---

# Relationship to the Learning Design

The Learning Design is the single source of truth.

Renderers never modify it.

If a renderer discovers inconsistencies,

it reports them back to the Critical Friend.

Only the Critical Friend and the teacher may change the Learning Design.

---

# Relationship to Workers

Workers create educational artefacts.

Renderers package these artefacts for a specific destination.

A Worker might create

* a worksheet,
* a diagram,
* a quiz.

A Renderer decides

how these artefacts appear

inside

* a LiaScript course,
* a RELIPULS article,
* a Moodle course,
* or another educational format.

---

# Relationship to Knowledge

Some renderers require domain-specific knowledge.

Examples include

* LiaScript syntax,
* Moodle structures,
* accessibility requirements,
* metadata standards,
* publishing conventions.

Renderers may consult the Knowledge Service,

but never change educational decisions.

---

# Relationship to Memory

Renderers do not access Memory directly.

Educational experience should influence the Learning Design,

not its representation.

---

# Quality

A good renderer is

* faithful,
* complete,
* readable,
* idiomatic,
* platform-aware.

A renderer should make the Learning Design feel natural within the target environment,

without changing its educational meaning.

---

# Rendering Specifications

Renderers never improvise target formats.

Every target format must be described by a rendering specification in `specs/`.

The Renderer checks the relevant specification before producing output.

If no specification exists, the Renderer asks the Critical Friend to create one and request teacher approval.

The rendering specification defines how the Learning Design is expressed in a particular format.

It does not change the Learning Design.

It only defines the rules for representation.

---

# Examples

One Learning Design

↓

Renderer: RELIPULS

↓

A one-hour teaching impulse with accompanying teacher guidance.

---

One Learning Design

↓

Renderer: LiaScript

↓

An interactive learning experience including quizzes, media and exercises.

---

One Learning Design

↓

Renderer: Moodle

↓

A structured online course with activities, assignments and grading support.

---

One Learning Design

↓

Renderer: Workshop

↓

A facilitation guide for teacher training.

---

# Guiding Principle

Renderers change representation.

They never change learning.
