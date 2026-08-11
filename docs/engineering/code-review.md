## What it does

`code-review` reviews the complete surface from a fixed point through independent lanes: commits plus staged, unstaged, and untracked work. **Standards** checks repository conventions and a smell baseline, **Spec** checks the originating requirements, and **Frontend** invokes rendered UI review when the change affects a frontend surface.

The lanes are never blended or re-ranked. A clean implementation can still build the wrong thing, and code that matches the spec can still fail on mobile or keyboard use.

## When to reach for it

Type `/code-review`, or the agent reaches for it when asked to review a branch, pull request, or change since a commit, tag, branch, or merge base.

## Prerequisites

Supply a fixed point; `implement` records and supplies its starting `HEAD` automatically. Spec review needs an issue or spec path; without one it reports `no spec available`. Frontend review needs a runnable surface for full coverage and reports missing browser or accessibility tooling as unverified.

## Independent lanes

| Lane | Source of truth | Key output |
| --- | --- | --- |
| Standards | Repository standards plus the Fowler smell baseline | Hard rule breaches separated from judgment calls |
| Spec | Originating issue or spec | Missing, partial, wrong, or extra behavior |
| Frontend | Approved design contract, design system, and rendered behavior | Findings, verified checks, and unverified capabilities |

## Common questions

**Does every change run the frontend lane?**

No. It is explicitly `not applicable` when no route, component, style, content, or browser behavior changed.

**Can one passing lane approve the change?**

No. Each lane keeps its own worst issue and count so one kind of correctness cannot hide another.

**Does it see changes that have not been committed yet?**

Yes. The review surface combines the fixed-point-to-`HEAD` diff, staged and unstaged diffs, and direct inspection of every untracked file. It fails only when that combined surface is empty.

## It's working if

- Findings remain grouped under `Standards`, `Spec`, and applicable `Frontend` headings.
- Standards findings cite a repository rule or named smell; Spec findings quote the requirement.
- Frontend output names every unverified capability instead of claiming a pass.

## Where it fits

This is the close-out step used by [implement](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/implement/SKILL.md). Its rendered lane delegates to [frontend-review](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/frontend-review/SKILL.md), and [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md) maps the larger chain.
