# Pedagogical Thinking Space

> **A Reflective Architecture for Human–AI Educational Design**
>
> *Helping teachers think — not replacing their thinking.*

---

# Teaching is not a production problem.

Large Language Models have become remarkably good at producing educational artefacts.

Within seconds they can generate

* lesson plans,
* worksheets,
* presentations,
* quizzes,
* LiaScript courses,
* Moodle activities,
* complete teaching units.

The challenge is no longer production.

The real challenge is educational judgement.

Good teaching does not emerge because someone writes excellent worksheets.

Good teaching emerges because teachers make thoughtful educational decisions.

Good learning materials emerge from good educational decisions.

Good educational decisions emerge through shared reflection.

This project explores how AI can support that reflective process.

---

# The Vision

Instead of asking

> "What lesson should I generate?"

the conversation begins with another question:

> **"What kind of learning experience are we trying to create?"**

The goal is not to replace the teacher.

The goal is to strengthen the teacher's professional thinking.

The teacher remains responsible for educational decisions.

AI becomes a thoughtful design partner.

---

# The Core Idea

The project separates four fundamentally different activities that today's AI systems often mix together.

* Reflection
* Experience
* Production
* Publication

Each deserves its own place.

Only reflection happens together with the teacher.

Everything else supports that conversation.

---

# Architecture
<img width="1600" height="1100" alt="pedagogical-thinking-space-en" src="https://github.com/user-attachments/assets/23b00ebb-f57e-4395-b092-9f9879db3079" />

The Critical Friend is the only visible conversation partner.

Everything else operates quietly in the background.

---

# The Learning Design

The Learning Design is the heart of the system.

It is neither

* a lesson plan,
* a LiaScript course,
* a worksheet,
* nor a Moodle course.

Instead,

it is the shared educational understanding developed by the teacher and the Critical Friend.

It contains

* educational intention,
* learner context,
* learning journey,
* design decisions,
* learning activities,
* reflections,
* and open questions.

Everything else is derived from it.

---

# Reflection before Production

<img width="1600" height="950" alt="pedagogical-thinking-space-flow-en" src="https://github.com/user-attachments/assets/60668614-1dcd-4b87-a0c7-fc195d07e07c" />


One of the central design principles of this project is the deliberate separation of thinking and producing.

The conversation continues while implementation happens elsewhere.

Teacher and Critical Friend remain focused on educational reflection.

Routine work happens in the background.

This creates a slower and more thoughtful design process without slowing down production.

---

# Core Components

## CRITICAL_FRIEND.md

Defines the behaviour of the reflective conversation partner.

The Critical Friend moderates the design process, asks questions, challenges assumptions and protects the teacher's thinking.

---

## LEARNING_DESIGN.md

Defines the shared object of every conversation.

It represents the evolving educational design.

---

## ORCHESTRATION.md

Describes how the Critical Friend decides

* when to reflect,
* when to consult experience,
* when to retrieve professional knowledge,
* when to delegate work,
* and when to publish.

---

## core/MEMORY.md

Captures professional experience.

Not conversations.

Not files.

Educational patterns.

---

## core/KNOWLEDGE.md

Provides curated professional knowledge.

Research.

Curricula.

Didactics.

Educational psychology.

Legal frameworks.

Professional practice.

---

## core/WORKER.md

Transforms educational decisions into educational artefacts.

Workers never participate in educational reflection.

---

## core/RENDERER.md

Expresses one Learning Design through different educational formats.

Examples include

* LiaScript
* RELIPULS
* Moodle
* H5P
* printable material
* teacher guides

The educational design remains unchanged.

---

# Design Principles

The architecture follows a small number of fundamental principles.

## Human thinking comes first.

AI supports professional reflection.

It never replaces educational judgement.

---

## Reflection before production.

Educational decisions should precede implementation.

---

## Experience before optimisation.

Professional experience matters as much as technical capability.

---

## One conversation.

The teacher always speaks with one partner.

Never with a committee of AI agents.

---

## Quiet services.

Memory.

Knowledge.

Workers.

Renderers.

All remain invisible unless needed.

---

## Learning Design is the single source of truth.

Every service operates on the same educational understanding.

---

# A Typical Conversation

Teacher

> "I'd like to start this lesson with a Position Line."

Critical Friend

> "Before we decide on the method:
>
> What should learners experience during this first phase?"

The conversation continues.

Meanwhile,

a Worker quietly prepares a first draft of the Position Line activity.

Later,

the Critical Friend returns with

> "A draft is ready.
>
> Shall we look at it now,
>
> or continue refining the learning journey first?"

Thinking and production become independent.

---

# Why this project is different

Most AI teaching assistants optimise production.

Critical Friend optimises educational thinking.

The goal is not to create better prompts.

The goal is to create better educational conversations.

---

# Long-Term Vision

This project explores a different relationship between teachers and AI.

Not

Teacher ← AI Assistant

but

Teacher ↔ Critical Friend

working together on a shared Learning Design.

If successful,

the result is not simply better teaching materials.

The result is better professional judgement.
