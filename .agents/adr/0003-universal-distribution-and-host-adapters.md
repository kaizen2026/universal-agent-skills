# Universal distribution and opt-in host adapters

This derivative keeps the skills CLI as the primary cross-host distribution and rebrands the direct Claude Code plugin as an optional managed path. It supersedes the distribution recommendation in ADR 0002 for this repository without rewriting that upstream historical record.

Host automation is installed by `setup-universal-agent-skills`, never by skill discovery alone. Adapters use project-local configuration except for Antigravity CLI's documented user-level status-line setting. They preserve unrelated settings, record only non-sensitive reversal metadata, and leave host trust decisions to the user. An existing Antigravity custom status line is never replaced automatically; setup reports that manual composition is required.

The continuity guarantee has three distribution tiers: portable skill guidance everywhere, an explicit checkpoint/resume/handoff runtime, and optional native adapters. Within the native tier, lifecycle and threshold capabilities still differ: Claude controls timing, Cursor and Copilot retain native compaction, Antigravity CLI provides telemetry only, and Codex exposes a directly configurable threshold. No adapter starts a replacement session or runs a daemon.
