# Issue tracker: GitHub

Issues and specifications for this repository live in `kaizen2026/universal-agent-skills` on GitHub. Pin every `gh` command with `-R kaizen2026/universal-agent-skills`; repository inference is not authoritative for this project.

## Operations

- Create: `gh issue create -R kaizen2026/universal-agent-skills`
- Read: `gh issue view -R kaizen2026/universal-agent-skills <number> --comments`
- List: `gh issue list -R kaizen2026/universal-agent-skills`
- Comment: `gh issue comment -R kaizen2026/universal-agent-skills <number>`
- Label: `gh issue edit -R kaizen2026/universal-agent-skills <number> --add-label <label>`
- Close: `gh issue close -R kaizen2026/universal-agent-skills <number>`

When a skill says to publish to the **Issue tracker**, create a GitHub issue in this pinned repository. Pull requests are excluded from triage unless a maintainer explicitly changes this convention.

## Wayfinding operations

- Map: one GitHub issue labelled `wayfinder:map`, containing Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- Children: use GitHub sub-issues; if unavailable, link children in a task list and put `Part of #<map>` in each child body. Use `wayfinder:<research|prototype|grilling|task>` labels.
- Blocking: follow the native dependency convention below. Resolve each blocker database ID with `gh api repos/kaizen2026/universal-agent-skills/issues/<number> --jq .id`; it is not the issue number.
- Frontier: open children with no assignee and no open blockers. Read native blockers using `gh api --paginate repos/kaizen2026/universal-agent-skills/issues/<number>/dependencies/blocked_by`, or inspect referenced blocker states for the body convention. Missing dependency evidence is unresolved.
- Claim: `gh issue edit -R kaizen2026/universal-agent-skills <number> --add-assignee <developer>`; read back the assignment before working. Assignment is cooperative ownership.
- Resolve: comment with the decision and evidence, close the child, then append its name, link, and a short decision to the map. Publish multiline bodies using `--body-file`.

## Blocking relationships

Prefer GitHub's native issue dependencies. If the dependency API is unavailable, put `Blocked by: #<number>` at the top of the blocked issue and treat it as actionable only after every listed blocker closes.
