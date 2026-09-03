# Work-Item Capsule schema v1

Write all headings in this order. Keep content human-readable Markdown.

```markdown
---
schemaVersion: 1
workItemId: <issue-or-objective-id>
revision: <non-negative integer>
updatedAt: <ISO-8601 UTC>
updatedByHarness: <codex|claude|cursor|copilot|antigravity|other>
updatedBySession: <session-id|manual>
gitHead: <commit or unavailable>
---

# Work-Item Capsule

## Objective
## Success criteria
## Current phase
## Binding decisions
## Validation state
## Blockers
## Next action
## Authority pointers
```

Under **Validation state**, include exact commands, exit status, and salient result. Under **Authority pointers**, link artifacts, issues, design contracts, commits, and logs rather than duplicating them.

Headings are ordered and the capsule is stored at `.agents/state/continuity/work-items/<work-item-id>/semantic.md`. The revision increases on every successful semantic write. Session bindings live separately under `bindings/<harness>/<session-id>.json` so identity resolution does not depend on a global latest pointer.

Every semantic write supplies the revision it read as `--expected-revision <n>`. The runtime holds `.update.lock/` across the revision check and atomic replacement. Lock acquisition waits five seconds by default (or the bounded `--lock-timeout-ms` value) and fails closed: it never steals an existing lock. For recovery, inspect `.update.lock/owner.json`, verify that the recorded process is no longer running, and remove the lock directory manually before retrying.

A revision mismatch leaves `semantic.md` unchanged and writes one proposal under `proposals/`. Proposal schema v1 records `workItemId`, `baseRevision`, `currentRevision`, `createdAt`, `provenance` (`harness` and `sessionId`), redacted semantic `fields`, and a `truncated` flag. Proposal semantic fields are capped at 12,000 characters in total. Reconcile a proposal with the current capsule before submitting a new compare-and-swap update.

Workspace-wide `current.md` and `history/` use the legacy checkpoint schema. They remain readable through an explicit input path, but never activate a Work Item ID automatically.
