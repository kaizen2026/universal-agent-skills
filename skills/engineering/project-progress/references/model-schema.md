# Project-progress model schema

The renderer reads `docs/project-progress.json` by default. It accepts only schema version 1.

## Top-level object

```json
{
  "schemaVersion": 1,
  "project": {
    "name": "Example project",
    "subtitle": "Optional short context",
    "reviewedOn": "YYYY-MM-DD",
    "northStar": "The concrete end-to-end outcome",
    "currentTruth": "One plain-language statement of the honest current position"
  },
  "progressRules": ["A project-specific caution"],
  "sources": [],
  "routes": [],
  "milestones": [],
  "workstreams": [],
  "journeys": [],
  "artifacts": []
}
```

All arrays are required. `progressRules` may be empty. IDs are lowercase kebab-case and unique within their array.

## Sources

### Local Markdown map

```json
{
  "id": "foundation-map",
  "name": "Foundation decisions",
  "type": "local-markdown-map",
  "mapPath": ".scratch/foundation/map.md",
  "issuesDirectory": ".scratch/foundation/issues",
  "summary": "What this map decides",
  "scopeNote": "What closing this map does not deliver"
}
```

The renderer reads every `*.md` file in `issuesDirectory`, extracts its H1 title plus `Status:`, `Assignee:`, and `Blocked by:`, and computes closed, claimed, frontier, and blocked lists. Paths are project-root-relative.

### Verified snapshot

Use this for a remote tracker or a format the renderer cannot parse:

```json
{
  "id": "remote-roadmap",
  "name": "Remote roadmap",
  "type": "snapshot",
  "url": "https://tracker.example.invalid/project/roadmap",
  "reviewedOn": "YYYY-MM-DD",
  "summary": "What the tracker covers",
  "scopeNote": "What its closure does not prove",
  "counts": { "closed": 4, "claimed": 1, "frontier": 2, "blocked": 3 },
  "claimedItems": [{ "name": "Current item", "url": "https://tracker.example.invalid/item/5" }],
  "frontierItems": [{ "name": "Ready item", "url": "https://tracker.example.invalid/item/6" }]
}
```

Only include a snapshot the current invocation actually verified. Never use `.invalid` example URLs in a real model.

## Routes

```json
{
  "id": "vertical-slice",
  "name": "Build one working slice",
  "recommended": true,
  "horizon": "Prioritize now",
  "outcome": "What the user can concretely see or do",
  "why": "Why this route fits now",
  "doesNotDeliver": "The boundary this route leaves for later",
  "steps": ["First smallest step", "Second smallest step"],
  "suggestedSkills": [
    { "name": "to-spec", "reason": "Collapse the approved decisions into one build contract." }
  ],
  "discussionTopics": ["Acceptance journeys", "Data and authority boundaries"]
}
```

Provide exactly one recommended route unless the user's own decision is explicitly pending. In that case, set every route to `recommended: false` and explain the decision point in `currentTruth`.

Store skill names without a leading slash or dollar sign. The dashboard renders both common invocation forms, `/skill-name` for Claude Code and `$skill-name` for Codex. An empty `suggestedSkills` array is valid when no installed or known skill fits. Topics should be concrete unresolved subjects, not generic labels such as `planning` or `implementation`.

## Milestones

```json
{
  "id": "build-contract",
  "name": "Write the build contract",
  "state": "next",
  "detail": "What proves this boundary complete"
}
```

Use a state from `progress-semantics.md`. Order milestones from earliest to latest. Do not put a percentage on the sequence.

## Workstreams

```json
{
  "id": "identity",
  "name": "Identity & Access",
  "lane": "now",
  "summary": "What is currently true",
  "next": "The next evidence boundary",
  "stages": {
    "defined": "complete",
    "designed": "partial",
    "prototyped": "not-started",
    "implemented": "not-started",
    "validated": "not-started",
    "operational": "not-started"
  },
  "evidence": [
    { "label": "Authentication decision", "path": "docs/adr/0001-auth.md" }
  ]
}
```

`lane` is one of `now`, `next`, `later`, or `platform`. Every stage is required and uses a state from `progress-semantics.md`. Evidence may use a project-relative `path` or an absolute `url`, never both.

## Journeys

```json
{
  "actor": "Employee",
  "flow": "Sign in → perform the useful action → see the result",
  "proof": "The evidence that makes the journey genuinely testable"
}
```

Journeys define the nearest end-to-end proof, not every future feature.

## Artifacts

```json
{
  "name": "Design prototype",
  "kind": "throwaway prototype",
  "status": "Reviewed",
  "meaning": "What this proves and what it does not prove",
  "path": "docs/design/example/index.html"
}
```

Artifacts may use `path` or `url`. Keep `meaning` explicit enough that a screenshot, prototype, build, or live unrelated service cannot be mistaken for product delivery.
