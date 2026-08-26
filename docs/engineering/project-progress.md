## What it does

`project-progress` turns the maps, plans, designs, specifications, code, tests, and operational records in one repository into a standalone interactive HTML steering view. It shows where the project really is, the shortest route to the next useful outcome, alternative routes that can wait, and the evidence behind every claim.

It never computes one overall completion percentage. Its **evidence ladder** keeps six different kinds of progress separate: defined, designed, prototyped, implemented, validated, and operational. Closing most of a planning map can therefore look strong in the first column while the implementation columns remain honestly empty.

## When to reach for it

Invoke it explicitly with `/project-progress` in Claude Code or `$project-progress` in Codex — the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) won't reach for it on its own.

Reach for it when the project has enough written history that deciding what to do next requires rereading several maps, specifications, or design records. It is also useful at phase boundaries, before a planning meeting, and after parallel work may have made an older status summary stale.

| What you need | What to use |
| --- | --- |
| Decide a large foggy effort | [wayfinder](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/wayfinder/SKILL.md) |
| Turn existing evidence into a steering dashboard | `/project-progress` (Claude Code) or `$project-progress` (Codex) |
| Explore and approve a visual direction for the product itself | [frontend-design](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/frontend-design/SKILL.md) |
| Build a planned feature | [implement](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/implement/SKILL.md) |

## Prerequisites

The skill needs a writable repository and at least one trustworthy project source: a tracker, map, plan, specification, design contract, implementation, test record, or operational record. It writes `docs/project-progress.json` and `docs/project-progress.html` by default. The HTML is standalone and opens locally without a server or network connection.

## The evidence ladder

The ladder answers a common steering mistake: “we have settled most decisions, so are we nearly finished?” Each workstream receives six independent states.

| Stage | The question it answers |
| --- | --- |
| Defined | Do we know what this is, who owns it, and what rules it follows? |
| Designed | Is there an approved experience or technical contract? |
| Prototyped | Did a throwaway artifact answer a named uncertainty? |
| Implemented | Does production-intended code exist through the real authority boundaries? |
| Validated | Does current end-to-end evidence pass against those boundaries? |
| Operational | Is the current version deployed, owned, observable, and recoverable? |

The dashboard still shows mechanically useful tracker counts, including claimed work and the unclaimed frontier. It labels their denominator and keeps them away from delivery maturity, which is why the result stays useful when a project has several maps or mixes planning with implementation. Each route also names the skills that fit the next phase and the exact topics still worth discussing, without invoking those skills or changing the plan on the user's behalf.

## One portable skill, one project-owned view

The skill carries the generic evidence rules, model schema, zero-dependency renderer, and refresh workflow. The repository carries only its own small semantic model and generated HTML. That split makes the skill reusable across unrelated domains while keeping each dashboard in the project's own vocabulary.

Local Markdown maps can be counted directly from `Status`, `Assignee`, and `Blocked by` fields. Remote or differently structured trackers use a dated, verified snapshot instead. Both appear in the same evidence view without pretending that the renderer understands a format it has not parsed.

## Common questions

**Does this build a prototype of my application?**

No. The generated HTML is a project steering artifact, not the product. The skill does not implement features, resolve planning tickets, or change infrastructure. A product prototype may appear as linked evidence, clearly labelled with what it proves and what it does not.

**If 48 of 54 map tickets are closed, will it say the project is 89% built?**

No. It may show “48 of 54 tracked items closed,” because that denominator is factual. Implementation, validation, and operations remain separate workstream stages and can still read “not started.”

**Does it only work with Wayfinder maps?**

No. Wayfinder's local Markdown format gets extra live parsing because its status, assignee, and blocker fields are explicit. Ordinary plans, ADRs, specifications, designs, code, tests, and deployment evidence work too; the agent reconciles them into the generic model.

**Can I use it with GitHub Issues, Jira, Linear, or another remote tracker?**

Yes. The agent records a dated snapshot of the remote facts it actually verified and links back to the tracker. It does not manufacture live synchronization when no tracker integration exists.

**Will the HTML work outside the coding tool?**

Yes. The renderer emits one offline file with its CSS and interaction script embedded. It loads no CDN library, font, analytics, or remote data.

## It's working if

- You can tell in seconds whether the project is mostly decided, mostly designed, actually implemented, testable, or operational.
- A high closed-ticket count never disguises empty implementation or validation stages.
- Every positive maturity claim has a nearby link to evidence.
- Claimed work, the unclaimed frontier, and blocked work are visible without reading every ticket.
- One route is recommended for the user's current outcome, while important alternative routes remain visible with their boundaries.
- Invoking the skill again updates the same model and HTML instead of producing another status document.

## Where it fits

`project-progress` is a **reach-for-it-anytime standalone steering view**. It can visualize the output of [wayfinder](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/wayfinder/SKILL.md), but it neither replaces the map nor moves its frontier. It complements [checkpoint-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/checkpoint-work/SKILL.md): a checkpoint preserves one session's continuation state, while this dashboard reconciles the whole project's visible evidence for human prioritization.

For the route over the complete skill set, use [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md).
