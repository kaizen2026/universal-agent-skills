---
name: project-progress
description: Turn project maps, plans, designs, specs, code, and validation evidence into an honest interactive HTML progress dashboard.
disable-model-invocation: true
---

# Project Progress

Dense written plans are hard to steer from. This skill turns the repository's current evidence into one standalone visual dashboard that answers three questions at a glance:

1. Where are we really?
2. What is the shortest evidence-backed route to the next useful outcome?
3. Which other routes can wait without being forgotten?

The dashboard is a **view over source evidence**, never a new source of truth. Do not change issue status, close tickets, rewrite plans, build product features, or alter deployment state merely to improve the picture.

## The evidence ladder

Never collapse progress into one percentage. Keep these stages separate for every workstream:

1. **Defined** — decisions, ownership, scope, and rules exist.
2. **Designed** — an approved experience or technical contract exists.
3. **Prototyped** — a throwaway artifact answers a decision question.
4. **Implemented** — production-intended code exists.
5. **Validated** — relevant automated and rendered end-to-end evidence passes.
6. **Operational** — the capability is deployed, observable, recoverable, and accepted.

A closed planning ticket can advance **Defined** while leaving every later stage untouched. A prototype can advance **Prototyped** without becoming implementation. If the repository cannot prove a positive state, record `unknown` or `not-started`; never award progress from tone, file volume, or ticket count.

Read [progress-semantics.md](references/progress-semantics.md) before classifying evidence. Read [model-schema.md](references/model-schema.md) before creating or changing the model.

## Artifacts

Use these defaults unless the project already carries an established location:

- `docs/project-progress.json` — small, reviewable semantic model and evidence index.
- `docs/project-progress.html` — generated standalone dashboard.

The JSON holds project-specific interpretation. The skill, schema, and renderer stay project-neutral. Preserve user-authored notes in the model and make the smallest evidence-backed update on later invocations.

## Refresh workflow

### 1. Orient to the repository

Read the repository guidance first (`AGENTS.md`, `CLAUDE.md`, or their pointers). If continuity state exists, reconcile it before trusting saved claims. Read the configured issue-tracker conventions when present.

Discover sources with the repository's fast text/file search. Look for, in this order:

- an existing `docs/project-progress.json`;
- map or tracker indexes and their open/closed/blocked/claimed work;
- product plans, specifications, ADRs, architecture records, and design contracts;
- prototypes explicitly labelled as decision evidence or throwaway;
- production-intended application entry points and migrations;
- tests, build output, browser evidence, deployment records, runbooks, monitoring, and recovery evidence.

Start from indexes and summaries. Open detailed files only when a classification or route depends on them. Ignore dependency caches, generated build trees, and unrelated applications.

### 2. Reconcile, do not merely regenerate

For every existing claim in the model, locate current evidence and decide whether it is confirmed, stale, contradicted, or unverifiable. Then add newly discovered workstreams and sources.

When several maps describe one effort, show each map's ticket state separately and show the product workstreams separately. Ticket counts belong to the map; delivery stages belong to the workstream.

For local Markdown maps, configure a `local-markdown-map` source so the renderer computes issue counts and the frontier from `Status`, `Assignee`, and `Blocked by` fields on every refresh. For a remote tracker, record an explicit `snapshot` with its URL, retrieval date, counts, and any claimed/frontier items the agent actually verified.

### 3. Name the routes

Include one recommended route and meaningful alternatives. The recommendation should optimize for the user's stated outcome, not for closing the most tickets.

Each route states:

- the concrete outcome;
- why it is or is not recommended now;
- the smallest ordered steps;
- dependencies that may proceed in parallel;
- suggested skills or workflows, with the reason each one fits;
- the specific topics that still need discussion or decision;
- what the route does **not** deliver.

If a business choice is genuinely missing, display it as a decision point in the dashboard. Do not silently choose it or mutate the underlying plan.

### 4. Update the semantic model

Create or update `docs/project-progress.json` using [model-schema.md](references/model-schema.md). Keep names and language from the project's own domain vocabulary. Link every positive maturity claim to evidence. Keep future work visible but clearly distinct from the current route.

Do not copy whole plans into the model. Use one-sentence summaries and links back to the authoritative files or tracker items.

### 5. Render and verify

Resolve the renderer relative to this `SKILL.md`, then run:

```text
node <skill-directory>/scripts/render-dashboard.mjs --project <project-root>
node <skill-directory>/scripts/render-dashboard.mjs --project <project-root> --check
```

The first command writes the HTML. The second must report that it is current and structurally valid. The renderer has no package dependencies and the output must remain a standalone offline HTML file with no CDN assets.

When browser tooling is available, open the generated file and inspect at least one desktop and one mobile viewport. Check keyboard tab navigation, route selection, workstream filters, expandable evidence, horizontal overflow, and readable contrast. If browser tooling is unavailable, report visual behavior as unverified rather than passed.

### 6. Hand back the steering view

Open or link the generated dashboard, then report only:

- the honest current position;
- the recommended next route;
- material changes since the previous dashboard;
- any source or visual evidence that remains unverified.

Do not continue into implementation, planning-ticket resolution, infrastructure changes, or deployment unless the user separately asks for that work.

## Guardrails

- Never label a project "89% built" because 89% of its decision tickets are closed.
- Never treat a static HTML design, mock, or logic prototype as a working product.
- Never treat a successful build alone as end-to-end validation.
- Never infer production deployment from the existence of infrastructure documents.
- Never hide unknown or future work to make the dashboard cleaner.
- Never include secrets, private employee data, credentials, internal hostnames, or raw incident evidence in the model or HTML.
- Never embed external scripts, fonts, trackers, or analytics in the generated dashboard.

## Invocation compatibility

This is deliberately user-invoked. In Claude Code, invoke `/project-progress`. In Codex, invoke `$project-progress`. Other Agent Skills-compatible hosts may expose the installed skill through their own command syntax.
