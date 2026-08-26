---
"universal-agent-skills": minor
---

Install a Claude Code status line with the `claude` host adapter. The runtime `statusline` command now accepts `--harness claude` and shows live context tokens against the effective smart-zone threshold instead of percent-of-window (which is not an early-warning signal on 1M-context models). The adapter preserves any existing custom `statusLine`, reports that in its limitation text, and removes only its own entry on `remove`. `setup` accepts `--claude-settings <path>` (or `UAS_CLAUDE_SETTINGS`) so tests and CI never write to the real home directory.
