## What it does

`frontend-review` checks rendered UI for hierarchy, responsive behavior, interaction states, keyboard operation, accessibility, content clarity, browser failures, and regressions. It reports unavailable tooling as unverified instead of converting absence of evidence into a pass.

## When to reach for it

Type `/frontend-review`, or the agent reaches for it on a frontend branch, diff, or pull request. `code-review` invokes it as a separate lane whenever UI changed.

## Prerequisites

A runnable application and representative data give the strongest result. A browser, viewport emulation, accessibility scanner, and visual baseline increase coverage but are never silently assumed.

## Evidence and disposition

- **Findings** carry severity, route, state, viewport, evidence, violated requirement, and a focused fix.
- **Verified** lists checks actually exercised and how.
- **Unverified** lists every check blocked by the environment or missing tooling.
- **Disposition** is `Blocked`, `Incomplete`, or `Ready`. A blocking failure must be fixed and rerun; required unverified checks make the review incomplete, not approved.

## Common questions

**Is this a taste review?**

No. Subjective suggestions stay distinct from contract violations, accessibility failures, and reproducible browser defects.

**Can source inspection replace opening the page?**

It can find some semantic problems, but it cannot verify hierarchy, wrapping, focus behavior, or responsive layout. Those checks remain unverified without rendering.

## It's working if

- A reviewer can reproduce each finding at a named route, state, and viewport.
- Keyboard and responsive behavior receive explicit evidence.
- Missing automation is visible in the final approval decision.

## Where it fits

This is the rendered-product lane beside Standards and Spec in [code-review](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/code-review/SKILL.md), following [frontend-build](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/frontend-build/SKILL.md). The [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md) router situates the rest.
