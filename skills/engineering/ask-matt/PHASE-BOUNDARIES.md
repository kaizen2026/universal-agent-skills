# Phase boundaries

A **phase** is a coherent chunk of work inside a session: discovery, design, implementation, or QA. A boundary is the point where that chunk is complete enough to state what changed and what comes next.

Use checkpoints only at meaningful boundaries, after consequential decisions, before host compaction, or before interruption. They are a safety layer, not something to rewrite after every message.

## The ordered decision

Work top to bottom. The first yes wins.

1. **Can you continue safely in this session?** Continue when the next phase needs this conversation as a primary source and the host reports enough context capacity. This loses nothing.
2. **Is the current context irrelevant to the next phase?** If so, use the host's explicit clear or new-session operation. The old session may remain resumable, but that behavior is host-specific.
3. **Must the work travel?** Activate the issue or explicit objective as a Work Item ID, create `/checkpoint-work`, then `/handoff` when moving to another harness, directory, cloud job, collaborator, or isolated side task. The handoff is a redacted portable copy; it points to tracked sources instead of duplicating them.
4. **Can a bounded side task run independently?** Delegate it and keep this session intact. Give the worker stable artifact and commit pointers, not conversational memory alone.
5. **Does relevant work need a smaller context in this same host?** Activate and bind its Work Item ID, create `/checkpoint-work`, then use the host's supported compaction lifecycle. On continuation, run `/resume-work` with the explicit ID or current session binding, or rely on a configured adapter's reconciliation context.
6. **Is the host unable to compact or preserve local state?** Export `/handoff`, start the replacement session explicitly, and reconcile there. A skill cannot universally launch that session.

## Context moves and their cost

| Move | Carries full conversation? | Durable state | Host dependency |
| --- | --- | --- | --- |
| Continue | Yes | None required | Context capacity |
| Clear or new session | No | Tracked artifacts only unless checkpointed | Command and resume behavior |
| Checkpoint | No | Local, revisioned, gitignored Work-Item Capsule | None beyond file access |
| Handoff | No | Redacted portable Markdown | None beyond file access |
| Delegation | No | Worker report and referenced artifacts | Agent support |
| Native compaction | No; the host summarizes | Checkpoint plus host summary | Hook and compaction support |

Every move except Continue turns the live conversation into a secondary source. Before a lossy move, record decisions, exact validation, dirty-tree state, pointers, risks, and one concrete next action. Do not persist raw transcripts or secrets.

## Host capability matters

Codex can enforce the configured token threshold and reinject reconciliation after compaction. Claude Code exposes equivalent lifecycle events but controls the actual proactive timing. Cursor and Copilot fire native pre-compaction hooks without accepting this project's absolute threshold. Antigravity CLI can provide status-line telemetry, while Antigravity IDE has no documented compaction signal. Run `/setup-universal-agent-skills` for the current capability report; never treat a portable `SKILL.md` as a universal compaction command.
