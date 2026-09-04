---
name: handoff
description: Export a redacted, portable continuation document for another harness, directory, session, collaborator, or mid-phase fork.
argument-hint: "Who or what will receive the handoff?"
disable-model-invocation: true
---

Export a portable handoff from the current work state. Use this when the receiver cannot read the local gitignored checkpoint directly; use `/checkpoint-work` for continuity inside the same workspace and `/resume-work` to reconcile on arrival.

First checkpoint the active Work-Item Capsule (`/checkpoint-work`) only if a meaningful phase boundary or consequential decision has occurred, so the export carries current state. Reconcile it against current Git status before export.

Write the handoff to the user's requested path, or to a clearly named file in the operating system's temporary directory when no path is supplied. If the continuity runtime exists, prefer its `handoff` command so reconciliation and redaction use the same schema: `handoff --work-item <id>` (or the bound `--harness` and `--session`) exports the capsule; `--input <path>` exports a legacy workspace-wide checkpoint instead. The source is always named explicitly — a bare `handoff` is rejected rather than silently selecting the workspace-wide file. Either way the file is a portable checkpoint document, so the receiver inspects it with `resume --input` and adopts it explicitly with `import-legacy-checkpoint --work-item <id> --input <file>`; nothing on arrival happens automatically.

Include:

- Objective, success criteria, current phase, and completion status
- Decisions and rejected alternatives
- Completed work with exact validation results
- Dirty-working-tree inventory
- Pointers to artifacts, issues, design contracts, commits, and branches
- Risks, blockers, one concrete next action, and suggested skills
- Source and destination harness/directory when known
- Schema version and timestamp

Do not copy the body of existing specs, issues, ADRs, design contracts, commits, or diffs; link or point to them. Do not include raw transcripts. Redact secrets, credentials, cookies, personal data, and sensitive command output. If a pointer is local-only or gitignored, label it so the receiver knows it will not travel through Git.

Preserve the source checkpoint's semantic Git and validation provenance. Record export time separately and include the export-time reconciliation; never rewrite an old validation claim so it appears to belong to the current `HEAD`. Replace absolute project and user-home prefixes with portable labels in the exported copy.

If the user passed arguments, use them to tailor the receiver, destination, and next-session focus. Report where the handoff was written and which local-only pointers the receiver must obtain separately.
