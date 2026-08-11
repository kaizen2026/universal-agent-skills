---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Before changing anything, record the current `HEAD` as the review fixed point.

Classify frontend work before changing it:

- If the issue/spec references an approved `docs/design/<feature>/DESIGN.md`, or an approved contract clearly governs the feature, invoke `/frontend-build` and treat that contract as the visual source of truth.
- If the work introduces or changes a visual direction and no approved contract resolves it, stop only that frontend slice and route the unresolved decision to `/frontend-design`.
- If the task is a prescribed maintenance change that introduces no visual decision — for example a copy correction, bug fix, or specified reuse of an existing component — implement it through the existing design system. A new contract is not required.

Never infer that every frontend diff needs a design contract, and never invent an unresolved direction during implementation.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, invoke `/code-review` with the recorded fixed point. It must review committed, staged, unstaged, and untracked work from this run. Frontend changes receive its independent `/frontend-review` lane in addition to Standards and Spec. Resolve blocking findings and rerun affected checks before committing; preserve genuinely unavailable checks as explicit `Unverified` items.

Commit your work to the current branch.
