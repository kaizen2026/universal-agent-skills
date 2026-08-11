# Universal Agent Skills v1: compatibility and gap report

> Research snapshot: 2026-08-11. This report uses primary product documentation, the Agent Skills specification, and the `vercel-labs/skills` source. Host behavior is version-sensitive and should be capability-detected during setup.

## Executive conclusion

Universal Agent Skills can honestly promise a portable workflow and checkpoint format on every listed host. It cannot honestly promise identical lifecycle automation.

The product should advertise three tiers:

1. **Portable skill tier** — `SKILL.md`, referenced resources, and executable helper scripts where the host permits them.
2. **Portable runtime tier** — explicit `checkpoint-work`, `resume-work`, and `handoff` commands backed by the zero-dependency Node runtime.
3. **Native adapter tier** — optional host configuration and lifecycle hooks, with the exact capability reported per surface.

The [Agent Skills specification](https://agentskills.io/specification) defines a folder format, required metadata, optional scripts/references/assets, and progressive disclosure. It defines no token telemetry, compaction event, automatic-compaction threshold, context reinjection, or new-session operation. Therefore a pure skill can request those actions but cannot guarantee their timing or execution. `allowed-tools` is explicitly experimental and varies by implementation.

## Compatibility matrix

| Host surface | Skills | Compaction and token capability | Checkpoint / resume automation | Honest v1 capability |
|---|---|---|---|---|
| Codex CLI and IDE extension | Yes | Exact native threshold via `model_auto_compact_token_limit`; `model_context_window` is a configuration value, not hook telemetry | `PreCompact`, `PostCompact`, and `SessionStart(source=compact|resume|startup)`; `SessionStart` can inject context into the immediate post-compaction continuation | **Full lifecycle adapter** for threshold, archival, and reinjection of previously recorded state; hooks cannot infer semantic work state |
| Claude Code CLI and IDE extension | Yes | `CLAUDE_CODE_AUTO_COMPACT_WINDOW` sets the window used for compaction calculations; `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` can only move the trigger earlier | `PreCompact`, `PostCompact`, and `SessionStart(source=compact|resume|startup)`; context injection is supported | **Native adapter with host-controlled timing**; 155k is an upper-bound window, not an exact consumed-token trigger |
| Cursor IDE | Yes | `preCompact` reports exact token count, context-window size, and usage percentage, but is observational and cannot alter compaction | Checkpoint at native `preCompact`; `sessionStart` can inject context only when a new composer is created; no documented post-compact event | **Native-timed checkpointing**, no threshold override or automatic post-compact reinjection |
| Cursor CLI | Yes | The CLI changelog explicitly includes pre-compaction hooks; `preCompact` remains observational and follows Cursor's native threshold | Checkpoint with the same reported token/window payload; no documented post-compact event | **Native-timed checkpointing**, no threshold override or automatic post-compact reinjection |
| Cursor cloud agent | Yes | Project `preCompact` is supported and retains its token payload; native threshold is not overridden | Project hook can checkpoint, but cloud has no `sessionStart`; early read-only turns do not run hooks and user hooks are unavailable | **Pre-compact checkpoint only**; no automatic resume injection |
| GitHub Copilot CLI | Yes | Native automatic compaction occurs near capacity; no documented absolute threshold override, and `preCompact` exposes no token count/window | `preCompact` is notification-only; `sessionStart` can inject context on new/resumed sessions | **Native-timed checkpoint and resume injection**, not a 155k compactor |
| GitHub Copilot cloud agent | Yes | `preCompact` fires only for automatic compaction and exposes no token count/window | Project hooks only; `sessionStart` fires once as a new session; filesystem is destroyed when the job ends | **Per-job checkpoint only** unless state is exported or tracked outside the gitignored path |
| GitHub Copilot agent mode in VS Code | Yes | A separate VS Code hook implementation, currently Preview, provides `PreCompact(trigger=auto)` without token telemetry or threshold control | `SessionStart` can inject context, but its source is currently always `new`; no `PostCompact` | **Preview adapter**, not equivalent to CLI/cloud hooks |
| GitHub Copilot in other IDEs | Varies | GitHub's matrix lists hooks as unsupported outside VS Code | No documented equivalent lifecycle automation | **Skills-only/manual continuity** where skills are supported |
| Antigravity CLI | Yes | A custom status-line command receives live input/output totals and context-window size; no documented compact hook, compact command, or threshold override | A status-line script can calculate/warn at the effective threshold and write a checkpoint as a local side effect; resume or reset remains explicit | **Telemetry-assisted warning/checkpoint**, no forced compaction or session launch |
| Antigravity IDE | Yes | The documented hook events have no compaction event or token payload | `PreInvocation` can inject steps, but there is no documented signal that identifies post-compaction or a new session | **Manual/phase-boundary continuity** |

## Host evidence and adapter boundaries

### Codex CLI and IDE

The official [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) defines `model_auto_compact_token_limit` as the token threshold that triggers automatic history compaction and `model_context_window` as the active model's context window. It also documents the `features.hooks` toggle. The [hooks reference](https://learn.chatgpt.com/docs/hooks) provides `PreCompact`, `PostCompact`, and `SessionStart`; after root compaction, `SessionStart(source="compact")` runs before the next model request, including an automatic mid-turn continuation, and can add developer context.

Codex CLI and the IDE extension share configuration layers according to [Developer settings](https://learn.chatgpt.com/docs/developer-settings?surface=ide). The adapter may therefore set `model_auto_compact_token_limit = 155000` for both surfaces, merge hooks into an existing configuration, and use the native post-compaction reinjection path. Project configuration and hooks require project trust, and non-managed command hooks require explicit review and trust; setup must not bypass that decision. Only command hook handlers currently execute.

Codex [supports standalone skills in the CLI and IDE extension](https://learn.chatgpt.com/docs/build-skills). This does not make lifecycle hooks part of `SKILL.md`; the setup skill must install the adapter separately and only after opt-in.

### Claude Code CLI and IDE

Claude's [environment-variable reference](https://code.claude.com/docs/en/env-vars) distinguishes two controls:

- `CLAUDE_CODE_AUTO_COMPACT_WINDOW` sets the token window used for automatic-compaction calculations, currently constrained to 100,000–1,000,000 tokens.
- `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` can lower the percentage at which compaction occurs, but cannot raise it above Claude's default.

Consequently, setting the window to 155,000 does **not** mean compaction occurs at exactly 155,000 consumed tokens. It makes 155,000 the calculation-window upper bound and leaves the actual proactive point to Claude unless the user elects an earlier percentage. Claude caps a configured window at the model's actual context size, as documented in [Explore the context window](https://code.claude.com/docs/en/context-window). The [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) documents blocking `PreCompact`, observational `PostCompact` with `compact_summary`, and `SessionStart` sources including `compact` and `resume`; `SessionStart` stdout or `additionalContext` is injected into Claude's context. Blocking recovery compaction after an API context-limit error causes that request to fail, so the adapter must never block compaction.

The [VS Code integration](https://code.claude.com/docs/en/ide-integrations) shares `~/.claude/settings.json`—including environment variables and hooks—with the CLI. Claude's [web/cloud sessions](https://code.claude.com/docs/en/claude-code-on-the-web) also support `/compact` and both automatic-compaction variables, but `/clear` is replaced by explicitly starting a new sidebar session. A local gitignored checkpoint cannot be assumed to survive a separate cloud job.

### Cursor IDE, CLI, and cloud

Cursor's [hooks reference](https://cursor.com/docs/hooks) makes three important limits explicit:

- `preCompact` is observational and cannot block or modify compaction. It reports `context_tokens`, `context_window_size`, `context_usage_percent`, message count, and the number of messages about to be compacted.
- `sessionStart` runs when a new composer conversation is created and can add initial context, but it is not a post-compaction event.
- Cloud agents support project `preCompact`, but not `sessionStart`; early read-only turns run without hooks, and user-level hooks are unavailable in cloud.

Cursor does not document an adapter setting that replaces its native compaction threshold. The v1 adapter should therefore checkpoint when Cursor fires `preCompact`, report Cursor's observed values, and avoid claiming a 155k trigger. Cursor's [CLI changelog](https://cursor.com/docs/cli/changelog#january-2026) explicitly includes pre-compaction hooks in its January 2026 entry, confirming this adapter in CLI as well as the editor. Its May 2026 entry also confirms skills in interactive, headless, and editor-integration modes.

Cursor's [Agent Skills documentation](https://cursor.com/docs/skills) supports `.agents/skills` at project and user scope and automatically chooses relevant skills. That portable support is independent of hook support.

### GitHub Copilot CLI, cloud, and IDE agent mode

GitHub's [Copilot hook reference](https://docs.github.com/en/copilot/reference/hooks-reference) covers two native surfaces: Copilot CLI and Copilot cloud agent. Its `preCompact` event fires before manual or automatic compaction but is notification-only and provides no token count or context-window size. Cloud fires it only for automatic compaction. `sessionStart` can inject `additionalContext`; cloud runs it once per job as a new session. Cloud hook files come only from the cloned repository, and its filesystem is ephemeral.

GitHub's current [Copilot CLI context-management guide](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/context-management) says background compaction starts at approximately 80% and the CLI waits if usage reaches approximately 95% before it finishes. Copilot also saves its own compaction summaries as session checkpoints viewable with `/session checkpoints`; those are useful supplementary evidence, but they are not the portable Universal Agent Skills schema. The [CLI command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) documents manual `/compact`, `/context`, `/new`/`/clear`, and resume commands, but no absolute auto-compaction threshold setting. Those commands are user- or orchestrator-initiated and do not justify a claim that a skill can launch a fresh session.

IDE support is now more nuanced than the CLI/cloud hook reference. GitHub's current [customization support matrix](https://docs.github.com/en/copilot/reference/customization-cheat-sheet) lists hooks as Preview in VS Code and unsupported in Visual Studio, JetBrains, Eclipse, and Xcode. The separate [VS Code agent-hooks documentation](https://code.visualstudio.com/docs/agent-customization/hooks) includes `PreCompact`, and its [schema reference](https://code.visualstudio.com/docs/agents/reference/hooks-reference) shows only `trigger: "auto"`; it exposes neither token telemetry nor a threshold control. `SessionStart` can add context, but its source is currently always `new`. Thus VS Code merits an opt-in Preview adapter, not a claim of CLI/cloud-equivalent automation.

GitHub's [Agent Skills documentation](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills) supports skills in cloud agent, CLI, the Copilot app, and agent mode in VS Code and JetBrains. The same support matrix marks skill availability by IDE; it should be used rather than a blanket “all IDEs” claim.

### Antigravity CLI and IDE

Antigravity's [Agent Skills documentation](https://antigravity.google/docs/skills) supports workspace skills under `.agents/skills` and product-global skills under `~/.gemini/config/skills`. The separate [CLI migration guide](https://antigravity.google/docs/cli/gcli-migration) names `~/.gemini/antigravity-cli/skills` as the CLI-global path, so setup must distinguish the IDE/product and CLI targets rather than collapsing them. Its documented [hook surface](https://antigravity.google/docs/hooks) contains `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, and `Stop`; it contains no compaction or session-start event and no token fields. `PreInvocation` can inject steps, but cannot reliably identify a post-compaction boundary from the documented payload.

The Antigravity CLI [status-line command](https://antigravity.google/docs/cli/statusline) is the useful v1 telemetry surface: its command runs whenever agent state changes and receives cumulative input/output totals plus `context_window_size`, `used_percentage`, and current-usage detail. A local adapter script can calculate current context use from the latter fields and warn or checkpoint at 155k or the clamped threshold; cumulative session totals must not be mistaken for live context occupancy after compaction. Writing a checkpoint is an inference from the documented ability to run a local command; it is not a native checkpoint API. The published [CLI command reference](https://antigravity.google/docs/cli/reference) documents explicit conversation reset, fork, and resume operations but no compact operation, so v1 must not claim it can force compaction or start a replacement session.

## Installer and update behavior

The source-backed installation command is:

```shell
npx skills@latest add kaizen2026/universal-agent-skills
```

The official [`vercel-labs/skills` README](https://github.com/vercel-labs/skills/blob/c6f69c631292444cc541ac6d91e2226b0ff247da/README.md) documents repository shorthand, project installation by default, `-g`/`--global`, `-a`/`--agent`, repeatable `-s`/`--skill`, `--skill '*'`, and `npx skills update`. Its supported-agent table includes Codex, Claude Code, Cursor, GitHub Copilot, Antigravity, and Antigravity CLI.

Four boundaries matter:

1. The skills CLI installs skill folders; it does not install arbitrary lifecycle hooks or merge host configuration. `setup-universal-agent-skills` must perform that separate opt-in operation.
2. Normal update is lock-based. The current source begins with the names already recorded in the global lock and reinstalls changed entries by passing the individual name back to `add` ([global update source](https://github.com/vercel-labs/skills/blob/c6f69c631292444cc541ac6d91e2226b0ff247da/src/update.ts#L478-L524), [reinstall source](https://github.com/vercel-labs/skills/blob/c6f69c631292444cc541ac6d91e2226b0ff247da/src/update.ts#L672-L706)); project update likewise operates on already-discovered project skills and reinstalls each recorded skill by name ([project update source](https://github.com/vercel-labs/skills/blob/c6f69c631292444cc541ac6d91e2226b0ff247da/src/update.ts#L722-L760), [project reinstall source](https://github.com/vercel-labs/skills/blob/c6f69c631292444cc541ac6d91e2226b0ff247da/src/update.ts#L872-L903)). Therefore `npx skills update` refreshes installed skills but does not automatically install a newly added skill from the upstream repository. Re-run `add` and select it (or use `--skill '*'`) to discover new skills.
3. Non-interactive update, including `-y`, warns about skills deleted upstream but deliberately skips removing their local copies ([deletion source](https://github.com/vercel-labs/skills/blob/c6f69c631292444cc541ac6d91e2226b0ff247da/src/update.ts#L256-L289)). Removal therefore remains an explicit cleanup step.
4. Current global-path mappings have two material documentation drifts. The installer maps Codex to `$CODEX_HOME/skills` (normally `~/.codex/skills`) and Antigravity IDE/product to `~/.gemini/antigravity/skills` ([agent mappings](https://github.com/vercel-labs/skills/blob/c6f69c631292444cc541ac6d91e2226b0ff247da/src/agents.ts#L89-L104), [Codex mapping](https://github.com/vercel-labs/skills/blob/c6f69c631292444cc541ac6d91e2226b0ff247da/src/agents.ts#L210-L216)). Current official docs instead list Codex user skills at [`$HOME/.agents/skills`](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills) and Antigravity product-global skills at [`~/.gemini/config/skills`](https://antigravity.google/docs/skills#where-skills-live). The installer mapping for Antigravity CLI, `~/.gemini/antigravity-cli/skills`, does match its migration guide. Project installs to `.agents/skills` align across these hosts and are the reliable default. For `--global`, setup must verify discovery and report a limitation when the host does not see the installed copy; any compatibility link or copy is a separate, explicit, reversible user-scope action, not something inferred from installer success.

## Threshold policy and reporting

Universal Agent Skills should compute:

```text
effectiveCheckpointThreshold =
  contextWindow < 200000
    ? floor(contextWindow * 0.75)
    : 155000
```

This is a product policy, not a cross-host native compaction guarantee. "Detected" must mean a host-reported/configured value or explicit user input; when the window is unknown, setup must report the clamp as unverified instead of inferring it from a product or model name.

- **Codex:** configure the effective value as the native automatic-compaction threshold.
- **Claude:** for windows of at least 200k, set `CLAUDE_CODE_AUTO_COMPACT_WINDOW=155000` and report 155k as an upper bound, not an exact consumed-token instant. Below 200k, set the auto-compact window to the detected model window (using the 100k minimum value when necessary; Claude caps it to the actual window) and lower `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` to `75`. This targets the 75% policy only in sessions that support proactive compaction and can still fire earlier than 75%; report the detected window and requested percentage as configured targets, not measured enforcement.
- **Cursor:** report the effective policy value, but checkpoint at Cursor's native `preCompact` event because no override is documented.
- **Copilot:** no hook token/window telemetry or threshold override is documented; report the threshold as unenforced and retain manual phase-boundary checkpoints.
- **Antigravity CLI:** calculate against the status-line payload and warn/checkpoint when crossed; the IDE has no documented equivalent telemetry.

## Required product non-claims

Documentation and setup output should say all of the following plainly:

- A skill is an instruction package, not a universal lifecycle controller.
- “155k” can mean an exact Codex threshold, a Claude calculation-window upper bound, an Antigravity CLI watcher target, or merely a desired policy value on Cursor and Copilot.
- No adapter silently starts a fresh host session. Starting, clearing, forking, or resuming a session remains an explicit user or external-orchestrator action.
- Browser capture, accessibility scanning, and cross-browser review are capability-detected. Missing tooling is reported as unverified, never passed.
- Gitignored `.agents/state/continuity/` is local by design and cannot be assumed to survive ephemeral cloud jobs. Tracked design contracts, issues, ADRs, and commits remain the durable cloud/team record.
- Adapter installation is opt-in, merge-preserving, idempotent, and reversible while its local reversal state is available, and remains subject to each host's trust or approval model. If that ignored state is lost, removal must preserve managed-looking configuration for manual recovery rather than guess the prior value.
- Lifecycle hooks preserve or inject previously recorded semantic state and current machine observations; they cannot derive an objective, decision history, or validation meaning that was never checkpointed.

## Open verification items

- Antigravity documents token telemetry for the CLI status line, not for the IDE. Do not generalize it to the IDE.
- Antigravity's official general and CLI migration pages name different global skill directories. Treat them as surface-specific; additionally compensate for the installer's stale Antigravity product mapping during global setup.
- The installer's current Codex global path is absent from Codex's documented discovery locations. Prefer project scope until setup has verified or bridged global discovery.
- GitHub's CLI/cloud hook reference says those are the two native Copilot hook surfaces, while VS Code now has a separate Preview implementation dated 2026-08-05. Test VS Code fixtures independently and treat schema differences as intentional.
- Host documentation changes quickly. Pin adapter fixtures to tested minimum versions and have setup emit a dated capability report rather than relying only on product names.
