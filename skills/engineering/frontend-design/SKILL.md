---
name: frontend-design
description: Explore, compare, and approve a frontend visual direction after product intent, audience, flows, constraints, content, and target platform are resolved. Use for page, component, dashboard, or product-surface design decisions that need runnable alternatives and a durable design contract before production implementation.
---

# Frontend Design

Turn a resolved product problem into a visual decision. Produce three runnable directions in the repository's real frontend stack, or an explicitly approved isolated host for a true greenfield repository, capture evidence, grill the user on concrete reactions, and record the approved direction at `docs/design/<feature>/DESIGN.md`.

Do not use this skill to discover the product. Never invent a missing audience, workflow, content model, platform, or constraint merely to begin drawing.

## Gate on prerequisites

Confirm all of these before writing visual code:

- Product intent and success criteria
- Primary audience and its priority tasks
- In-scope flows and navigation boundaries
- Real or representative content and data states
- Target platform, viewport classes, and input modes
- Brand, design-system, technical, accessibility, and delivery constraints
- A runnable frontend host, or for a true greenfield repository an explicitly approved isolated exploration scaffold and run command
- A stable feature slug for `docs/design/<feature>/`

Every prerequisite must be explicitly resolved; `None` or `Not applicable` with a reason is a resolution. If any answer is missing, stop and route it back to `/wayfinder` for a large or multi-session decision space, or `/grilling` for a focused live decision. State exactly what is missing, including omitted accessibility, design-system, delivery, host, or slug constraints. Do not fill it with assumptions.

## Inspect before exploring

Read the repository's agent instructions and inspect its framework, router, styling system, tokens, component library, icons, fonts, data-loading patterns, test commands, and nearby production screens. Reuse existing primitives and realistic data. Prefer an existing host route; create an obviously temporary prototype route only when no suitable host exists.

In a true greenfield repository with no frontend stack or task runner, use only the isolated exploration scaffold approved at the prerequisite gate, normally plain HTML/CSS/JavaScript under the feature's evidence tree. Do not choose or scaffold production architecture during design. Record the intended target platform and the fact that the production framework remains outside this decision.

Detect available browser, screenshot, and accessibility tooling. Record unavailable capabilities immediately. A visual direction is not approved until the user has seen rendered evidence; if automated screenshots are unavailable, provide exact manual capture steps and wait for user-supplied evidence.

## Build three directions

Require the configured `frontendDesignVariants` value to be exactly three in v1, and build all three. Make each direction meaningfully different in:

- Information hierarchy
- Page composition and spatial model
- Primary affordance and interaction path
- Density and content emphasis

Colour-only or typography-only variations do not count. Give each direction a name and a one-sentence thesis. Keep shared data and surrounding application chrome constant so the comparison isolates the design decision. Make every direction runnable through the repository's normal task runner and switchable on one route, normally with a `?variant=` parameter.

Treat this code as decision evidence, not production architecture. Avoid abstractions, persistence, and polish that do not improve the comparison.

## Capture and grill

Run the application and verify every direction renders without console errors. Capture at least one desktop and one mobile screenshot per direction under `docs/design/<feature>/evidence/`. Include relevant focus, empty, loading, error, or expanded states when they affect the decision.

Then invoke `/grilling`. Present the rendered directions without choosing for the user. Ask about reactions one decision at a time: what feels clear, what feels wrong, what should be combined, and why. The human supplies preference; the agent supplies implementation facts and consistency checks. Iterate only where the feedback exposes a meaningful question.

## Record the contract

Read [DESIGN-CONTRACT.md](references/DESIGN-CONTRACT.md) and create `docs/design/<feature>/DESIGN.md`. Link evidence with repository-relative paths. Record the chosen direction, rejected alternatives and reasons, principles, exact tokens, typography, layout, component anatomy, all interaction states, responsive rules, motion, accessibility requirements, non-goals, and testable implementation acceptance criteria.

Mark the contract `Status: Approved` only after the user explicitly selects or approves a direction. Otherwise leave it `Status: Draft` and state the unresolved decision. Keep the prototype isolated or on a throwaway branch as the repository workflow requires; the tracked contract and evidence are the durable inputs to `/frontend-build`.
