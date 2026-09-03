# Universal Agent Skills

An MIT-licensed derivative of `mattpocock/skills` that preserves the upstream composable engineering workflows and adds contract-driven frontend design plus portable cross-session continuity. Skills are organized into buckets and per-repo configuration is emitted by `/setup-universal-agent-skills`.

## Language

**Issue tracker**:
The tool that hosts a repo's issues — GitHub Issues, Linear, a local `.scratch/` markdown convention, or similar. Skills like `to-tickets`, `to-spec`, and `triage` read from and write to it.
_Avoid_: backlog manager, backlog backend, issue host

**Issue**:
A single tracked unit of work inside an **Issue tracker** — a bug, task, spec, or slice produced by `to-tickets`.
_Avoid_: ticket (use only when quoting external systems that call them tickets, or for a **Decision ticket** — see below)

**Decision ticket**:
A `wayfinder` unit — a child **Issue** of a `wayfinder:map` holding a *question* whose resolution is a decision, not a slice of a build to execute. The **decision** qualifier is what keeps it distinct from an implementation ticket; `wayfinder` introduces the term, then uses "ticket".

**Triage role**:
A canonical state-machine label applied to an **Issue** during triage (e.g. `needs-triage`, `ready-for-afk`). Each role maps to a real label string in the **Issue tracker** via `docs/agents/triage-labels.md`.

**Continuity Epoch**:
One uninterrupted span of agent work between initial session start or reconciled native compaction and the next continuity boundary.

**Work-Item Capsule**:
A small, revisioned semantic record shared by agents collaborating on one **Issue** or explicit objective. It contains the objective, success criteria, current phase, binding decisions, validation state, blockers, one next action, and pointers to tracked authority.

**Continuity Event**:
A machine observation associated with one harness, session, agent, work item, lifecycle event, and capsule revision. It is evidence, not semantic authority.

**Fresh-Session Rollover**:
An outer supervisor's deliberate transition from one completed agent session to a new session using a reconciled **Work-Item Capsule**. It is distinct from native in-session compaction.

## Relationships

- An **Issue tracker** holds many **Issues**
- An **Issue** carries one **Triage role** at a time
- A **Decision ticket** is an **Issue** (a child of a `wayfinder:map`)
- A **Work-Item Capsule** belongs to one **Issue** or explicit objective and spans one or more **Continuity Epochs**
- A **Continuity Event** records evidence about a **Work-Item Capsule** without replacing it
- A **Fresh-Session Rollover** starts a new session only after reconciling a **Work-Item Capsule**

## Flagged ambiguities

- "backlog" was previously used to mean both the *tool* hosting issues and the *body of work* inside it — resolved: the tool is the **Issue tracker**; "backlog" is no longer used as a domain term.
- "backlog backend" / "backlog manager" — resolved: collapsed into **Issue tracker**.
- "handoff" previously covered both native compaction and a new process — resolved: native continuation crosses a **Continuity Epoch** boundary; a new process is a **Fresh-Session Rollover**.
