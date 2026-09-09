# Session capabilities and limits

Verified documentation and local command help: 9 September 2026. Detect the installed CLI and read its help before relying on a version-sensitive option. Enumerate only the user-selected project and selected sessions; do not scan all personal transcripts.

## Claude Code

The installed Claude Code 2.1.266 exposes `claude agents --json --cwd <project>`. Its help describes active interactive and background sessions; `--all` adds completed background sessions. This is a read-only discovery option when supported. Use returned identities and statuses rather than inferring activity from a transcript's existence. Consult [agent view](https://code.claude.com/docs/en/agent-view).

For an explicitly enabled future capture adapter, [Stop hooks](https://code.claude.com/docs/en/hooks#stop) can receive `last_assistant_message`. Such a handler can copy/redact/bound a final message without asking another model to summarize it. It must preserve project/session identity, tolerate unavailable fields, and distinguish a turn ending from task completion. No hook is installed by this skill.

## Codex CLI

The installed Codex CLI 0.153.4 exposes `codex agents` as an interactive view of sessions on its shared local app-server daemon. It does not advertise a JSON-list flag. Do not invent one.

Where an existing app-server connection is available, [the documented API](https://learn.chatgpt.com/docs/app-server) supports `thread/list` with a `cwd` filter and `thread/read`. Request metadata first and avoid full turn history unless the selected result requires it. `thread/loaded/list` describes threads loaded by that server; it is not a census of every terminal process. Paginated turn summaries are capability-dependent.

Do not start another daemon, resume an active thread, inject messages, or interrupt a worker merely to inspect status. This first version uses shared reports when a suitable read-only connection is absent. Session discovery and command availability do not prove that a separate running terminal can be controlled safely.

## Costs and automation

- File checks and deterministic event handlers need no model calls.
- Generating a summary with a model, reviewing evidence, and drafting the next prompt consume model tokens. Avoid numeric cost promises without observed usage and current pricing.
- The worker can write its report as part of its existing turn, eliminating manual summary transfer but adding a small amount of output work.
- Continuous advisor wake-up requires a host notification/queue integration. Automatically launching or steering workers is a separate operating mode requiring an explicit execution and budget policy.

Retain copy/paste and shared-report operation across hosts. A skill teaches the workflow; it does not itself supply a universal session-control API.
