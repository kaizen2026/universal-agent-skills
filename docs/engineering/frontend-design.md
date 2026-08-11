## What it does

`frontend-design` turns a resolved product problem into a visual decision: three runnable directions, rendered evidence, a live reaction loop, and an approved design contract. It refuses to invent the audience, flow, content, platform, or constraints just to start drawing.

## When to reach for it

Type `/frontend-design`, or the agent reaches for it when a page, component, dashboard, or product surface needs a visual direction and its product prerequisites are already settled. If the problem itself is still foggy, use [wayfinder](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/wayfinder/SKILL.md) or [grilling](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/grilling/SKILL.md) first.

## Prerequisites

The skill needs explicit answers for intent, audience, flows, representative content, platform, accessibility and delivery constraints, and the evidence host. Existing products use the repository's runnable frontend. A true greenfield repository may use an explicitly approved isolated HTML/CSS/JavaScript scaffold without choosing production architecture. Browser or user-supplied screenshots are required before approval.

## The contract is the decision

The variants are temporary evidence. The durable result is `docs/design/<feature>/DESIGN.md` plus `evidence/`, covering tokens, typography, layout behavior, component anatomy, states, responsive rules, interaction, accessibility, non-goals, and testable acceptance criteria.

## Common questions

**Can it just pick the best-looking option?**

No. The agent can expose tradeoffs and consistency problems, but the human supplies product preference and explicit approval.

**What if screenshot tooling is missing?**

The skill reports the limitation and gives manual capture steps. It does not label an unseen direction approved.

## It's working if

- The three directions differ in hierarchy and affordance, not merely colour.
- Every approved rule is written in a tracked contract rather than remembered from chat.
- A fresh implementer can tell exactly what to build and how to verify it.

## Where it fits

This is the visual-decision chain step between [wayfinder](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/wayfinder/SKILL.md) or grilling and [frontend-build](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/frontend-build/SKILL.md). The retained [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md) router maps the full flow.
