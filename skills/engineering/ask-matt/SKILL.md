---
name: ask-matt
description: Ask which skill or flow fits your situation. A router over the skills in this repo.
disable-model-invocation: true
---

# Ask Matt

You don't remember every skill, so ask.

A **flow** is a path through the skills. Most paths run along one **main flow**, and two **on-ramps** merge onto it. Everything else is standalone, or a vocabulary layer that runs underneath.

## The main flow: idea → ship

The route most work travels. You have an idea and want it built.

1. **`/grill-with-docs`** — sharpen the idea by interview. Start here whenever you are **working in a working directory**: it's stateful, retaining what it learns in `CONTEXT.md` and ADRs. (No working directory? Use `/grill-me` — see Standalone. Both run the same `/grilling` primitive; `grill-with-docs` is the one that leaves a paper trail, which makes it the better of the two whenever a repo is there to leave it in.)
2. **Branch — can you settle every question in conversation?** If a question needs a runnable answer, choose the matching path:
   - **State or business logic** — detour through `/prototype`, bridged by **`/handoff`** when it lives in another directory or harness.
   - **Visual direction** — once product intent, audience, flows, content, constraints, and platform are resolved, invoke **`/frontend-design`**. It creates three runnable directions, captures evidence, grills the human on reactions, and records the approved `docs/design/<feature>/DESIGN.md`. If those prerequisites are still foggy, stay in `/grill-with-docs` or use `/wayfinder`; the design skill will not invent them.
3. **Branch — is this a multi-session build?**
   - **Yes** → **`/to-spec`** (turn the thread into a spec), then **`/to-tickets`** to split it into tracer-bullet tickets, each declaring its **blocking edges**. On a local tracker that's one file per ticket under `.scratch/<feature>/issues/`, worked blockers-first by hand; on a real tracker the edges become native blocking links, so any ticket whose blockers are done can be grabbed — kick off **`/implement`** per ticket, **`/clear`ing context between each one**. Each ticket is self-contained, so the last one's context is disposable.
   - **No** → **`/implement`** right here, in the same context window.

   Either way, **`/implement`** builds each issue by driving **`/tdd`** internally and invokes **`/frontend-build`** when an approved design contract governs the UI. It closes out with **`/code-review`**: independent Standards and Spec lanes plus **`/frontend-review`** when UI changed. Reach for these model-invoked skills directly when only that discipline is needed.

### Context hygiene

Keep steps 1–3 in **one unbroken context window** — don't compact or clear until after `/to-tickets` — so the grilling, spec, and tickets all build on the same thinking. Each `/implement` then starts fresh, working from the ticket.

