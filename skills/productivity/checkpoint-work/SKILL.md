---
name: checkpoint-work
description: Save a versioned, redacted checkpoint for work that must survive compaction, interruption, or another session. Use at meaningful phase boundaries, after consequential decisions, before compaction, or before stopping long-running work.
---

# Checkpoint Work

Create or refresh the concise, evidence-backed Work-Item Capsule at `.agents/state/continuity/work-items/<work-item-id>/semantic.md`. A capsule records the semantic state of one issue or explicit objective; it is not a transcript or a substitute for tracked specs, issues, ADRs, design contracts, or commits.

## Checkpoint only at a boundary

Write a checkpoint after a consequential decision, at a meaningful phase boundary, before compaction, or before interruption. Do not rewrite it after every message. If no durable state changed, leave it alone.

Read [SCHEMA.md](references/SCHEMA.md). Identify the Work Item ID and current harness session. Activate and bind them before the first checkpoint. Inspect the current objective, success criteria, plan, relevant artifacts, Git HEAD, blockers, and exact validation results. Resolve pointers to existing source artifacts instead of copying their contents.

## Write safely

Read the current capsule revision immediately before writing and send it as the expected revision. A matching compare-and-swap update advances the revision and uses an ISO-8601 UTC timestamp. A stale update must leave the capsule unchanged and become a bounded merge proposal under the work item's `proposals/` directory, with its base revision and harness/session provenance. Reconcile that proposal against the current capsule before retrying with a new expected revision.

The runtime serializes the revision check and atomic replacement with a portable directory lock. It waits up to five seconds by default. It never steals a timed-out or abandoned lock: inspect `.update.lock/owner.json`, verify that the owning process is no longer running, and only then remove the work item's `.update.lock` directory manually. Record one concrete next action that a fresh agent can execute without reconstructing the conversation. Existing workspace-wide `current.md` and `history/` files are legacy evidence and must not be selected as the active work item. If one of them still holds the objective you are continuing, adopt it deliberately with `import-legacy-checkpoint --work-item <id> --expected-revision <n> [--input <path>]`: the import is tagged with its source and provenance, appends to any binding decisions already in the capsule, and becomes a merge proposal rather than an overwrite if the capsule has moved on. Never bulk-migrate old checkpoints; leave the originals in place as evidence.

Redact credentials, tokens, cookies, connection strings, private keys, personal data, and sensitive command output. Never persist raw transcripts by default. Summarize a secret-dependent result without the secret.

If `.agents/universal-agent-skills/runtime/cli.mjs` exists, use its `activate` command once to create or join the Work Item ID and bind the session, then use `checkpoint --expected-revision <n>` to add provenance, redact, and validate the capsule. Record the work state with `--status <in-progress|blocked|ready-for-review|complete>` when it changes; the status lives in the capsule frontmatter and travels with a portable handoff. A stale revision exits without replacing the capsule and reports the proposal path. An explicit `--work-item` outranks a session binding; without either, stop rather than selecting a workspace-wide checkpoint. Ensure the configured continuity state root (default `.agents/state/continuity/`) is ignored by Git unless the user explicitly chose tracked continuity state.

Lifecycle hooks cannot infer the live objective, decisions, test meaning, or next action. The phase-aware manual checkpoint remains the semantic authority for the active Work Item ID.

For adviser/worker work, use existing binding decisions and authority pointers to retain the current role, task source, selected report path/assignment, and last reviewed digest. Do not duplicate the report or add a parallel memory schema. Keep an adviser's recommended worker action distinct from permission for the resumed adviser to perform it.

When an implementation checklist exists, point to that worker report and its current stable step ID. Keep the capsule's current phase and next action consistent at checkpoint boundaries without copying the entire step list or recording native UI task IDs as portable session identity.

Report the checkpoint path, timestamp, validation evidence captured, and any information deliberately omitted for safety.
