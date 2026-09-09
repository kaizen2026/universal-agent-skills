## What it does

`ask-matt` is the retained upstream router over this collection. It returns a flow, not merely a skill name, and includes this derivative's frontend design contract, continuity boundaries, and advisor-to-worker workflow.

## When to reach for it

You invoke this by typing `/ask-matt` when you know the situation but not which workflow fits. The [agent](https://www.aihero.dev/ai-coding-dictionary/agent) will not invoke the router on its own.

## Prerequisites

Tracker-dependent routes assume [setup-universal-agent-skills](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/setup-universal-agent-skills/SKILL.md) has configured the repository.

## The main routes

| Situation | Route |
| --- | --- |
| Well-scoped feature | grilling → optional design/prototype → implement → review |
| Large foggy effort | wayfinder → spec → tickets → implement |
| Visual decision | resolved prerequisites → frontend-design → frontend-build → frontend-review |
| Logic decision | prototype → record verdict → implementation |
| Long session boundary | activate Work Item ID → checkpoint-work → host [compaction](https://www.aihero.dev/ai-coding-dictionary/compaction) → automatic bound-capsule reconciliation in configured Codex, otherwise resume-work |
| Work must travel | activate Work Item ID → checkpoint-work → handoff → resume-work |

## Common questions

**Which skill keeps the coder's task checklist visible?**

[implement](./implement.md) creates the task's execution checklist, uses native Task/plan tools when available, and saves progress at step changes. It falls back to shared progress and short chat updates when the host has no native view. [prompt-engineer](./prompt-engineer.md) reads another worker's progress; [project-progress](./project-progress.md) remains the broader project dashboard. No special numbered prompt or automatic settings change is required.

**Do I have to keep asking for a structured prompt for another coding session?**

No. Use [prompt-engineer](./prompt-engineer.md) for that workflow, including after a normal implementation has already finished. It finds the matching result and source decisions, retains the advisory role through follow-ups, and prepares the next scoped prompt. Implementation now publishes the report without an adviser-first assignment. A requested bounded wait checks files repeatedly for up to five minutes without model-driven polling, then stops. Automatic repeat windows, idle-chat wake-up, and prompt dispatch are not connected.

**Why keep the upstream name in a universal derivative?**

The router is upstream-derived and widely recognized. Keeping the name preserves compatibility and attribution; the primary setup and product installation are rebranded.

**Can the router force compaction?**

No. It can route to checkpointing and report host capability. Actual compaction belongs to the host and its opted-in adapter.

**What does the Codex adapter automate?**

It records the pre/post lifecycle once, reconciles only the work item bound to that Codex session, and injects one bounded capsule after compaction. It does not invent a binding or silently select another work item.

**What if two agents checkpoint the same work item?**

The first matching revision advances the capsule. A stale contribution becomes a merge proposal, so the agents can reconcile it without losing newer state.

## It's working if

- The route names where the human must decide and where evidence is recorded.
- Frontend work does not jump from a foggy idea directly into production code.
- Long work names activation, checkpoint, compaction, and reconciliation as separate acts.

## Where it fits

This is the user-invoked map over the whole set. It is a compatibility-preserved router, not the branded installation entry; that role belongs to [setup-universal-agent-skills](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/setup-universal-agent-skills/SKILL.md).
