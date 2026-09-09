# Issue tracker: local Markdown

Use `.scratch/<feature>/issues/<NN>-<slug>.md`, one issue per file. Preserve an existing local convention. Keep `.scratch/` ignored unless the user elects to share it through Git; ignored files do not travel to another checkout or cloud session.

## Operations

- Create a file with a stable ID, title, objective, acceptance criteria, `Status`, `Assignee`, `Blocked by`, and source-spec pointers.
- Read the full file and relevant resolution records before changing status. Use role strings from `docs/agents/triage-labels.md`.
- Close by setting `Status: closed` and recording the result and evidence. A proposed fix is not completion.
- Preserve IDs across title changes; do not renumber existing issues.

## Wayfinding operations

- **Map:** `.scratch/<feature>/map.md`, with `Type: wayfinder:map` and Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child:** an issue file linked to the map with `Type: wayfinder:<research|prototype|grilling|task>`.
- **Blocking:** `Blocked by: 01, 03` or `Blocked by: none`. Every named blocker must be closed; a missing blocker file is unresolved.
- **Frontier:** open children with no open blockers and no assignee. Do not infer completion from filename order.
- **Claim:** record the driving developer/session in `Assignee`, then re-read it. Claims are cooperative; concurrent writers need separate assignments/worktrees.
- **Resolve:** add a dated resolution and evidence to the child, close it, then append a linked decision to the map. Keep uncertainty in the map until it becomes a precise issue.

Give separate worktrees an explicit shared issue location or export the required files; ignored `.scratch` files do not travel with a branch.
