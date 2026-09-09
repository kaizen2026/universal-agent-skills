# Issue tracker: GitHub

Replace `<owner>/<repo>` with the confirmed repository in every command before writing the consumer document. Pin all operations with `-R <owner>/<repo>`; the working directory alone is not authority when several repositories are open.

## Operations

- Read: `gh issue view <number> -R <owner>/<repo> --comments`.
- List: `gh issue list -R <owner>/<repo> --state open --json number,title,body,labels,assignees`.
- Create: `gh issue create -R <owner>/<repo> --title <title> --body-file <file>`.
- Comment: `gh issue comment <number> -R <owner>/<repo> --body-file <file>`.
- Label: `gh issue edit <number> -R <owner>/<repo> --add-label <label>`.
- Close: `gh issue close <number> -R <owner>/<repo>`.

Write multiline content to a file and pass `--body-file`; never interpolate arbitrary prose into shell code. Publish only when the current task requests it.

## Pull requests as a triage surface

PRs as a request surface: no, unless the maintainer enables it. If enabled, resolve whether an identifier names an issue or PR and use the corresponding `gh pr` operations and configured triage roles.

## Wayfinding operations

- **Map:** one issue labelled `wayfinder:map`, containing Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child:** create an issue, then attach it through GitHub sub-issues. If unavailable, put `Part of #<map>` in its body and link it in a task list on the map. Apply `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- **Blocking:** resolve the blocker database ID with `gh api repos/<owner>/<repo>/issues/<number> --jq .id`, then use `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<database-id>`. The database ID is not the visible issue number or GraphQL node ID.
- **Fallback blocking:** if the API is unavailable, write `Blocked by: #<number>, #<number>` in the child. Record which representation is authoritative; do not silently ignore a failed dependency write.
- **Frontier:** enumerate open children; exclude assigned issues and those with an open blocker. Read native blockers with `gh api --paginate repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by` and inspect their states; for body-based blocking, read each referenced issue's state. Missing or inaccessible dependency evidence is unresolved, not unblocked.
- **Claim:** assign the issue to the driving developer with `gh issue edit <number> -R <owner>/<repo> --add-assignee <login>` and re-read the assignment. This is cooperative ownership, not an atomic lock.
- **Resolve:** post the resolution, close the child, then append its name, link, and one-sentence decision to the map. Create new issues before wiring their dependencies.

When a skill says to publish, create an issue. When it says to fetch a ticket, read the issue and relevant comments. Keep the map an index; decisions live with their issues.

Verify version-sensitive dependency behavior against [GitHub's issue dependency API](https://docs.github.com/en/rest/issues/issue-dependencies).
