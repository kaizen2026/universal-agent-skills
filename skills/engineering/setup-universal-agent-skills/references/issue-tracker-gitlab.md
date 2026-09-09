# Issue tracker: GitLab

Replace `<namespace>/<project>` with the confirmed project and record the hostname for a self-hosted instance. Pin `glab` commands with `-R`; verify flags against the installed CLI before a write.

## Operations

- Read and list with `glab issue view` and `glab issue list`.
- Create with `glab issue create`; comment with `glab issue note`; apply labels with `glab issue update`; close with `glab issue close`.
- Preserve multiline content through the CLI's supported file/stdin mechanism. Do not interpolate arbitrary prose into shell code.
- Record visible issue IIDs separately from API project/issue IDs.
- Merge requests as a triage surface: no, unless explicitly enabled. If enabled, use the corresponding `glab mr` operations and the same triage roles.

## Wayfinding operations

- **Map:** an issue labelled `wayfinder:map`, with Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child:** a linked issue labelled `wayfinder:<research|prototype|grilling|task>`. Use native hierarchy where supported, otherwise a task list plus `Part of #<map>`.
- **Blocking:** use native issue links with `blocks`/`is_blocked_by` when supported, and verify direction by reading back the link. Otherwise use `Blocked by: #<iid>` in the child and record the fallback convention.
- **Frontier:** open children with no assignee or open blockers. An unsupported relationship is not an absent dependency.
- **Claim:** assign the driving developer and re-read the issue before starting.
- **Resolve:** post the decision and evidence as a note, close the child, and append a linked decision to the map.

Record verified commands for this GitLab instance in the consumer document. Preserve tracker choices on repeated setup.
