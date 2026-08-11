## What it does

`checkpoint-work` saves a versioned, redacted continuation point under `.agents/state/continuity/`. It records project truth at meaningful boundaries and deliberately avoids raw transcripts or copies of artifacts that already have a durable home.

## When to reach for it

Type `/checkpoint-work`, or the agent reaches for it after a consequential decision, at a phase boundary, before compaction, or before interruption. It should not run after every message.

## Prerequisites

Use it inside a workspace where Git status and artifact pointers can be reconciled. The state directory is local and gitignored by default.

## One next action

The checkpoint's sharpest field is one concrete next action. Combined with exact validation and a dirty-tree inventory, it lets a fresh session start from evidence rather than reconstructing chat.

Automatic lifecycle hooks preserve the provenance of an existing semantic checkpoint and add only an observation. They cannot infer objective, decisions, or test meaning; when no semantic checkpoint exists, their placeholders say so.

## Common questions

**Why not just save the whole conversation?**

Transcripts are noisy, sensitive, host-specific, and often unstable. A checkpoint points to primary artifacts and records only the decisions needed to continue.

**Will it survive a cloud job?**

Only if the environment preserves local state. A gitignored checkpoint disappears with an ephemeral worker, so tracked issues, specs, ADRs, contracts, and commits remain the team source of truth.

## It's working if

- The dirty inventory matches `git status` exactly.
- Validation entries name commands and results, not "tests pass" in the abstract.
- No credential or personal data appears in current or history files.

## Where it fits

This is the local continuity step before host compaction or interruption. [resume-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/resume-work/SKILL.md) verifies it on arrival, while [handoff](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/handoff/SKILL.md) exports it when state must travel. The [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md) router places phase boundaries in the broader flow.
