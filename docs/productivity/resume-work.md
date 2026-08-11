## What it does

`resume-work` reconciles a checkpoint or handoff against current Git, files, issues, design contracts, and test evidence before work continues. It treats saved prose as a claim, never as unquestioned memory.

## When to reach for it

Type `/resume-work`, or the agent reaches for it after compaction, interruption, a host change, or a portable handoff. If there is no saved state, it reconstructs only from durable tracked artifacts and says what remains unknown.

## Prerequisites

Provide `.agents/state/continuity/current.md` in the same workspace or a portable handoff path. Access to the relevant issue tracker and test environment improves reconciliation.

## Confirmed, changed, missing, unverified

Every material claim receives one of those statuses. A changed HEAD, missing pointer, dirty-tree mismatch, or stale test result changes the next action rather than being smoothed over.

Schema validity alone is not readiness. Changed machine state, validation tied to another commit, missing pointers, or an old checkpoint keeps the resume disposition unresolved until the discrepancy is checked.

## Common questions

**Does resume clean the tree back to the checkpoint?**

No. It preserves current work and reports divergence. Destructive restoration is a separate user decision.

**Does it rerun the entire test suite?**

Not automatically. It reruns the smallest relevant safe validation when the old result is no longer trustworthy and reports the rest as unverified.

## It's working if

- The first action follows current repository state, not stale checkpoint wording.
- Missing local-only pointers are called out explicitly.
- The resumed session can name the live objective, risks, and next action without reading a transcript.

## Where it fits

This is the arrival half of [checkpoint-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/checkpoint-work/SKILL.md) and [handoff](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/handoff/SKILL.md). It is a reach-for-it-anytime continuity skill; [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md) maps it to phase boundaries.
