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

<img width="1600" height="1100" alt="pedagogical-thinking-space-en" src="https://github.com/user-attachments/assets/3039d773-57d7-494a-bc29-3a88fae4e524" />

  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-opacity="0.16"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#667085"/>
    </marker>
    <style>
      .bg { fill: #f7f4ed; }
      .card { fill: #ffffff; stroke: #ddd6c8; stroke-width: 2; filter: url(#shadow); }
      .soft { fill: #fbfaf7; stroke: #e7dfd0; stroke-width: 2; }
      .service { fill: #ffffff; stroke: #d9d2c4; stroke-width: 2; filter: url(#shadow); }
      .accent { fill: #f1eadc; stroke: #c9b999; stroke-width: 2; }
      .title { font-family: Arial, sans-serif; font-size: 50px; font-weight: 700; fill: #252525; }
      .subtitle { font-family: Arial, sans-serif; font-size: 25px; fill: #585858; }
      .h1 { font-family: Arial, sans-serif; font-size: 31px; font-weight: 700; fill: #242424; }
      .h2 { font-family: Arial, sans-serif; font-size: 23px; font-weight: 700; fill: #292929; }
      .body { font-family: Arial, sans-serif; font-size: 21px; fill: #4a4a4a; }
      .small { font-family: Arial, sans-serif; font-size: 17px; fill: #626262; }
      .label { font-family: Arial, sans-serif; font-size: 19px; font-weight: 700; fill: #6d5d3f; }
      .arrow { stroke: #667085; stroke-width: 3; fill: none; marker-end: url(#arrow); }
      .line { stroke: #c4b89f; stroke-width: 2.5; fill: none; stroke-dasharray: 8 8; }
    </style>
  </defs>

  <rect class="bg" x="0" y="0" width="1600" height="1100"/>
  <text class="title" x="800" y="82" text-anchor="middle">Pedagogical Thinking Space</text>
  <text class="subtitle" x="800" y="122" text-anchor="middle">A reflective educational thinking space — not another lesson generator</text>

  <rect class="card" x="110" y="175" rx="36" ry="36" width="1380" height="430"/>
  <text class="label" x="800" y="222" text-anchor="middle">VISIBLE SPACE: shared reflection</text>

  <rect class="soft" x="190" y="300" rx="28" ry="28" width="330" height="205"/>
  <text class="h1" x="355" y="350" text-anchor="middle">Teacher</text>

<text class="body" x="355" y="392" text-anchor="middle">
<tspan x="355" dy="0">brings idea, context</tspan>
<tspan x="355" dy="28">and responsibility</tspan>
</text>

  <rect class="soft" x="1080" y="300" rx="28" ry="28" width="330" height="205"/>
  <text class="h1" x="1245" y="350" text-anchor="middle">Critical Friend</text>

<text class="body" x="1245" y="392" text-anchor="middle">
<tspan x="1245" dy="0">asks, challenges,</tspan>
<tspan x="1245" dy="28">orders and protects</tspan>
</text>

  <path class="arrow" d="M 530 375 C 660 300, 940 300, 1070 375"/>
  <path class="arrow" d="M 1070 445 C 940 525, 660 525, 530 445"/>
  <text class="small" x="800" y="330" text-anchor="middle">one counterpart — not an agent conference</text>

  <rect class="accent" x="545" y="355" rx="32" ry="32" width="510" height="185"/>
  <text class="h1" x="800" y="410" text-anchor="middle">Learning Design</text>

<text class="body" x="800" y="452" text-anchor="middle">
<tspan x="800" dy="0">shared thinking model</tspan>
<tspan x="800" dy="30">intention · learning journey · decisions · open questions</tspan>
</text>

  <path class="arrow" d="M 800 540 L 800 665"/>
  <rect class="card" x="500" y="650" rx="28" ry="28" width="600" height="130"/>
  <text class="h1" x="800" y="700" text-anchor="middle">Orchestration</text>

<text class="body" x="800" y="737" text-anchor="middle">
<tspan x="800" dy="0">When to reflect? When to remember? When to produce?</tspan>
</text>

  <rect class="card" x="110" y="830" rx="36" ry="36" width="1380" height="205"/>
  <text class="label" x="800" y="875" text-anchor="middle">BACKSTAGE: invisible services</text>


  <rect class="service" x="165" y="905" rx="24" ry="24" width="295" height="100"/>
  <text class="h2" x="312" y="945" text-anchor="middle">Memory</text>
  <text class="small" x="312" y="975" text-anchor="middle">experience · patterns · reflection</text>


  <rect class="service" x="485" y="905" rx="24" ry="24" width="295" height="100"/>
  <text class="h2" x="632" y="945" text-anchor="middle">Knowledge</text>
  <text class="small" x="632" y="975" text-anchor="middle">curricula · research · OER</text>


  <rect class="service" x="820" y="905" rx="24" ry="24" width="295" height="100"/>
  <text class="h2" x="967" y="945" text-anchor="middle">Workshop</text>
  <text class="small" x="967" y="975" text-anchor="middle">materials · research · drafts</text>


  <rect class="service" x="1140" y="905" rx="24" ry="24" width="295" height="100"/>
  <text class="h2" x="1287" y="945" text-anchor="middle">Renderer</text>
  <text class="small" x="1287" y="975" text-anchor="middle">LiaScript · RELIPULS · Moodle</text>


  <path class="arrow" d="M 800 780 C 800 820, 312 835, 312 895"/>
  <path class="arrow" d="M 800 780 C 800 825, 632 840, 632 895"/>
  <path class="arrow" d="M 800 780 C 800 825, 967 840, 967 895"/>
  <path class="arrow" d="M 800 780 C 800 820, 1287 835, 1287 895"/>

  <path class="line" d="M 1420 950 C 1530 730, 1440 420, 1320 295"/>
  <text class="small" x="1442" y="760" transform="rotate(-76 1442 760)" text-anchor="middle">everything returns to the Learning Design</text>

  <text class="small" x="800" y="1068" text-anchor="middle">Principle: AI does not think in place of the teacher. It helps maintain the pedagogical thinking space.</text>
</svg>
()


```text
Teacher
      │
      ▼
Critical Friend
      │
      ▼
Learning Design
      │
      ▼
ORCHESTRATION
      │
      ▼
core/
│
├── MEMORY
├── KNOWLEDGE
├── WORKER
└── RENDERER
```

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
