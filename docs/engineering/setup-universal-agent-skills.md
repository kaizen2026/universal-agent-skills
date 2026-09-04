## What it does

`setup-universal-agent-skills` configures a repository's issue tracker and domain docs, installs the local continuity runtime, and offers host-specific lifecycle adapters. It separates portable skill behavior from automation that only a particular host can provide.

## When to reach for it

Type `/setup-universal-agent-skills`, or let the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) propose it when first-use configuration is missing. Adapter changes never occur until you explicitly select the hosts and see the files and capability limits involved.

## Prerequisites

Node.js is required for the zero-dependency runtime. Host commands or config directories improve detection, but a directory name alone is not treated as proof that a host works.

## Capability before configuration

The setup report distinguishes portable skills, the explicit activate/checkpoint/resume runtime, and native host adapters. The model-neutral policy checkpoints at 68% utilization, targets [compaction](https://www.aihero.dev/ai-coding-dictionary/compaction) at 78%, preserves at least 30,000 tokens, and caps capsule injection at 500 tokens. Against a known [context window](https://www.aihero.dev/ai-coding-dictionary/context-window), setup reports the effective checkpoint threshold, compact threshold, and actual reserve.

Codex accounting has two explicit paths:

| Available evidence | Accounting behavior |
| --- | --- |
| Context capacity only | Use safe total-token accounting. |
| Context capacity and a project-local observation matching the active model, capacity, and prefix size | Prefix-excluding accounting may be selected while preserving the same reserve, with the evidence source reported. |

The Codex and Claude Code lifecycle adapters share one contract: each records equivalent hook deliveries once and, after compaction, reconciles and injects only the capsule bound to that session. Claude's reported model window and its host-controlled compact-trigger percentage are configured as separate controls; when the window is unverified, no fallback capacity is invented.

No hook ever adopts a workspace-wide `current.md` or archived checkpoint as capsule content. The explicit `import-legacy-checkpoint --work-item <id>` command is the only path from a legacy checkpoint (or an incoming portable handoff) into a capsule: it tags the result with import provenance and, if the target capsule has moved on, records a merge proposal instead of overwriting it.

Schema-v1 configuration is migrated compatibly: existing and user-defined fields are retained, while the new policy becomes authoritative. The old literal threshold remains migration evidence rather than a cross-host control.

## Common questions

**Will setup overwrite my agent settings?**

No. It merges its own hook entries, preserves unrelated keys and hooks, records non-sensitive reversal state, and removes only entries it manages.

**Does setup make every host auto-compact at exactly 155k?**

No. Codex exposes a token threshold. Claude exposes a compaction calculation window and a lowering percentage, Cursor and Copilot retain native thresholds, Antigravity CLI offers watcher telemetry, and Antigravity IDE remains manual.

**Can a broken continuity hook stop Codex or Claude?**

No. Managed hooks on both hosts return valid output and allow the lifecycle to continue when input is malformed or continuity storage fails; each degraded delivery is recorded in `diagnostics.jsonl` with its session identity. A git HEAD that moved since the last checkpoint is ordinary drift, not a failure, so the capsule is still injected.

**What does `status` do about hooks I didn't install?**

It reports them and leaves them alone. `status` is read-only: it counts managed handlers per event, flags a non-managed handler registered for the same event with the file to edit, and never removes anything. `remove` strips only managed entries.

**Does a global `skills` CLI copy prove discovery?**

No. Current Codex and Antigravity documented global paths can differ from installer mappings. Setup verifies the host-visible location, reports mismatches, and requires a separate explicit choice before creating any reversible user-scope bridge. Project installation remains the reliable default.

## It's working if

- Re-running setup produces no duplicate hooks.
- Repeated Codex or Claude lifecycle deliveries produce one event and one capsule injection for the bound work item.
- `status` reports every host's threshold source, hook contract, and duplicate-ownership diagnostics without modifying a single file.
- Removal restores related prior values and leaves unrelated configuration intact.
- The capability report names every limitation and trust step.

## Where it fits

This is the run-once setup and periodic adapter-maintenance entry for the whole collection. Its closest continuity neighbors are [checkpoint-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/checkpoint-work/SKILL.md) and [resume-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/resume-work/SKILL.md); [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md) routes the engineering skills that consume its tracker and domain configuration.
