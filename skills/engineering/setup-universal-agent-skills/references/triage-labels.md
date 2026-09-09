# Triage-role seed

Write the role-to-label mapping in `docs/agents/triage-labels.md` when `triage` is installed. Use existing labels where they express the same role; otherwise use these defaults:

Category roles:

- `bug`: something is broken.
- `enhancement`: a new feature or improvement.

State roles:

- `needs-triage`: maintainer evaluation is required.
- `needs-info`: the reporter must supply missing information.
- `ready-for-agent`: the work is specified and available for agent implementation.
- `ready-for-human`: the next action requires human participation.
- `wontfix`: the issue will not be actioned.

Each triaged issue carries one category and one state. Conflicting states need a maintainer decision before changes. Record both the canonical role and actual tracker label when they differ. Preserve the mapping on repeated setup. Writing this document does not create labels in a remote tracker; label publication requires an applicable user request.
