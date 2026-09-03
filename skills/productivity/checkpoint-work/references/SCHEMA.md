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

Workspace-wide `current.md` and `history/` use the legacy checkpoint schema. They remain readable through an explicit input path, but never activate a Work Item ID automatically.