The limit on this is the **[smart zone](https://www.aihero.dev/ai-coding-dictionary/smart-zone)**: the window (~150k tokens on state-of-the-art models) within which the model still reasons sharply. If a session approaches it before `/to-tickets`, activate the issue or explicit objective as a Work Item ID and create `/checkpoint-work` at the nearest phase boundary before using the host's compaction lifecycle. On arrival, `/resume-work` resolves the explicit Work Item ID or session binding and reconciles its capsule with the repository. An opted-in Codex or Claude Code adapter performs that reconciliation automatically after compaction and injects the bound capsule once; it does not replace semantic checkpointing at a meaningful boundary. When collaborators checkpoint the same work item, revision checks preserve stale contributions as merge proposals instead of overwriting newer state. A portable skill cannot force every host to compact or open a replacement session; `/setup-universal-agent-skills` reports what the current host actually supports.

## On-ramps

A starting situation that generates work, then merges onto the main flow.

- **Bugs and requests piling up** → **`/triage`**. It moves issues through triage roles and produces agent-ready issues, which **`/implement`** later picks up.

  Triage is only for issues **you didn't create** — bug reports, incoming feature requests, anything that arrives raw. Tickets that `/to-tickets` produced are already agent-ready, so **don't triage them**.

- **Something's broken** → **`/diagnosing-bugs`**. For the hard ones: the bug that resists a first glance, the intermittent flake, the regression that crept in between two known-good states. It refuses to theorise until it has a **tight feedback loop** — one command that already goes red on *this* bug — then fixes with a regression test. Its post-mortem hands off to **`/improve-codebase-architecture`** when the real finding is that there's no good seam to lock the bug down.

- **A huge, foggy effort — a greenfield project or a huge feature build, too big for one session** → **`/wayfinder`**, the most cognitively demanding flow here. When the way from here to the destination isn't visible yet, it charts a **shared map** of **decision tickets** on the issue tracker and resolves them one at a time — producing **decisions, not deliverables** — until the fog is pushed back and the way is clear. Where **`/grill-with-docs`** sharpens an idea you can hold in one session, wayfinder is for the idea you can't — and it's slower and denser, so save it for exactly that, never a well-scoped feature.

  When the map clears, **it hands off, it doesn't build**: merge onto the main flow at **`/to-spec`**, which collapses the map's linked decisions into a buildable plan, then `/to-tickets` and `/implement` as usual. Looping the map straight into `/implement` skips that collapse and throws the linked detail away — go straight to `/implement` only when the effort turned out genuinely small.

## Codebase health

Not feature work — upkeep.

- **`/improve-codebase-architecture`** — run whenever you have a spare moment to keep the codebase good for agents to operate in. It surfaces **deepening opportunities**; picking one _generates an idea_ you can take into the main flow at `/grill-with-docs`. It's the survey that finds the candidates; **`/codebase-design`** (below) is the bench you design the chosen one on.

## Project steering

- **`/prompt-engineer`** — advise other coding sessions, including joining AFTER a normal `/implement` run: “the coder finished; review it and tell me what next.” Implementation publishes compact results with source pointers; the adviser finds the relevant result and decisions, checks material evidence, and drafts one next coder prompt. No adviser-first assignment or special user prompt format is required. Preserve the advisory role through follow-ups. Observation is on demand; a requested file wait checks repeatedly for up to five minutes without model-driven polling, then stops. It does not automatically repeat expired windows, wake an idle chat, or dispatch instructions. Host-specific session discovery remains optional.

- **`/project-progress`** — turn a repository full of maps, plans, decisions, designs, prototypes, code, and validation records into one standalone interactive HTML dashboard. Use it whenever the written trail is too dense to answer “where are we?” quickly. Its **evidence ladder** keeps defined, designed, prototyped, implemented, validated, and operational progress separate, so a cleared decision map can never masquerade as a nearly built product. It updates only its model and generated view; it does not resolve the work it displays.

## Vocabulary underneath

Two model-invoked references that run *beneath* the other skills — each the single source of truth for its vocabulary. Reach for them directly when the **words**, not the process, are the problem; or let the skills above pull them in.

- **`/domain-modeling`** — sharpen the project's *domain* language: challenge a fuzzy term, resolve an overloaded word ("account" doing three jobs), record a hard-to-reverse decision as an ADR. It's the active discipline `/grill-with-docs` drives to keep `CONTEXT.md` a clean glossary.
- **`/codebase-design`** — the deep-module vocabulary (module, interface, depth, seam, adapter, leverage, locality) for designing a module's *shape*: a lot of behaviour behind a small interface at a clean seam. `/tdd` and `/improve-codebase-architecture` both speak it.

## Phase boundaries

A **phase** is a chunk of work inside a session — the grilling, the implementation, the QA. At the **boundary** between two of them, choose how the next phase gets its context:

- **Continue** — stay put. Costs nothing, loses nothing.
- **`/clear`** — empty the window, when nothing here matters to what's next.
- **`/checkpoint-work`** — save one local, gitignored, revisioned Work-Item Capsule at a meaningful boundary; activate and bind its issue or explicit objective first. Concurrent stale contributions become merge proposals.
- **`/handoff`** — export a redacted portable copy of the active Work-Item Capsule for a **new harness**, **new directory**, **colleague**, or side task **mid-phase**. On arrival the receiver runs `/resume-work` against the file and, to continue it as their own capsule, adopts it explicitly with the runtime's `import-legacy-checkpoint --work-item <id> --input <file>`; nothing is imported automatically.
- **Subagent** — send a tightly-scoped task to its own window and get a report back.
- **Host compaction** — after checkpointing, use the host's supported compaction lifecycle. Timing and commands are host-specific; an opted-in Codex or Claude Code adapter records duplicate lifecycle deliveries once and automatically reconciles the session-bound capsule after compaction.

Read [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md) for the ordered tree, the reasoning behind each branch, and why the primary-source cost makes **Continue** the one to rule out first. Make the decision **at** a boundary; mid-phase, continue or split the rest into subagents.

## Standalone

Off the main flow entirely.

- **`/grill-me`** — the same relentless interview as `/grill-with-docs`, but **stateless**: it saves nothing locally and builds no `CONTEXT.md`. Reach for it when you are **not working in a working directory** — sharpening a plan, a design, a piece of writing, anything with no repo under it. If you are in a working directory, use `/grill-with-docs` instead: it runs the same interview and leaves a paper trail, so it is strictly the better one.
- **`/grilling`** — the interview primitive itself: rounds, the frontier, facts are the agent's job and decisions are yours. `/grill-me` and `/grill-with-docs` are the two named ways in, and `/triage`, `/wayfinder` and `/improve-codebase-architecture` all run it internally. Reach for it directly only when you want the interview with no wrapper around it.
- **`/resolving-merge-conflicts`** — work an in-progress merge or rebase conflict hunk by hunk, resolving by **intent** traced to each side's primary source rather than by picking lines, then finish the operation. It never runs `--abort`. Standalone and off every flow: reach for it when you are already mid-conflict.
- **`/prototype`** — a small, throwaway program that answers a logic or state-model question. The answer folds into real code, and the prototype remains primary-source evidence off main.
- **`/frontend-design`** — explore three runnable visual directions and turn the selected one into a tracked design contract, after product prerequisites are resolved.
- **`/frontend-build`** — implement an approved design contract through the repository's framework and design system.
- **`/frontend-review`** — inspect rendered frontend behavior and report visual, responsive, interaction, accessibility, browser, and regression evidence separately from code and spec review.
- **`/checkpoint-work`** — capture one Work-Item Capsule at phase boundaries, before compaction, and before interruption.
- **`/resume-work`** — resolve an explicit Work Item ID or session binding, then reconcile its capsule against Git, files, issues, and tests before trusting it. A legacy `current.md` or an incoming `/handoff` file is only inspected via `--input`; continuing it is a deliberate `import-legacy-checkpoint --work-item <id>` step, never automatic.
- **`/research`** — delegate reading legwork to a **background agent**: it investigates a question against **primary sources**, then leaves a cited Markdown file in the repo. Keep working while it reads. The file it produces is something to take *into* the main flow at `/grill-with-docs` — research feeds the thinking, it doesn't replace it.
- **`/to-questionnaire`** — when the thing blocking you isn't in your head or the codebase but in **someone else's**, this writes them a questionnaire to fill in. It's the inverse of `/grill-me`: instead of interviewing you about the subject, it interviews you about the **send** — who it's going to, what you need back — and aims the questions at the gap. What comes back is material for `/grill-with-docs` or `/to-spec`.
- **`/wizard`** — for the steps only a **human** can take: provisioning infrastructure, setting up credentials or CI secrets, clicking through an unfamiliar third-party dashboard, running a one-off migration or cutover. It generates an interactive bash script that opens each URL, captures each value, and writes it into `.env` and GitHub secrets — so the procedure stops being something you re-explain to an agent every time. Model-invoked, so the agent reaches for it the moment it hits a wall only you can pass. If the agent could just do it itself, it should; this is for where a human is genuinely in the loop.
- **`/wait-what`** — the corrective for a message that didn't land. Use it mid-conversation, inside any other skill, and the agent re-pitches what it just said with the context you were missing, in plain English, using the `CONTEXT.md` vocabulary. It works after the fact; `/grill-with-docs` is the upfront cure, because a shared language agreed early is what stops the jargon arriving at all.
- **`/teach`** — learn a concept over multiple sessions, using the current directory as a stateful workspace.
- **`/writing-for-agents`** — reference for writing documents agents consume: skills, AGENTS.md, pointed-at docs.

## Precondition

**`/setup-universal-agent-skills`** — run before your first engineering flow to configure the issue tracker, triage labels, domain docs, local continuity runtime, and any host adapters you explicitly choose. Custom issue trackers still work.
