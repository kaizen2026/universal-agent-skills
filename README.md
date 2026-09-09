# Universal Agent Skills

Composable engineering workflows, a contract-driven frontend design suite, and portable cross-session continuity for coding agents.

This project is an MIT-licensed derivative of [mattpocock/skills](https://github.com/mattpocock/skills). It preserves upstream Git history, Matt Pocock's copyright notice, and the small, adaptable workflows that make the original useful. See [NOTICE.md](./NOTICE.md) for file-level provenance guidance.

## Install

The primary installation works with Codex, Claude Code, Cursor, GitHub Copilot, Antigravity, and other Agent Skills-compatible tools:

```shell
npx skills@latest add kaizen2026/universal-agent-skills
```

The installer lets you choose agents and skills. Select the promoted **Universal Agent Skills** group for the complete workflows; leave the non-promoted **General** group unselected. Avoid `--all` or `--skill '*'` unless you also want the draft, rare, and deprecated entries. Include `setup-universal-agent-skills` when you want repository configuration or lifecycle adapters. Selecting one orchestrator alone does not install the skills it calls.

### One project, Claude Code and Codex

For an npx-only skills installation, run this in the project both agents will use:

```shell
npx skills@latest add kaizen2026/universal-agent-skills --agent codex claude-code
```

Use the installer's **symlink** method, not `--copy`: the canonical files live in `.agents/skills/`, which Codex reads, and Claude reads links in `.claude/skills/`. This avoids two independently edited copies. It installs standalone skills, not a native Claude plugin. If the platform falls back to copies, check the reported installation method before assuming they stay synchronized. See the [skills CLI installation methods](https://github.com/vercel-labs/skills#installation-methods).

```shell
# Install at user scope
npx skills@latest add kaizen2026/universal-agent-skills --global

# Install the standalone advisor to both hosts
npx skills@latest add kaizen2026/universal-agent-skills --agent codex claude-code --skill prompt-engineer

# Update project or global installations
npx skills@latest update
npx skills@latest update --global
```

Project scope is the most reliable cross-host default. Current `skills` CLI global mappings can differ from the latest official Codex and Antigravity discovery paths; after a global install, run `npx skills list --global`, verify discovery inside the target host, and use setup/status for its lifecycle capability report. `skills update` refreshes skills already recorded in its lock; re-run `add` to discover skills newly added to this repository.

Run `$setup-universal-agent-skills` in Codex or `/setup-universal-agent-skills` in standalone Claude Code once in a repository to configure its issue tracker and domain docs, install the local continuity runtime, and opt into only the host adapters you want. Skill installation and lifecycle-hook setup are separate operations.

### Optional Claude Code plugin

Claude Code users who prefer a managed, read-only bundle can install this repository as a direct marketplace plugin. The universal repository already contains both native manifests; the companion repository is not required for this installation. Pick one skills delivery path **per host** to avoid duplicates.

```text
/plugin marketplace add kaizen2026/universal-agent-skills
/plugin install universal-agent-skills@universal-agent-skills
```

If you want to run every installation command through npx, Claude's own CLI can manage the native plugin too. From the target project, this is the version exercised by the plugin smoke test:

```shell
npx --yes @anthropic-ai/claude-code@2.1.266 plugin marketplace add kaizen2026/universal-agent-skills --scope local
npx --yes @anthropic-ai/claude-code@2.1.266 plugin install universal-agent-skills@universal-agent-skills --scope local
npx skills@latest add kaizen2026/universal-agent-skills --agent codex
```

This is an alternative to the shared standalone installation above, not an additional step. It keeps Claude's bundle in its managed plugin cache and the Codex skills in the project's canonical skill directory. The `local` scope enables the plugin for this project without sharing its settings through Git.

Plugin skills use Claude's namespace: `/universal-agent-skills:prompt-engineer` and `/universal-agent-skills:setup-universal-agent-skills`. The plugin does not silently enable host hooks; approve adapters separately. See [Claude's plugin guide](https://code.claude.com/docs/en/plugins).

You can combine the Claude plugin with an npx installation targeting **only Codex** (`--agent codex`). Do not also install the standalone bundle into Claude, and do not enable overlapping continuity hooks from both this runtime and the companion `claude-agent-skills` integration. Inspect existing installations and hook ownership before choosing a migration; no setup command silently removes another installation.

### Advisor and worker sessions

[`prompt-engineer`](./skills/engineering/prompt-engineer/SKILL.md) turns a separate advisor session into a reviewer and next-prompt writer for your coding workers. Invoke `$prompt-engineer` in Codex, `/prompt-engineer` in standalone Claude, or `/universal-agent-skills:prompt-engineer` with the plugin, then state the objective and worker scope once.

Workers publish compact reports to their own ignored files under `.agents/state/coordination/<work-item-id>/`. The advisor reads the changed report, checks material evidence, and prepares the next assignment without requiring you to paste the whole worker response. Its read-only helper can wait for a changed report without model calls. Reviewing results still costs tokens; live session discovery, notifications, and dispatch depend on host support and are not universally automatic. Start with the [advisor workflow guide](./docs/engineering/prompt-engineer.md).

## What v1 adds

### Frontend design from decision to review

```text
Wayfinder or grilling
        ↓ resolved product prerequisites
frontend-design → docs/design/<feature>/DESIGN.md + evidence/
        ↓ approved contract
implement → frontend-build
        ↓ rendered production UI
code-review → Standards + Spec + frontend-review
```

- [`frontend-design`](./skills/engineering/frontend-design/SKILL.md) inspects the real stack and design system, creates three meaningfully different runnable directions, captures desktop/mobile evidence, grills the user on reactions, and records the approved design contract.
- [`frontend-build`](./skills/engineering/frontend-build/SKILL.md) implements an approved contract with the repository's framework, components, tokens, data patterns, and tests.
- [`frontend-review`](./skills/engineering/frontend-review/SKILL.md) independently checks hierarchy, responsive behavior, states, keyboard use, accessibility, content, browsers, and regressions. Missing browser or accessibility tooling is reported as unverified, never passed.

`frontend-design` starts only after intent, audience, flows, content, target platform, and constraints are resolved. Broad missing decisions go back to Wayfinder; focused ones go back to grilling.

### Continuity across contexts and hosts

Portable state lives at:

```text
.agents/state/continuity/
├── work-items/<work-item-id>/semantic.md
├── work-items/<work-item-id>/proposals/*.json
├── bindings/<harness>/<session-id>.json
├── current.md          # legacy evidence only
└── history/            # legacy evidence only
```

It is gitignored by default. The manual runtime path activates one issue or explicit objective, binds the current harness session, writes a revisioned Work-Item Capsule, and resumes by explicit Work Item ID or that binding. Each semantic write declares its expected revision and runs under a portable atomic lock. Stale concurrent contributions become bounded, redacted merge proposals instead of overwriting newer state; timed-out locks are retained for verified manual recovery rather than stolen. The runtime never falls back to a workspace-wide latest checkpoint. [`checkpoint-work`](./skills/productivity/checkpoint-work/SKILL.md) records the capsule's objective, success criteria, phase, binding decisions, validation, blockers, next action, and authority pointers. [`resume-work`](./skills/productivity/resume-work/SKILL.md) resolves and reconciles it before work continues. Existing `current.md` and `history/` files remain readable only as explicitly requested legacy evidence. [`handoff`](./skills/productivity/handoff/SKILL.md) exports a redacted portable copy when the receiver cannot access local state.

The zero-dependency Node runtime and public defaults live under [`.agents/universal-agent-skills/`](./.agents/universal-agent-skills/). Its model-neutral policy checkpoints at 68% utilization, targets compaction at 78%, preserves at least 30,000 tokens, and limits capsule injection to 500 tokens. The effective compact threshold is the lower of the utilization target and the capacity remaining after the reserve. Schema-v1 configuration is migrated without dropping user-defined fields; its former literal threshold remains inactive migration evidence.

Session-start hooks resolve only an explicit Work Item ID or the current session binding. An unbound session emits a concise diagnostic and injects no semantic state. The Codex and Claude Code adapters share one lifecycle: each records idempotent `PreCompact` and `PostCompact` events, then reconciles and injects the bound capsule once on `SessionStart` after compaction, and both fail open on malformed input and continuity errors. A legacy workspace-wide checkpoint (or a portable handoff) becomes capsule content only through the explicit `import-legacy-checkpoint --work-item <id>` command, which tags the result with import provenance and turns a stale import into a merge proposal instead of overwriting newer work. `status` is read-only and reports duplicate or non-managed hook registrations with exact remediation guidance.

## Capability tiers

A `SKILL.md` can guide checkpointing everywhere. It cannot universally force compaction or launch another session. Those actions depend on host configuration and lifecycle hooks.

| Host | v1 automation | Important limit |
| --- | --- | --- |
| Codex CLI/IDE | Safe total-token threshold plus idempotent `PreCompact`, `PostCompact`, and post-compaction `SessionStart` reconciliation | Project hooks run only after trust review; prefix-excluding accounting requires a project-local observation matching the active model, capacity, and prefix count. |
| Claude Code CLI/IDE | Reported model context window plus a host-controlled compact-trigger percentage (never inventing a fallback capacity), and idempotent `PreCompact`, `PostCompact`, and post-compaction `SessionStart` reconciliation | Claude controls actual proactive timing; the window is unverified until a real session reports it, and is an upper bound, not an exact consumed-token trigger. |
| Cursor CLI/IDE | `preCompact` checkpointing, native token telemetry, and session-start reconciliation | Cursor's threshold is not overridden. |
| GitHub Copilot CLI/cloud | Repository `preCompact` and session-start hooks | Cloud filesystems are ephemeral; IDE agent mode does not guarantee identical hook automation. |
| Antigravity CLI | Status-line token telemetry warning plus checkpoint/handoff command | Compaction and starting a replacement session remain explicit. |
| Antigravity IDE | Portable and phase-boundary continuity | No documented compaction event or token telemetry exists for the IDE. |

Adapters are opt-in, idempotent, additive to existing configuration, reversible with their local ignored reversal state, and never make hook trust decisions for the user. If that state is lost, setup preserves managed-looking configuration for manual recovery instead of guessing. The source-backed details and remaining gaps are in [`docs/research/compatibility-and-gap-report.md`](./docs/research/compatibility-and-gap-report.md).

## Skill catalog

### Engineering

User-invoked orchestrators:

- [`ask-matt`](./skills/engineering/ask-matt/SKILL.md) — route a situation through the composable upstream workflows.
- [`grill-with-docs`](./skills/engineering/grill-with-docs/SKILL.md) — interview while sharpening project language and decisions.
- [`implement`](./skills/engineering/implement/SKILL.md) — build a spec or issue and close with review.
- [`improve-codebase-architecture`](./skills/engineering/improve-codebase-architecture/SKILL.md) — survey deepening opportunities.
- [`project-progress`](./skills/engineering/project-progress/SKILL.md) — turn maps, plans, designs, code, and validation into an evidence-based visual dashboard.
- [`to-spec`](./skills/engineering/to-spec/SKILL.md), [`to-tickets`](./skills/engineering/to-tickets/SKILL.md), and [`triage`](./skills/engineering/triage/SKILL.md) — shape and route tracked work.
- [`wayfinder`](./skills/engineering/wayfinder/SKILL.md) — map a large, foggy decision space across sessions.

Model- or user-invoked disciplines:

- [`codebase-design`](./skills/engineering/codebase-design/SKILL.md), [`code-review`](./skills/engineering/code-review/SKILL.md), [`diagnosing-bugs`](./skills/engineering/diagnosing-bugs/SKILL.md), and [`domain-modeling`](./skills/engineering/domain-modeling/SKILL.md)
- [`frontend-design`](./skills/engineering/frontend-design/SKILL.md), [`frontend-build`](./skills/engineering/frontend-build/SKILL.md), and [`frontend-review`](./skills/engineering/frontend-review/SKILL.md)
- [`prototype`](./skills/engineering/prototype/SKILL.md), [`research`](./skills/engineering/research/SKILL.md), [`resolving-merge-conflicts`](./skills/engineering/resolving-merge-conflicts/SKILL.md), [`tdd`](./skills/engineering/tdd/SKILL.md), and [`wizard`](./skills/engineering/wizard/SKILL.md)
- [`setup-universal-agent-skills`](./skills/engineering/setup-universal-agent-skills/SKILL.md) — report capabilities, configure repository conventions, and install only explicitly selected adapters.
- [`prompt-engineer`](./skills/engineering/prompt-engineer/SKILL.md) — review worker results and draft the next scoped, paste-ready prompt.

### Productivity

- [`checkpoint-work`](./skills/productivity/checkpoint-work/SKILL.md), [`resume-work`](./skills/productivity/resume-work/SKILL.md), and [`handoff`](./skills/productivity/handoff/SKILL.md) — local, reconciled, and portable continuity.
- [`grill-me`](./skills/productivity/grill-me/SKILL.md) and [`grilling`](./skills/productivity/grilling/SKILL.md) — stateless wrapper and reusable interview discipline.
- [`teach`](./skills/productivity/teach/SKILL.md), [`to-questionnaire`](./skills/productivity/to-questionnaire/SKILL.md), [`wait-what`](./skills/productivity/wait-what/SKILL.md), and [`writing-for-agents`](./skills/productivity/writing-for-agents/SKILL.md)

Draft, rare, and deprecated skills remain in their existing non-promoted buckets and are excluded from the Claude plugin.

## Development and release

```shell
npm ci
npm test
npm run test:installer
npm run test:plugin
```

CI is configured to validate skill structure and discovery, YAML types and cross-host invocation policy, manifest consistency, runtime bundling, checkpoint schema and redaction, advisor report boundaries, adapter merge/removal fixtures, repeated setup, and Windows/POSIX behavior on Ubuntu and Windows. The installer smoke checks shared Claude/Codex real paths; the pinned native Claude smoke installs into disposable configuration without model calls. These tests establish packaging and deterministic behavior, not model quality. The release workflow is manual and requires the compatibility matrix to be confirmed; source version alone is not a claim that every external host was exercised.

Native Codex and Claude compaction acceptance cannot be produced by CI alone; run [`scripts/native-acceptance-wizard.sh`](./scripts/native-acceptance-wizard.sh) to set up the disposable fixtures and bound sessions, then follow its printed runbook. See [the continuity release runbook](./docs/continuity-release-runbook.md) for the full acceptance boundary.

The validator checks the portable Agent Skills name, description, layout, and resource contract for every promoted skill. A small set of retained upstream skills also carry documented Claude Code invocation fields such as `disable-model-invocation`; those host extensions power the optional plugin and are reported separately from portable metadata.

The [advisor behavioral scenarios](./evals/prompt-engineer.md) define the next model-quality evaluation. They are not marked passed by the deterministic suite, and running them does not authorize worker dispatch or paid sessions by itself.

To incorporate upstream work, fetch `upstream`, review the changes against this derivative's integration points, and preserve upstream commits when merging. Do not squash away attribution.
