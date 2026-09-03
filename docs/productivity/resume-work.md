## What it does

`resume-work` resolves and reconciles a Work-Item Capsule against current Git, files, issues, design contracts, and test evidence before work continues. It treats saved prose as a claim, never as unquestioned memory.

The capsule uses deterministic identity resolution, and a workspace-wide latest checkpoint is never a fallback.

| Available identity | Result |
| --- | --- |
| Explicit Work Item ID | Resume that capsule |
| Current [harness](https://www.aihero.dev/ai-coding-dictionary/harness) session binding | Resume the bound capsule |
| Neither | Report no active work item |

## When to reach for it

Type `/resume-work`, or the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) reaches for it after [compaction](https://www.aihero.dev/ai-coding-dictionary/compaction), interruption, a host change, or a portable handoff. Supply a Work Item ID explicitly or resume from the current session binding. If neither exists, it reconstructs only from durable tracked artifacts and says what remains unknown.

## Prerequisites

Provide a capsule under `.agents/state/continuity/work-items/`, an active session binding, or a portable handoff path. Access to the relevant issue tracker and test environment improves reconciliation.

## Confirmed, changed, missing, unverified

Every material claim receives one of those statuses. A changed HEAD, missing pointer, dirty-tree mismatch, or stale test result changes the next action rather than being smoothed over.

Schema validity alone is not readiness. Changed machine state, validation tied to another commit, missing pointers, or an old checkpoint keeps the resume disposition unresolved until the discrepancy is checked.

## Common questions

**Does resume clean the tree back to the checkpoint?**

No. It preserves current work and reports divergence. Destructive restoration is a separate user decision.

**Does it rerun the entire test suite?**

Not automatically. It reruns the smallest relevant safe validation when the old result is no longer trustworthy and reports the rest as unverified.

**Can an old `current.md` resume itself?**

No. It can be inspected through an explicit input path as inactive legacy evidence, but it cannot activate an objective or be injected into an unbound session.

## It's working if

- The first action follows current repository state, not stale checkpoint wording.
- Missing local-only pointers are called out explicitly.
- The resumed session can name the live objective, risks, and next action without reading a transcript.

## Where it fits

This is the arrival half of [checkpoint-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/checkpoint-work/SKILL.md) and [handoff](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/handoff/SKILL.md). It is a reach-for-it-anytime continuity skill; [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md) maps it to phase boundaries.
