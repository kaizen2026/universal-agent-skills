## What it does

`frontend-build` implements an approved design contract as production UI through the repository's actual framework, design system, data patterns, and tests. It does not redesign while coding; unresolved visual decisions return to `frontend-design`.

## When to reach for it

Type `/frontend-build`, or the agent reaches for it when an implementation issue is governed by an approved `docs/design/<feature>/DESIGN.md`. For UI work without a contract that still needs visual decisions, use [frontend-design](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/frontend-design/SKILL.md).

## Prerequisites

The design contract must say `Status: Approved`, link its evidence, and name observable acceptance criteria. The repository's normal build and test commands must be discoverable.

## Contract outside, architecture inside

The contract owns visual intent. Repository conventions own component boundaries, data access, state, testing, and design-system reuse. This separation prevents a prototype's throwaway structure from leaking into production.

## Common questions

**Can implementation improve the approved design?**

It can fix an obvious defect required by accessibility or the existing design system, but a change in direction goes back through the design contract so the decision remains visible.

## It's working if

- Prototype switches and temporary routes do not ship accidentally.
- Loading, empty, error, disabled, validation, and responsive states behave as contracted.
- Exact test and render evidence accompanies completion.

## Where it fits

This is the production chain step from [frontend-design](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/frontend-design/SKILL.md) into [code-review](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/code-review/SKILL.md), normally orchestrated by [implement](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/implement/SKILL.md). Build performs a preliminary self-check; code-review owns the final independent [frontend-review](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/frontend-review/SKILL.md) lane exactly once. The [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md) router shows the larger engineering flow.
