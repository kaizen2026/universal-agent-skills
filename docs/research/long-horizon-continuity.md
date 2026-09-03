# Automated long-horizon continuity for Codex CLI and Claude Code

Date: 2026-09-03

## Question

How should `claude-agent-skills` and `universal-agent-skills` support implementation work that outlives one context window, without requiring a person to manually hand work to another session and without allowing repeated compaction to erase the objective, decisions, evidence, or next action?

This is supporting research, not implementation authority.

## Conclusion

The production baseline should be an automatic in-session epoch handoff:

1. maintain a small durable semantic capsule during the active work epoch;
2. record machine evidence before native compaction without blocking the host;
3. let the host perform its supported compaction;
4. reconcile the capsule against Git and tracked sources;
5. inject the capsule once into the immediate continuation.

This preserves the active terminal, session, permissions, and pending turn. It cannot promise zero information loss, but it makes continuity bounded, observable, and recoverable.

A genuinely fresh-session rollover is possible only when an outer SDK or headless supervisor owns the task from launch. A hook inside an already-running interactive TUI cannot safely transfer terminal ownership to a new TUI.

## Primary-source findings

### Codex CLI

- Codex exposes `PreCompact`, `PostCompact`, and `SessionStart` with a `compact` source. During mid-turn automatic compaction, `SessionStart` context is delivered to the immediate continuation.
- `model_auto_compact_token_limit` is an explicit threshold. `model_auto_compact_token_limit_scope = "body_after_prefix"` can count conversation growth after the carried prefix rather than repeatedly charging the fixed prefix against every epoch.
- The Codex SDK, app server, and non-interactive CLI expose thread start/resume operations suitable for a future outer supervisor.

Sources: [Codex hooks](https://developers.openai.com/codex/hooks), [Codex configuration reference](https://developers.openai.com/codex/config-reference), [Codex model configuration source](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/openai_models.rs), [Codex SDK](https://developers.openai.com/codex/sdk), [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive), and [Codex app server](https://developers.openai.com/codex/app-server).

### Claude Code

- Claude Code clears older tool output and summarizes when context management is needed. Anthropic warns that early detailed instructions may be lost, so durable rules and task state must live outside transcript memory.
- Claude exposes `PreCompact` and `SessionStart` with a `compact` source. `SessionStart` accepts additional context. Continuity hooks must fail open because blocking recovery compaction can surface a context error.
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW` sets effective context capacity; it is not an exact compaction trigger. `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` independently lowers the trigger as a percentage of the effective window.
- The Agent SDK and headless CLI expose session continue/resume operations suitable for a future outer supervisor.

Sources: [Claude Code environment variables](https://code.claude.com/docs/en/env-vars), [Claude Code hooks](https://code.claude.com/docs/en/hooks), [Claude Code context window](https://code.claude.com/docs/en/context-window), [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works), [Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions), and [Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage).

OpenAI also recommends repeatable compaction for long tool workflows, performed at meaningful milestones and resumed with functionally equivalent instructions. See [OpenAI compaction guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.2).

## Audited live-workspace findings

These observations came from the original installed workspace before the work was relocated to the isolated `C:\Handoff` clones. They are diagnostic inputs, not permission to modify that live project.

### Duplicate Codex lifecycle ownership

`.codex/hooks.json` registers a direct Universal Agent Skills handler and the smart-zone wrapper for each compaction lifecycle event. The wrapper delegates to the same Universal runtime. Every actual Codex event therefore executes checkpoint or reconciliation behavior twice.

The duplication explains same-timestamp archive pairs, concurrent writes, and duplicate reinjection. It does not itself make Codex decide to compact twice because these hooks run after the host emits the lifecycle event.

### Rapid compaction lacks diagnostic telemetry

The smart-zone event log showed hundreds of real Codex pre/post events, including several pre-compactions only minutes apart. The current log omits the effective context window, input usage, fixed-prefix size, mutable-body size, event identity, injected-token count, and distinct main/subagent identity. A controlled multi-compaction test is required before assigning a single cause.

Likely contributors include the deliberately early fixed threshold, `total` accounting of a large carried prefix, duplicate reinjection, large tool results, and concurrent agents sharing one state namespace.

### `155000` is not a portable smart-zone setting

- Codex interprets the configured value as a compaction threshold.
- Claude interprets `CLAUDE_CODE_AUTO_COMPACT_WINDOW=155000` as effective calculation capacity and uses a separate trigger percentage.

The adapters must share a policy expressed as desired utilization and reserved headroom, then translate it into host-specific controls.

### Global state permits cross-session contamination

The current runtime stores all harnesses, sessions, and agents in one `current.md` and one history directory. It has no session namespace, cross-process lock, revision check, or idempotency key. Claude-authored semantic claims and Codex observation metadata can therefore coexist in one record, while subagents can archive or overwrite main-session state.

### Reinjection is too large

The direct handler may inject roughly 12,000 characters and the wrapper another roughly 8,000 characters. That consumes the headroom the smart zone is meant to preserve. A normal reinjection should be a fixed 500-token maximum containing only objective, success criteria, phase, binding decisions, validation state, blockers, one next action, and authoritative pointers.

### The separate Claude durability plugin is not authoritative

The installed `session-durability@claude-skills` plugin is disabled in this workspace. Even when enabled, its session-start hook injects a mission file; it neither controls compaction nor performs fresh-session rollover.

## Recommended architecture

Use one tracked runtime contract and disposable ticket-scoped state:

```text
.agents/state/continuity/
  work-items/<work-item-id>/semantic.md
  work-items/<work-item-id>/events.jsonl
  work-items/<work-item-id>/proposals/
```

- Universal Agent Skills owns the core and lifecycle integration.
- Claude Agent Skills is a thin Claude-specific distribution over that contract.
- Every contributing agent may update a shared work-item capsule.
- Updates use atomic locking and revision checks. A stale update becomes a merge proposal instead of overwriting newer state.
- Machine events retain harness, session, agent, event identity, usage fields, and injected-token count.
- A new explicit objective activates a different work-item capsule; hooks cannot revive an unrelated old objective.
- Hook failures log degraded continuity and fail open.
- Status rendering is read-only.
- Existing history remains legacy evidence and is not bulk-migrated.

Initial calibration policy:

```json
{
  "checkpointUtilization": 0.68,
  "compactUtilization": 0.78,
  "minimumReserveTokens": 30000,
  "capsuleBudgetTokens": 500
}
```

These values are starting hypotheses. Codex and Claude must resolve them against their actual models and available telemetry.

## Acceptance contract

A synthetic implementation ticket must cross at least three native compaction boundaries on each harness and prove:

- continuation without a user-written handoff prompt;
- exactly one lifecycle record, state transition, reconciliation, and injection per event;
- survival of the objective, success criteria, decisions, and next action;
- reconciliation of Git HEAD, dirty state, tracked authority, and validation evidence;
- safe concurrent contributions without last-writer-wins loss;
- failure-open behavior when a hook times out or crashes;
- no immediate compaction loop after reinjection;
- intended model-specific headroom;
- bounded retention and no persisted secrets.

The optional supervisor additionally requires crash recovery, approval routing, explicit budgets and termination conditions, and protection against two epochs mutating the same checkout.
