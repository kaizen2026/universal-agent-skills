## What it does

`checkpoint-work` saves a versioned, redacted Work-Item Capsule under `.agents/state/continuity/work-items/<work-item-id>/semantic.md`. It records the objective, success criteria, phase, binding decisions, validation, blockers, one next action, and authority pointers for one issue or explicit objective.

The capsule uses deterministic identity resolution and never chooses a workspace-wide latest checkpoint.

| Available identity | Result |
| --- | --- |
| Explicit Work Item ID | Use that capsule |
| Current session binding | Use the bound capsule |
| Neither | Report no active work item |

## When to reach for it

Type `/checkpoint-work`, or the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) reaches for it after a consequential decision, at a phase boundary, before [compaction](https://www.aihero.dev/ai-coding-dictionary/compaction), or before interruption. Activate the Work Item ID and bind the current [harness](https://www.aihero.dev/ai-coding-dictionary/harness) session before its first checkpoint. It should not run after every message.

## Prerequisites

Use it inside a workspace where Git status and artifact pointers can be reconciled. The state directory is local and gitignored by default. The installed runtime provides `activate` and `checkpoint` commands for the manual path.

## One next action

The capsule's sharpest field is one concrete next action. Combined with exact validation and authority pointers, it lets a later continuity epoch start from evidence rather than reconstructing chat.

Every successful semantic write advances the capsule revision and records update provenance. Automatic lifecycle hooks cannot infer objective, decisions, or test meaning; the phase-aware capsule remains the semantic authority.

## Common questions

**Why not just save the whole conversation?**

Transcripts are noisy, sensitive, host-specific, and often unstable. A checkpoint points to primary artifacts and records only the decisions needed to continue.

**Will it survive a cloud job?**

Only if the environment preserves local state. A gitignored checkpoint disappears with an ephemeral worker, so tracked issues, specs, ADRs, contracts, and commits remain the team source of truth.

**What happened to `current.md`?**

Existing workspace-wide checkpoints remain readable as explicit legacy evidence. They are never selected automatically or treated as an active Work-Item Capsule.

## It's working if

- The capsule path names the intended Work Item ID and its revision increases after each update.
- Validation entries name commands and results, not "tests pass" in the abstract.
- Resume by session binding returns the same Work Item ID, while an unbound session returns no active work item.
- No credential or personal data appears in capsule or legacy evidence files.

## Where it fits

This is the local continuity step before host compaction or interruption. [resume-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/resume-work/SKILL.md) verifies it on arrival, while [handoff](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/handoff/SKILL.md) exports it when state must travel. The [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md) router places phase boundaries in the broader flow.
