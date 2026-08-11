---
name: checkpoint-work
description: Save a versioned, redacted checkpoint for work that must survive compaction, interruption, or another session. Use at meaningful phase boundaries, after consequential decisions, before compaction, or before stopping long-running work.
---

# Checkpoint Work

Create a concise, evidence-backed continuation point at `.agents/state/continuity/current.md`. A checkpoint records project state; it is not a transcript or a substitute for tracked specs, issues, ADRs, design contracts, or commits.

## Checkpoint only at a boundary

Write a checkpoint after a consequential decision, at a meaningful phase boundary, before compaction, or before interruption. Do not rewrite it after every message. If no durable state changed, leave it alone.

Read [SCHEMA.md](references/SCHEMA.md). Inspect the current objective, success criteria, plan, relevant artifacts, Git HEAD, dirty working tree, and exact validation results. Resolve pointers to existing source artifacts instead of copying their contents.

## Write safely

Archive the previous `current.md` into `.agents/state/continuity/history/` before replacing it. Use schema version 1 and an ISO-8601 UTC timestamp. Record one concrete next action that a fresh agent can execute without reconstructing the conversation.

Redact credentials, tokens, cookies, connection strings, private keys, personal data, and sensitive command output. Never persist raw transcripts by default. Summarize a secret-dependent result without the secret.

If `.agents/universal-agent-skills/runtime/cli.mjs` exists, use its `checkpoint` command to archive, add Git evidence, redact, and validate the document. Otherwise create the same schema directly. Ensure the configured continuity state root (default `.agents/state/continuity/`) is ignored by Git unless the user explicitly chose tracked continuity state.

Lifecycle hooks cannot infer the live objective, decisions, test meaning, or next action. With an existing semantic checkpoint they may record a separate observation while preserving the checkpoint's original timestamp, Git, and validation provenance; without one they write clearly labelled placeholders. Replace that automatic observation with a phase-aware checkpoint when the semantic state is available.

Report the checkpoint path, timestamp, validation evidence captured, and any information deliberately omitted for safety.
