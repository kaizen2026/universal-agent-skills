## What it does

`prompt-engineer` makes one coding conversation the advisor for other coding sessions. It assesses worker evidence and produces the next prompt, ready to paste, so you do not have to repeat the review-and-prompt instruction after every result.

The advisor inspects and directs; the selected worker performs the implementation. You can keep the models and effort settings you already prefer. The skill's value is a precise assignment and return path, not a fixed model ranking.

## When to reach for it

Invoke `$prompt-engineer` in Codex or `/prompt-engineer` with Claude's standalone skills. Claude plugin installations use `/universal-agent-skills:prompt-engineer`. The skill can also be selected automatically when you ask what to tell another coding agent next.

- Use it to turn a worker's result into a reviewed next assignment.
- Use it to prepare a bounded task for a less expensive coder.
- Use it to read shared worker reports instead of copying summaries between chats.
- Use [implement](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/implement/SKILL.md) when you want the current session to do the coding itself.

## Prerequisites

Copy/paste operation needs only an objective and a worker result. Shared reports require both sessions to access an agreed project directory. The optional reader/watcher uses Node.js and no package dependencies. Separate worktrees must be told the shared report location explicitly.

## One assignment, one return path

A prompt identifies the objective, scope, evidence, required checks, escalation conditions, and where the worker reports back. Each worker has its own report file, and every new task has an assignment ID. These let the advisor distinguish an old result from the current task; it must still check the IDs before trusting the result.

The advisor reads compact results and relevant source evidence. Reported success is checked against the assignment, actual code, and validation. Shared report files coordinate conversation; separate worktrees or disjoint write scopes still protect concurrent source edits.

## Common questions

**Can I stop copying the coder's summary into the advisor?**

Yes, when both sessions can read the same directory. Every generated assignment tells the worker to write a compact report there. Ask the advisor for the next prompt and it reads the report. Remote sessions need an explicitly configured transport or the pasted-result fallback.

**Can it watch without spending frontier-model tokens?**

The local watcher checks for a changed report without model calls. Reading the resulting tool output, reviewing code, and generating the next prompt still consume tokens. The default is on-demand refresh; a bounded watch is available when requested. A completed chat does not wake on file changes without a host integration.

**Does it know every session I have open?**

It can use supported, project-filtered host discovery when available. Its portable report reader only knows workers that published reports. A reported `working` status is not proof that a session is currently running.

**Will it send prompts or change my worker's model automatically?**

It prepares the prompt and follows your chosen models. Launching or steering another session requires an explicit operating mode and authority. This version installs no session-control service or capture hooks.

## It's working if

- A result followed by “next” produces an assessment and the next usable coder prompt.
- Worker summaries arrive through the agreed files without manual relay.
- A stale assignment, failing check, or missing evidence changes the recommendation.
- Unchanged reports do not trigger repeated expensive analysis.
- Each worker knows what it can edit and when to stop.

## Where it fits

This is a standalone advisor alongside [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md), which routes the larger collection. It can recommend implementation and review workflows to workers, while [checkpoint-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/checkpoint-work/SKILL.md) preserves the advisor's objective and last reviewed assignment across sessions.
