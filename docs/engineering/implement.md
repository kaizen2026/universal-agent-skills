## What it does

`implement` builds work that has already been decided. You point it at a [ticket](https://www.aihero.dev/ai-coding-dictionary/ticket), a [spec](https://www.aihero.dev/ai-coding-dictionary/spec), or the plan you just agreed in the conversation, and it writes the code, drives [tdd](https://aihero.dev/skills-tdd) at the seams, typechecks as it goes, runs [code-review](https://aihero.dev/skills-code-review) at the end, and commits to the current branch.

It implements settled decisions instead of reopening the design. A genuinely ambiguous task reference or missing authority still needs clarification. It respects instructions such as “do not commit,” and saves a compact result for a later adviser without requiring you to ask for a report. That is what separates it from typing "build this" at a fresh [agent](https://www.aihero.dev/ai-coding-dictionary/agent).

Visible progress is part of a normal run: it derives a small checklist from the task, keeps the available native task view current, and saves milestone progress for another session to read. You do not need a specially numbered task prompt to request that behavior.

## When to reach for it

You invoke this by typing `/implement` — the agent won't reach for it on its own. It ships with `disable-model-invocation: true`, so no other skill can call it either. Wherever [ask-matt](https://aihero.dev/skills-ask-matt) or [to-tickets](https://aihero.dev/skills-to-tickets) says "then `/implement` per ticket", that is an instruction to you, not something the agent will do unprompted.

Where the work currently lives decides whether this is the right skill:

| The work is… | Reach for |
| --- | --- |
| A ticket on the tracker | `/implement #42`, one ticket per [session](https://www.aihero.dev/ai-coding-dictionary/session), [clearing](https://www.aihero.dev/ai-coding-dictionary/clearing) context between tickets |
| A spec, not yet split up, and the build spans sessions | [to-tickets](https://aihero.dev/skills-to-tickets) first, then `/implement` per ticket |
| A spec, and the build is small | `/implement` directly against the spec |
| Only in the conversation you just had, and it's still small | `/implement` right there, in the same window |
| Not written down anywhere yet | [grill-with-docs](https://aihero.dev/skills-grill-with-docs), or [grill-me](https://aihero.dev/skills-grill-me) if there's no codebase |
| One concrete behaviour you want test-first, with no spec | [tdd](https://aihero.dev/skills-tdd) directly |
| Already built, and you want it checked | [code-review](https://aihero.dev/skills-code-review) directly |

The same-session case is supported: a settled plan in the thread is valid input. The report identifies its source as the conversation rather than inventing a spec file.

## Prerequisites

`implement` normally commits to the branch you are on; explicit no-commit instructions take precedence. It does not push without authority. Check the branch before starting. The optional local report helper needs Node.js; if reporting is unavailable, the final reply says so and includes a compact fallback. It installs no hooks and changes no AI settings.

If the tickets came from [to-tickets](https://aihero.dev/skills-to-tickets), the tracker they live on was configured by [setup-universal-agent-skills](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/setup-universal-agent-skills/SKILL.md). `code-review` reads the same configuration to find the originating spec at close-out. Frontend work governed by an approved `docs/design/<feature>/DESIGN.md` uses [frontend-build](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/frontend-build/SKILL.md). A prescribed maintenance change that introduces no visual decision does not need a new contract; an unresolved new direction returns to `frontend-design`.

## What one run does

A run is six beats, in order:

1. Resolve the task, record starting `HEAD` and existing dirty changes, create its small local working report, and initialize the task checklist. An unborn branch stays `unknown`; no commit is invented.
2. For governed frontend work, invoke [frontend-build](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/frontend-build/SKILL.md) against the approved design contract; route only an unresolved visual decision back to `frontend-design`.
3. Drive [tdd](https://aihero.dev/skills-tdd) at the pre-agreed seams, one red-green slice at a time.
4. Typecheck often, run single test files as it goes.
5. Run the full test suite once, at the end.
6. Run [code-review](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/code-review/SKILL.md) against the recorded fixed point, including staged, unstaged, untracked, and committed changes plus its independent frontend lane when UI changed. Resolve blocking findings, rerun affected checks, commit if allowed, and publish the result with check evidence, review findings, source pointers, and remaining blockers.

One run covers one ticket. The tickets [to-tickets](https://aihero.dev/skills-to-tickets) produces are tracer-bullet vertical slices sized to fit a single fresh [context window](https://www.aihero.dev/ai-coding-dictionary/context-window), so the intended rhythm is: clear context, implement one ticket, commit, clear again. Each ticket is self-contained, which is what makes the previous ticket's context disposable.

The checklist follows this task's actual scope, not a compulsory six-item template. It updates at meaningful step changes and keeps completed, current, upcoming, and blocked work visible. The shared worker report owns the recorded progress; a checked item does not independently prove tests or close a tracker ticket.

## Pre-agreed seams

The idea the skill runs on is the **seam**: the public boundary you observe behaviour at, without reaching inside. Tests live at seams. Working at a seam agreed before any code is written is what keeps the tests durable, because the implementation underneath can be rewritten without the tests moving.

The word "pre-agreed" is doing real work, and it is also the skill's weakest joint. Nothing inside `implement` agrees the seams. `tdd` is the skill that asks, and it refuses to write a test at an unconfirmed seam. So in practice the agreement happens either upstream in the spec, or in the first exchange of the run. If it happens nowhere, the precondition never fires and the run quietly becomes "just write the code". Naming the seams in the spec is what stops that.

## Common questions

**Why does Claude sometimes show a task checklist, but ordinary prompting does not?**

The native task tools create that display; numbered prose alone does not guarantee it. `implement` now explicitly uses the available Task tools and keeps their steps in the shared report. Claude's [task-list view](https://code.claude.com/docs/en/interactive-mode#task-list) can be shown or hidden with `Ctrl+T`.

**Will this still work when I switch between Claude Code and Codex?**

- With native Task or plan tools, the skill updates that host's checklist. The layouts need not match.
- Without those tools, it saves the same shared progress and gives short Done / Now / Next / Blocked updates in chat.
- If shared file writes are unavailable too, it says so and keeps a compact chat fallback.

Some Claude model/session configurations [omit the task tools](https://code.claude.com/docs/en/tools-reference#task-tool-availability). The skill reports that limitation without changing your settings. Both adviser and coder need the updated helper to read new structured progress; existing older reports remain readable.

**Will each checkbox change wake the adviser and spend more tokens?**

No. Normal in-progress updates do not trigger the result watcher. The coder saves progress when steps change, not every few seconds. You can ask the adviser for progress at any time; a finished or blocked report remains the review boundary. The coder's updates and adviser reads still use tokens, so this is not a zero-cost feature.

**It finished, but my ticket is still open and the acceptance criteria are still unchecked.**

Correct, and expected. `implement` has no tracker-completion step. It resolves blocking `code-review` findings before the commit, but it never closes the work item or ticks the `- [ ]` boxes on the originating issue. Close the ticket and reconcile the criteria yourself. This bites hardest on a dependency chain, because `to-tickets` defines the frontier as tickets whose blockers are all closed. If nothing gets closed, nothing ever becomes visibly unblocked.

**Can I point it at all my tickets at once, or run several in parallel?**

No. One invocation, one ticket. Batch dispatch across a ticket queue and [subagent](https://www.aihero.dev/ai-coding-dictionary/subagent) fan-out are both requested repeatedly, and neither exists. Running several `/implement` sessions side by side in one checkout is worse than unsupported: one field report describes a `git commit --amend` in one session landing on another session's commit, a stash vanishing from `refs/stash`, and commits landing on the wrong branch, all in a single afternoon across three issues. The sessions share one working directory, one index, and one HEAD. Git worktrees are the community workaround, and note that `refs/stash` is shared across worktrees too, so worktrees alone do not fix the stash case. If you want parallelism today, you are assembling it yourself.

**Can it open a pull request instead of committing?**

Not built in. It commits straight to the current branch, which several people find too eager: the code lands before they have had a chance to verify it works. There is no configuration flag and no PR mode. People override it in the invocation ("commit to a branch and open a PR") or by editing their local copy of the skill.

**Does `code-review` see my changes before the final commit?**

Yes. `implement` records the starting `HEAD`, and `code-review` combines the committed diff from that point with staged changes, unstaged changes, and direct inspection of untracked files. That keeps review before the final commit without losing work-in-progress files.

Separately, some people deliberately do not want the review inside the run at all, because an agent reviewing the code it just wrote is biased toward its own solution. Running [code-review](https://aihero.dev/skills-code-review) in a fresh session against a fixed point is a legitimate alternative, and is the same reason that skill runs its applicable Standards, Spec, and Frontend lanes in separate sub-agents.

**One ticket burned 150k tokens. Am I using it wrong?**

Probably the ticket is too big rather than the skill being misused. A run does codebase exploration, a red-green loop per seam, a full suite, and a review, so a non-trivial ticket exceeding 100k [tokens](https://www.aihero.dev/ai-coding-dictionary/token) is normal rather than a sign something broke. The lever is upstream: right-size the tickets in [to-tickets](https://aihero.dev/skills-to-tickets) so each fits one fresh window. If a single ticket keeps blowing out, split it rather than raising the [effort](https://www.aihero.dev/ai-coding-dictionary/effort) level.

**`/implement #2` in a fresh session worked on something completely unrelated.**

A bare number can refer to several lists in a fresh session. The skill now resolves the task's title and source before coding and asks if the reference remains ambiguous. A full issue URL or local ticket path is still the clearest input.

**Do I need to start the adviser before implementation?**

No. The result is saved under `.agents/state/coordination/` even without an adviser-created assignment. [prompt-engineer](./prompt-engineer.md) can read it later. Reports include observed checks and review outcomes, not a guarantee of correctness or a live-session signal. The result directory is ignored by Git; a report never closes your ticket automatically.

## It's working if

- The session opens by reading the ticket or spec and restating what it will build, rather than asking you what to build.
- You can see an actual `/tdd` invocation in the trace, not just tests appearing in the diff.
- Typechecks and single test files run repeatedly during the run, and the full suite runs once near the end.
- The run reaches a scoped commit, or leaves changes uncommitted when you requested that.
- The final reply names the shared result file or explicitly explains why reporting was unavailable.
- You can see the current step and what remains, through a native checklist or its stated fallback, without asking for a plan repeatedly.
- A later adviser can read progress without the coder's transcript, and unavailable checks are not presented as completed work.
- The diff is one ticket's worth of change: a vertical slice through every layer, not several tickets swept together.

## Where it fits

`implement` is the build step of the main chain, second from the end:

```txt
grill-with-docs → to-spec → to-tickets → implement → code-review
```

Its neighbours are [to-tickets](https://aihero.dev/skills-to-tickets), which produces the tickets it consumes and declares the blocking edges that decide their order; [tdd](https://aihero.dev/skills-tdd), which it drives internally at each seam; and [code-review](https://aihero.dev/skills-code-review), which it runs before committing. It sits downstream of the planning skills and trusts them. It does not re-validate the shape of what it was handed, so a badly-structured map or a horizontally-layered ticket gets built as written.

That trust is why [wayfinder](https://aihero.dev/skills-wayfinder) merges onto the chain at [to-spec](https://aihero.dev/skills-to-spec) rather than looping its map straight into `implement`. Go straight to `implement` from a map only when the effort turned out genuinely small.

[ask-matt](https://aihero.dev/skills-ask-matt) is the router over the whole set when you are not sure which flow you are in.
