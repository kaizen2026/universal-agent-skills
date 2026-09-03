# Universal Agent Skills

Composable engineering workflows, a contract-driven frontend design suite, and portable cross-session continuity for coding agents.

This project is an MIT-licensed derivative of [mattpocock/skills](https://github.com/mattpocock/skills). It preserves upstream Git history, Matt Pocock's copyright notice, and the small, adaptable workflows that make the original useful. See [NOTICE.md](./NOTICE.md) for file-level provenance guidance.

## Install

The primary installation works with Codex, Claude Code, Cursor, GitHub Copilot, Antigravity, and other Agent Skills-compatible tools:

```shell
npx skills@latest add kaizen2026/universal-agent-skills
```

The installer lets you choose agents and skills. Include `setup-universal-agent-skills` when you want repository configuration or lifecycle adapters.

```shell
# Install at user scope
npx skills@latest add kaizen2026/universal-agent-skills --global

# Install selected skills
npx skills@latest add kaizen2026/universal-agent-skills --skill=frontend-design --skill=frontend-build --skill=frontend-review

# Update project or global installations
npx skills@latest update
npx skills@latest update --global
```

Project scope is the most reliable cross-host default. Current `skills` CLI global mappings can differ from the latest official Codex and Antigravity discovery paths; after a global install, run `npx skills list --global`, verify discovery inside the target host, and use setup/status for its lifecycle capability report. `skills update` refreshes skills already recorded in its lock; re-run `add` to discover skills newly added to this repository.

Run `/setup-universal-agent-skills` once in a repository to configure its issue tracker and domain docs, install the local continuity runtime, and opt into only the host adapters you want.

### Optional Claude Code plugin

Claude Code users who prefer a managed, read-only bundle can install this repository as a direct marketplace plugin. Pick either the plugin or the editable skills installation to avoid duplicates.

```text
/plugin marketplace add kaizen2026/universal-agent-skills
/plugin install universal-agent-skills@universal-agent-skills
```

The plugin does not silently enable host hooks. Run `/setup-universal-agent-skills` and approve adapters separately.

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

Session-start hooks resolve only an explicit Work Item ID or the current session binding. An unbound session emits a concise diagnostic and injects no semantic state. The Codex adapter records idempotent `PreCompact` and `PostCompact` events, then reconciles and injects the bound capsule once on `SessionStart` after compaction. It fails open on malformed input and continuity errors.

## Capability tiers

A `SKILL.md` can guide checkpointing everywhere. It cannot universally force compaction or launch another session. Those actions depend on host configuration and lifecycle hooks.

| Host | v1 automation | Important limit |
| --- | --- | --- |
| Codex CLI/IDE | Safe total-token threshold plus idempotent `PreCompact`, `PostCompact`, and post-compaction `SessionStart` reconciliation | Project hooks run only after trust review; prefix-excluding accounting requires a project-local observation matching the active model, capacity, and prefix count. |
| Claude Code CLI/IDE | 155k auto-compact calculation window plus pre/post/session hooks | Claude controls actual proactive timing; the window is an upper bound, not an exact consumed-token trigger. |
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
```

CI validates skill structure and discovery, manifest consistency, runtime bundling, checkpoint schema and redaction, adapter merge/removal fixtures, repeated setup, and Windows/POSIX behavior on Ubuntu and Windows. The `v1.0.0` release workflow is manual and requires the compatibility matrix to be confirmed; source version alone is not a claim that every external host was exercised.

The validator checks the portable Agent Skills name, description, layout, and resource contract for every promoted skill. A small set of retained upstream skills also carry documented Claude Code invocation fields such as `disable-model-invocation`; those host extensions power the optional plugin and are reported separately from portable metadata.

To incorporate upstream work, fetch `upstream`, review the changes against this derivative's integration points, and preserve upstream commits when merging. Do not squash away attribution.
