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

## Blocking relationships

Prefer GitHub's native issue dependencies. If the dependency API is unavailable, put `Blocked by: #<number>` at the top of the blocked issue and treat it as actionable only after every listed blocker closes.

