---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec, ticket, or settled conversation. Resolve its exact identity/title and source before coding; if an ambiguous number could refer to different tasks, ask one identifying question rather than guessing.

Before changing implementation files, record the current `HEAD` as the review fixed point and inventory pre-existing dirty changes. An unborn branch or unavailable Git evidence is `unknown`, not an invented commit. Preserve user changes and explicit restrictions, including no-commit/no-push instructions.

Read [the exchange contract](references/EXCHANGE.md) and use this skill's bundled `scripts/exchange.mjs start` to record the task/source and starting evidence. Keep its returned report path, IDs, and digest. This is ordinary implementation closeout preparation: no adviser-created assignment or separate setup is required. Use only known session identities; generate protocol IDs with the helper, not a user questionnaire. If a shared root was explicitly selected for separate worktrees, use it. If reporting cannot run or local state writes are forbidden, retain a compact chat fallback and say shared publication is unavailable.

## Keep task progress visible

Create a concise execution checklist from the authorized task before implementation, even when the user supplies only a normal prompt or spec rather than numbered Markdown instructions. Use meaningful steps sized to the work; a small task needs only a small list. Do not add shipping, merging, or unrelated work merely to fill the checklist.

Read [TASK-PROGRESS.md](references/TASK-PROGRESS.md). Use the available native task-list tool, especially Claude Code's Task tools, rather than merely printing checkboxes in chat. Persist the same steps in this worker's shared report using `progress`. Native display is a view of those execution claims, not a separate source of task authority. If native tools are absent, keep shared progress and a brief Done / Now / Next / Blocked chat fallback; never invent tools, alter settings, or block implementation solely for the display.

Update at meaningful step transitions, not every command or timer tick. Maintain one current high-level step, record blockers honestly, and keep completed work visible. Before resuming a step, reconcile the task/source and saved progress with actual files and current instructions. Respect any explicit source re-read requirement; do not copy whole task documents into every update. At completion, reconcile the checklist before publishing the result; an unfinished required step is not complete just because the model's reply ended.

## Implement and verify

Classify frontend work before changing it:

- If the issue/spec references an approved `docs/design/<feature>/DESIGN.md`, or an approved contract clearly governs the feature, invoke `/frontend-build` and treat that contract as the visual source of truth.
- If the work introduces or changes a visual direction and no approved contract resolves it, stop only that frontend slice and route the unresolved decision to `/frontend-design`.
- If the task is a prescribed maintenance change that introduces no visual decision — for example a copy correction, bug fix, or specified reuse of an existing component — implement it through the existing design system. A new contract is not required.

Never infer that every frontend diff needs a design contract, and never invent an unresolved direction during implementation.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, invoke `/code-review` with the recorded fixed point. It must review committed, staged, unstaged, and untracked work from this run. Frontend changes receive its independent `/frontend-review` lane in addition to Standards and Spec. Resolve blocking findings and rerun affected checks before committing; preserve genuinely unavailable checks as explicit `Unverified` items.

Commit your scoped work to the current branch only when consistent with the user's instructions. Do not commit pre-existing unrelated changes or push without authority.

At completion, or when blocked, publish the compact result using the exchange contract: task/source, actual changed paths, exact checks and outcomes, review findings/resolution or artifact pointers, blockers, and current revision/dirty evidence. Preserve unavailable checks as `unverified`; do not bind earlier checks to a new commit merely by publishing now. Use `ready-for-review` for a finished implementation. Reporting neither closes the ticket nor launches an adviser. In the final reply name the report path, or explain the reporting failure and provide the compact fallback. Do not require the user to ask for a report.
