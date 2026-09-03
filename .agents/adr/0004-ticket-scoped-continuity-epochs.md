---
status: accepted
---

# Use ticket-scoped continuity epochs for long-running agent work

Long-running implementation work will continue through native Codex CLI and Claude Code compaction using a small, reconciled Work-Item Capsule rather than a manually written session handoff or a host-neutral `155000` setting. Universal Agent Skills is the sole owner of the shared continuity contract and lifecycle integration; Claude Agent Skills remains a thin Claude-specific distribution over that contract. The shared policy expresses desired utilization and reserved headroom, and each adapter translates that intent into its host's supported controls.

One Work-Item Capsule is shared by agents collaborating on the same ticket or explicit objective. Every collaborator may contribute, but updates use atomic locking and revision checks; a stale contribution becomes a merge proposal rather than replacing newer state. Harness, session, agent, and lifecycle observations remain separately identifiable. A new explicit user objective activates another work item, so a compaction hook cannot revive an unrelated older objective merely because its checkpoint is structurally valid.

Continuity lifecycle failures fail open: native compaction proceeds, the runtime records degraded continuity, and the agent reconciles from tracked authority when possible. Fresh-Session Rollover is deferred to an opt-in SDK or headless supervisor that owns the task from launch; it is not performed by spawning a second interactive CLI from a lifecycle hook. The initial calibration checkpoints near 68 percent utilization, compacts near 78 percent while retaining at least 30,000 tokens, and caps capsule injection at 500 tokens, subject to cross-harness measurement and adjustment.

## Language

**Continuity Epoch**:
One uninterrupted span of work between initial session start or reconciled compaction and the next continuity boundary.

**Work-Item Capsule**:
The small, revisioned semantic state shared by agents collaborating on one ticket or explicit objective, containing the objective, success criteria, current phase, binding decisions, validation state, blockers, one next action, and pointers to tracked authority.

**Continuity Event**:
A machine observation associated with one harness, session, agent, work item, lifecycle event, and capsule revision. It is evidence and never replaces the Work-Item Capsule or tracked project authority.

**Fresh-Session Rollover**:
An outer supervisor's deliberate transition from one completed agent session to a new session using a reconciled Work-Item Capsule. It is distinct from native in-session compaction.

## Considered options

- A literal 155,000-token setting in every host was rejected because Codex and Claude interpret their controls differently.
- One unprotected workspace-wide checkpoint was rejected because unrelated objectives and concurrent agents can overwrite or revive one another.
- Last-writer-wins updates were rejected because a stale subagent can erase a newer main-agent decision.
- Starting a fresh interactive CLI from a compaction hook was rejected because terminal ownership, approvals, lifecycle completion, and checkout mutation cannot be transferred safely.
- Keeping both direct Universal handlers and a delegating smart-zone wrapper was rejected because it duplicates lifecycle work and reinjection.

## Consequences

The runtime and both host adapters will be implemented and exercised in the dedicated `C:\Handoff` workspace before any separate project opts into them. Existing continuity history remains legacy evidence and is not bulk-imported. A later Codex hook cutover requires one explicit `/hooks` trust action after registration changes, while subsequent compaction boundaries and continuation require no user-written handoff.

Supporting evidence is recorded in [Automated long-horizon continuity research](../../docs/research/long-horizon-continuity.md).
