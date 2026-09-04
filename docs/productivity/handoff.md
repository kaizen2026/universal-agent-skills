## What it does

`handoff` exports a redacted portable copy of live work for a new harness, directory, collaborator, or mid-phase fork. Its defining value is portability; local continuation inside one workspace belongs to `checkpoint-work` and `resume-work`.

## When to reach for it

You invoke this by typing `/handoff` — the agent will not fire it on its own. Pass the destination or next-session focus so the document can name what the receiver needs.

## A portable checkpoint

The handoff carries objective, status, decisions, exact validation, dirty-tree inventory, pointers, risks, one next action, and suggested skills. It references specs, issues, ADRs, contracts, commits, and diffs rather than duplicating them.

It is sourced from the active Work-Item Capsule (`handoff --work-item <id>`, or the bound harness and session) and written in the portable checkpoint schema, so arrival is the same regardless of source: the receiver inspects it with `resume --input` and adopts it with `import-legacy-checkpoint --work-item <id> --input <file>`. A legacy workspace-wide checkpoint can still be exported with `--input`, but nothing is ever imported automatically on the other side.

It contains no raw transcript, credentials, cookies, personal data, or secret-dependent command output. Local-only pointers are labeled so the receiver knows they will not travel through Git.

The export records its own time but preserves the source checkpoint's Git and validation provenance, includes export-time reconciliation, and replaces absolute project and user-home prefixes with portable labels. Old evidence is never relabelled as current merely because the handoff was created later.

## Common questions

**Handoff or checkpoint?**

Checkpoint when the next session sees the same workspace. Handoff when state must cross a boundary the local gitignored file cannot cross.

**What happens on arrival?**

Use [resume-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/resume-work/SKILL.md). It reconciles the exported claims against the destination instead of trusting them blindly.

## It's working if

- The receiver can execute one named next action immediately after reconciliation.
- Durable artifacts remain single-sourced by path or URL.
- The export says which pointers are unavailable outside the source machine.

## Where it fits

This is the portable edge of the continuity trio, beside [checkpoint-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/checkpoint-work/SKILL.md) and [resume-work](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/productivity/resume-work/SKILL.md). The [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md) router uses it only when work must travel.
