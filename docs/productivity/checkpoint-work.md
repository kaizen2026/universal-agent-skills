## What it does

`checkpoint-work` saves a versioned, redacted Work-Item Capsule under `.agents/state/continuity/work-items/<work-item-id>/semantic.md`. It records the objective, success criteria, phase, binding decisions, validation, blockers, one next action, and authority pointers for one issue or explicit objective.

The capsule uses deterministic identity resolution and never chooses a workspace-wide latest checkpoint. Each write is a compare-and-swap against the revision the writer read, so one collaborator cannot silently overwrite another.

| Available identity | Result |
| --- | --- |
| Explicit Work Item ID | Use that capsule |
| Current session binding | Use the bound capsule |
| Neither | Report no active work item |

## When to reach for it

Type `/checkpoint-work`, or the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) reaches for it after a consequential decision, at a phase boundary, before [compaction](https://www.aihero.dev/ai-coding-dictionary/compaction), or before interruption. Activate the Work Item ID and bind the current [harness](https://www.aihero.dev/ai-coding-dictionary/harness) session before its first checkpoint. It should not run after every message.

## Prerequisites

Use it inside a workspace where Git status and artifact pointers can be reconciled. The state directory is local and gitignored by default. The installed runtime provides `activate` and `checkpoint --expected-revision <n>` commands for the manual path.

## One next action

The capsule's sharpest field is one concrete next action. Combined with exact validation and authority pointers, it lets a later continuity epoch start from evidence rather than reconstructing chat.

For adviser/worker work, those existing fields also retain the role, task source, selected report, assignment, and last reviewed result digest. The capsule points to the result instead of copying it. A recommended coder action is not permission for a resumed adviser to do the coding.

Every successful semantic write advances the capsule revision and records update provenance. A stale contribution leaves the capsule unchanged and becomes a redacted, size-bounded proposal carrying its base revision and harness/session provenance. Automatic lifecycle hooks cannot infer objective, decisions, or test meaning; the phase-aware capsule remains the semantic authority.

## Concurrent updates

The runtime holds a cross-platform atomic lock while it checks the revision and replaces the capsule. It never steals a timed-out lock, so recovery cannot silently override a live collaborator.

Stale contributions remain available as bounded, redacted proposals. Reconcile the current capsule and proposal before trying the update again.

## Common questions

**Why not just save the whole conversation?**

Transcripts are noisy, sensitive, host-specific, and often unstable. A checkpoint points to primary artifacts and records only the decisions needed to continue.

**Will it survive a cloud job?**

Only if the environment preserves local state. A gitignored checkpoint disappears with an ephemeral worker, so tracked issues, specs, ADRs, contracts, and commits remain the team source of truth.

**What happened to `current.md`?**

Existing workspace-wide checkpoints remain readable as explicit legacy evidence. They are never selected automatically or treated as an active Work-Item Capsule. If one still describes the work you are continuing, `import-legacy-checkpoint --work-item <id>` adopts it deliberately: the import is tagged with its source, keeps the capsule's existing binding decisions, and becomes a merge proposal if the capsule has newer work. The original file stays where it is.

**What if another agent checkpoints first?**

Your write exits as stale, and your contribution is preserved as a proposal rather than overwriting the newer capsule. Reconcile both versions before retrying.

## It's working if

- The capsule path names the intended Work Item ID and its revision increases after each update.
- Simultaneous writes produce one next revision plus merge proposals for stale contributions; no contribution disappears.
- Validation entries name commands and results, not "tests pass" in the abstract.
- Resume by session binding returns the same Work Item ID, while an unbound session returns no active work item.
- No credential or personal data appears in capsules, proposals, or legacy evidence files.

## Where it fits

This is the local continuity step before host compaction or interruption. [resume-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/resume-work/SKILL.md) verifies it on arrival, while [handoff](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/handoff/SKILL.md) exports it when state must travel. The [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md) router places phase boundaries in the broader flow.
