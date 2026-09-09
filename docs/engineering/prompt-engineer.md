## What it does

`prompt-engineer` makes one coding conversation the advisor for other coding sessions. It assesses worker evidence and produces the next prompt, ready to paste, so you do not have to repeat the review-and-prompt instruction after every result.

The advisor can join after coding has already happened. It finds the task's report and relevant decisions, checks the evidence, and stays in the advisory role. You can keep the models and effort settings you already prefer; the user does not need to prepare coordination IDs or a special prompt format.

## When to reach for it

Invoke `$prompt-engineer` in Codex or `/prompt-engineer` with Claude's standalone skills. Claude plugin installations use `/universal-agent-skills:prompt-engineer`. The skill can also be selected automatically when you ask what to tell another coding agent next.

- Use it to turn a worker's result into a reviewed next assignment.
- Use it to prepare a bounded task for a less expensive coder.
- Use it to read shared worker reports instead of copying summaries between chats.
- Use [implement](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/implement/SKILL.md) when you want the current session to do the coding itself.

## Prerequisites

Shared reports require both sessions to access the selected project directory. The report helper uses Node.js and no package dependencies. Separate worktrees must be told the shared report location explicitly. Without a report, the advisor can recover relevant task documents and changes, but must label missing evidence; a pasted compact result remains the fallback when files are not shared.

## One assignment, one return path

A prompt identifies the objective, scope, evidence, required checks, escalation conditions, and where the worker reports back. Each worker has its own report file, and every new task has an assignment ID. These let the advisor distinguish an old result from the current task; it must still check the IDs before trusting the result.

The advisor reads compact results and relevant source evidence. Reported success is checked against the assignment, actual code, and validation. Shared report files coordinate conversation; separate worktrees or disjoint write scopes still protect concurrent source edits.

## Common questions

**Can I stop copying the coder's summary into the advisor?**

Yes, when both sessions can read the same directory. A normal [implement](./implement.md) run now saves a compact result even if no advisor was present. Later, say “Luna finished the slug task; review it and tell me what next.” The advisor finds the matching report and source documents. If several tasks match, it asks which one rather than guessing. Other coder workflows need reporting instructions or the compact pasted-result fallback.

**Can it watch without spending frontier-model tokens?**

The local watcher repeatedly checks one selected worker and assignment without model calls. It waits up to five minutes by default, or a shorter duration you request, and returns once: a result ready for review, a blocker needing attention, or a deadline. Working updates, malformed files, and timestamp-only duplicates do not cause repeated reviews. Starting the wait, handling tool results, reviewing code, and writing the next prompt still consume tokens. The host must support keeping the active wait attached to the process; a completed chat does not wake on file changes without a separate integration.

**Can it check again by itself after a few minutes?**

Within the five-minute window, it already checks repeatedly; the AI is not asked the same question each time. After expiry, this version stops. Repeated windows could be added with a separate schedule and an overall stop limit, but that is not enabled here. Asking the AI to start another wait uses model tokens; a deterministic program checking files does not itself call a model.

**It timed out, but the coder says it finished. Is the watcher broken?**

The report may have been published after the wait ended. Watcher results now include start, deadline, finish, and received-report times to help check that. The deadline means no new result was observed during that window, not that the coder is still unfinished. A new on-demand read can recover a later result; it is not evidence that the earlier watch received it.

**Does it know every session I have open?**

It can use supported, project-filtered host discovery when available. Its portable report reader only knows workers that published reports. A reported `working` status is not proof that a session is currently running.

**Will it send prompts or change my worker's model automatically?**

It prepares the prompt and follows your chosen models. Launching or steering another session requires an explicit operating mode and authority. This version installs no session-control service or capture hooks.

## It's working if

- A result followed by “next” produces an assessment and the next usable coder prompt.
- Worker summaries arrive through the agreed files without manual relay.
- A fresh advisor can join after implementation, without an earlier advisor-created assignment.
- A stale assignment, failing check, or missing evidence changes the recommendation.
- Unchanged reports do not trigger repeated expensive analysis.
- Each worker knows what it can edit and when to stop.

## Where it fits

This is a standalone advisor alongside [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md), which routes the larger collection. It can recommend implementation and review workflows to workers, while [checkpoint-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/checkpoint-work/SKILL.md) preserves the advisor's objective and last reviewed assignment across sessions.
