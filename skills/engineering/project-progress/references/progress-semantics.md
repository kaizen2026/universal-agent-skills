# Project-progress evidence semantics

Use this reference when translating project artifacts into the dashboard model.

## The classification rule

Classify the strongest claim that direct repository or tracker evidence supports. Absence of evidence is not evidence of completion. When sources conflict, show the lower confirmed state and describe the conflict.

| Stage | Positive evidence | Does not qualify |
| --- | --- | --- |
| `defined` | Approved decisions, scope, ownership, acceptance rules, or a build-ready specification | A brainstorm, open question, file count, or unapproved recommendation |
| `designed` | An approved visual, interaction, data, interface, or architecture contract | A screenshot without approval, a mood board, or prose that omits acceptance behavior |
| `prototyped` | A deliberately throwaway artifact that was exercised to answer a named question | Production-intended code, an unrun sketch, or generated markup with no recorded question |
| `implemented` | Production-intended code wired through the capability's real authority boundaries | A mock, placeholder navigation, fake authentication, seed-only UI, or historical experiment |
| `validated` | Current tests or browser/system evidence exercise the relevant real boundaries and pass | Compilation alone, stale test output, or unit tests that bypass the integration being claimed |
| `operational` | Deployment, ownership, monitoring, recovery, and acceptance evidence exist for the current version | Infrastructure plans, an unused pipeline, or a live unrelated site |

## State values

Every stage uses one of these values:

- `complete` — the stage's required evidence is present and current.
- `partial` — useful evidence exists, but the stage is not complete for the named workstream.
- `in-progress` — current work is actively advancing the stage.
- `next` — the stage is the recommended immediate boundary.
- `blocked` — an explicit dependency prevents progress.
- `not-started` — no qualifying evidence was found.
- `not-applicable` — the stage genuinely does not apply; include the reason.
- `unknown` — the agent could not verify the state.

Use `unknown`, not `not-started`, when evidence may exist outside the accessible repository or tracker. Use `not-started` only when project sources affirm the lane has not begun or the search is sufficiently complete to support that claim.

## Ticket and frontier semantics

Ticket state is a different axis from delivery maturity.

- **Claimed** — open or in-progress work assigned to an actor.
- **Frontier** — open, unassigned work whose recorded blockers are all closed.
- **Blocked** — open, unassigned work with at least one unresolved recorded blocker.
- **Closed** — a resolved tracker item. It advances only the delivery stage its question or acceptance evidence actually addressed.

For local Markdown maps, the bundled renderer recognizes the common fields `Status:`, `Assignee:`, and `Blocked by:`. It follows relative Markdown links in the blocker field when possible. If a tracker uses another format, capture a verified snapshot in the model rather than pretending the parser understood it.

## Percentages

Percentages are allowed only for homogeneous, mechanically countable things with a clear denominator, such as `8 of 10 migration scripts applied` or `42 of 50 acceptance cases passing`. Label the denominator beside the number.

Never average stages, workstreams, story points, ticket counts, or subjective weights into an overall completion percentage. Use the stage matrix and route instead.

## Evidence links

Every positive workstream claim should link to the smallest authoritative evidence:

- a map for the map's scope and decision index;
- the exact issue for a decision;
- an approved design contract rather than its screenshots alone;
- a production entry point plus relevant test for implementation and validation;
- a deployment or runbook record for operational claims.

Label historical, throwaway, generated, stale, and external evidence explicitly. Never let the link's presence imply a stronger claim than its label.
