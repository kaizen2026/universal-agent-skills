# Host adapter capability contract

Use the source-backed report at `docs/research/compatibility-and-gap-report.md` when it is available in this repository. Host behavior changes; report uncertainty instead of extrapolating from another harness.

| Host | v1 target behavior | Required limitation language |
| --- | --- | --- |
| Codex CLI/IDE | Configure the documented auto-compaction token limit and scope. Record idempotent pre/post lifecycle events, then reconcile and inject the session-bound Work-Item Capsule once on `SessionStart` after compaction. | Project config is loaded only for trusted projects; hooks remain user-controlled. Total-token accounting is the safe default. `body_after_prefix` requires a project-local observation record matching the active model, capacity, and prefix count so the reserve can be preserved. Hooks fail open. |
| Claude Code CLI/IDE | Configure the documented 155k auto-compact calculation window and use available compaction/session hooks for checkpoint and context re-injection. | Claude controls actual proactive timing; the window is an upper bound, not an exact consumed-token trigger. |
| Cursor CLI/IDE | Checkpoint on native `preCompact` and consume reported token telemetry. | Do not override Cursor's native compaction threshold. |
| GitHub Copilot CLI/cloud | Checkpoint on native `preCompact` where hooks run. | IDE agent mode can use skills but does not necessarily run the same hook automation; cloud-local ignored state may not persist. |
| Antigravity CLI | Use status-line telemetry to warn and produce a checkpoint or handoff at the effective threshold. | Starting a new session remains explicit; no portable compact command is assumed. |
| Antigravity IDE | Use manual and phase-boundary checkpointing. | No documented compaction event or token telemetry exists for the IDE. |

Adapter changes must be opt-in, idempotent, reversible, and additive. Preserve unknown keys, hook groups, comments where the host format supports them, and user-owned commands. On removal, remove only entries recorded as managed by Universal Agent Skills.

Reversibility depends on the local ignored adapter-state file. If that file is missing while managed markers remain, setup and removal must fail safe and preserve the configuration for manual recovery; they must not overwrite or delete a prior user value they can no longer reconstruct.

Codex capacity comes from explicit setup input or the project's `model_context_window`; do not guess it from a model name. The managed `SessionStart` context is a redacted rendering of objective, success criteria, decisions, validation, blockers, next action, and authority pointers, bounded by `capsuleBudgetTokens`. Never fall back to another work item or a workspace-wide latest checkpoint when the incoming session has no binding.
