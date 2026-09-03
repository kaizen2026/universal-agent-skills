---
name: setup-universal-agent-skills
description: Configure a repository for Universal Agent Skills, including its issue tracker and domain docs, continuity runtime, and optional Codex, Claude Code, Cursor, GitHub Copilot, or Antigravity adapters. Use for first-time setup, capability reporting, adapter changes, or removing managed adapter configuration.
---

# Setup Universal Agent Skills

Configure the portable skills first, then offer host automation as an explicit opt-in. A skill can always guide checkpointing; only a host with the necessary lifecycle hooks can automate it.

## Explore

Inspect the repository, existing `AGENTS.md` or `CLAUDE.md`, issue-tracker conventions, domain docs, monorepo signals, `.agents/universal-agent-skills/config.json`, installed agent commands, config directories, and the skill locations each host actually discovers. Do not treat a directory name or a successful global installer copy as proof that a host can load it. Current Codex and Antigravity global discovery paths can differ from `skills` CLI mappings; report the mismatch and prefer project scope unless the user explicitly authorizes a reversible user-scope bridge.

Read [HOST-ADAPTERS.md](references/HOST-ADAPTERS.md) and present a capability report with three tiers:

- Portable skills only
- Portable runtime for explicit checkpoint, resume, and handoff
- Native adapter, labelled with the host's actual hook, telemetry, and threshold capabilities

Report the detected context window and resolved utilization policy. Default to checkpoint utilization 0.68, compact utilization 0.78, a 30,000-token minimum reserve, and a 500-token capsule budget. Show the effective checkpoint tokens, compact tokens, and reserve for the detected capacity. Migrate schema-v1 configuration without dropping user-defined fields; retain its literal threshold only as inactive migration evidence.

For Codex, resolve capacity from an explicit `--context-window` or the project's `model_context_window`. Install `model_auto_compact_token_limit_scope = "total"` unless the user explicitly selects `body_after_prefix` and supplies both `--codex-prefix-tokens` and a project-local `--codex-prefix-evidence` JSON record from an observed Codex session. Verify that the evidence names its source, model, capacity, prefix count, and observation time and matches the active configuration. Subtract the verified prefix before calculating the installed threshold so the configured reserve still exists. Report the capacity source, accounting scope, evidence, confidence, installed threshold, and reserve. If capacity or prefix evidence cannot be verified, stop without changing Codex configuration.

## Confirm choices

Confirm the issue tracker and domain-doc layout using the relevant seed references in this folder. Then ask which detected host adapters to install. Make clear which files each adapter will touch, what it can automate, and what remains manual. Do not modify host configuration until the user explicitly opts in. Leave hook trust and command approval to the user.

## Install idempotently

Locate `scripts/universal-agent-skills.mjs` relative to this skill and run its setup command for only the selected hosts. The script must:

- Create `.agents/universal-agent-skills/config.json` and the zero-dependency runtime
- Add `.agents/state/continuity/` to `.gitignore` without duplicating it
- Merge host configuration without overwriting unrelated settings
- Record enough adapter state for safe removal
- Produce the same result on repeated setup
- Use commands and paths that work on Windows and POSIX systems
- Install Codex `PreCompact`, `PostCompact`, and `SessionStart` handlers that record one normalized event per lifecycle transition, reconcile only the work item bound to the incoming Codex session, and inject its redacted capsule once after compaction within the configured budget

Write or update the repository's `## Agent skills` guidance and `docs/agents/` files without replacing surrounding user content. Preserve existing tracker and domain choices on repeated runs unless the user asked to change them.

## Verify and report

Run runtime status and adapter verification. Report each host as `Configured`, `Available but not configured`, `Detected with limitations`, or `Not detected`. Include exact files changed, effective threshold, hook events installed, removal command, and any manual trust step.

Verify the managed entries actually exist; do not trust reversal state alone. When setup used a sub-200k context window, retain that installed effective threshold in status while labelling the current session window unverified unless it was supplied again. If ignored reversal state is missing but managed entries remain, preserve the configuration and stop for manual recovery rather than guessing an earlier value.

Exercise Codex hooks through the installed wrapper in a temporary repository, including a path containing spaces. Equivalent duplicate deliveries must produce one logical event, one transition, and one injection. Malformed input and storage or reconciliation failures must still return valid hook output and exit successfully so continuity failure cannot stop Codex.

Never claim that a pure `SKILL.md` can force compaction or open a replacement session. Never run a background daemon or launch another agent session silently.
