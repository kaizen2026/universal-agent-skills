# Continuity checkpoint schema v1

Write all headings in this order. Keep content human-readable Markdown.

```markdown
---
schemaVersion: 1
timestamp: <ISO-8601 UTC>
originatingHarness: <codex|claude|cursor|copilot|antigravity|other>
event: <phase-boundary|decision|pre-compact|interruption|manual|threshold-warning|handoff>
status: <in-progress|blocked|ready-for-review|complete>
gitHead: <commit or unavailable>
validationGitHead: <commit or unavailable>
validationTimestamp: <ISO-8601 UTC or unavailable>
---

# Continuity checkpoint

## Objective and success criteria
## Current phase and completion status
## Decisions and rejected alternatives
## Completed work and validation
## Dirty working tree
## Pointers
## Remaining risks and blockers
## Next action
## Suggested skills and resume instructions
```

Under **Completed work and validation**, include exact commands, exit status, and salient result. Under **Dirty working tree**, list Git status entries or state `Clean`; never imply uncommitted work is committed. Under **Pointers**, link artifacts, issues, design contracts, commits, and logs rather than duplicating them.

Headings are ordered and the enumerated metadata values are closed in schema v1. Automatic hooks may add `lastObservedAt`, `lastObservedHarness`, and `lastObservedEvent`; those fields record that the hook ran without changing the provenance of semantic claims or validation.

The v1 runtime marks checkpoints older than seven days as `Changed` during reconciliation. This is a review boundary, not automatic deletion; the user can confirm the old claims and write a fresh checkpoint.
