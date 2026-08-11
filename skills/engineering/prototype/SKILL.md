---
name: prototype
description: Build a throwaway prototype to answer a state-model or logic question. Use when the user wants to sanity-check whether behavior feels right; visual-direction questions are delegated to frontend-design.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Route the question

Identify which question is being answered — from the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). Build a single shareable HTML file — free-play buttons plus tabbed guided walkthroughs — that pushes the state machine through cases that are hard to reason about on paper, and that a non-developer can drive.
- **"What should this look like?"** → invoke `/frontend-design`. It owns the richer visual workflow: prerequisite gating, three runnable directions, screenshots, user grilling, and an approved `docs/design/<feature>/DESIGN.md` contract. If its product prerequisites are unresolved, route them back to `/wayfinder` or `/grilling`; do not build UI variants here.

These are two destinations, not two prototype branches: this skill builds only logic/state prototypes, while `/frontend-design` owns visual exploration. If the question is genuinely ambiguous and the user is not reachable, build a logic prototype only when the prompt clearly asks about state or behavior. Otherwise stop and route the missing decision through `/wayfinder` or `/grilling`; never resurrect a local UI-prototype path.

## Rules for logic prototypes

1. **Throwaway from day one, and clearly marked as such.** Locate the prototype code close to where it will actually be used so context is obvious, but name it so a casual reader can see it is a prototype, not production.
2. **Trivial to run.** Produce a single HTML file the user can double-click, with no setup to remember.
3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is _checking_, not something it should depend on. If the question explicitly involves a database, hit a scratch DB or a local file with a clear "PROTOTYPE — wipe me" name.
4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
5. **Surface the state.** After every action, print or render the full relevant state so the user can see what changed.
6. **Capture it when done.** Fold any validated decision into the real code, then capture the prototype itself as a **primary source**: commit it to a throwaway branch, out of main, and leave a context pointer to that branch on the implementation issue. Capture the answer too — the verdict and the question it settled — in the issue or a commit. The main branch keeps only the validated decision.
