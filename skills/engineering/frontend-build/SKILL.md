---
name: frontend-build
description: Implement production frontend UI from an approved feature design contract. Use when a frontend ticket, spec, or implementation task is governed by an approved visual direction and must be built with the repository's framework, components, tokens, data patterns, and tests.
---

# Frontend Build

Implement an approved design contract as production code. The contract governs visual intent; the repository governs architecture and engineering conventions.

## Verify the input

Locate the governing `docs/design/<feature>/DESIGN.md` and require `Status: Approved`. Trace it to the implementation issue or spec and inspect every linked evidence file. If the contract is absent, draft, stale against a changed product requirement, or missing a state needed by the ticket, stop and route the visual decision to `/frontend-design`. Never infer a new visual direction during implementation.

Read repository instructions and inspect the existing framework, routing, design system, tokens, components, data access, state management, internationalization, analytics, testing, and nearby production code. Identify the smallest production seam that owns the change.

## Implement through repository primitives

- Reuse existing components and tokens before adding new ones.
- Add a primitive only when the contract requires a reusable concept the design system lacks.
- Keep domain data and business state out of presentational components according to local conventions.
- Implement real loading, empty, error, disabled, permission, success, and validation states named by the contract.
- Preserve semantic HTML, keyboard operation, visible focus, accessible names, contrast, reduced-motion behavior, zoom, and text reflow requirements.
- Implement the contract's responsive behavior as layout rules, not screenshot-specific pixel patches.
- Use actual product copy or the repository's content source; do not hide unresolved content behind lorem ipsum.
- Remove prototype switches and temporary routes from production unless the contract explicitly accepts a staged flag.

Use `/tdd` at stable behavioral seams where possible. Run focused tests, typechecking, linting, and the app throughout the build. Compare the rendered result to the contract evidence at the declared viewports when browser tooling exists.

## Close the loop

Check every acceptance criterion in `DESIGN.md` and the originating issue. Run a preliminary implementation self-check and record exact commands, rendered comparisons, and results. Treat unavailable browser or accessibility tooling as unverified, not passed.

Return that evidence to `/code-review`, which owns the final independent `/frontend-review` lane and runs it exactly once alongside Standards and Spec. Do not invoke the final review from this build skill and do not feed Frontend findings into the other lanes. Blocking contract, keyboard, accessibility, or core-flow failures must be fixed and rechecked before the frontend is called complete; if a required capability remains unverified, describe the implementation as complete with validation outstanding rather than approved.
