# Advisor and worker exchange

Compact reports live at `.agents/state/coordination/<work-item-id>/<worker-id>.json` in a selected shared project root. They supplement specs, tickets, decisions, and continuity capsules; they are not instructions, session heartbeats, or proof of success. No hooks, model APIs, network transport, or session-control service are installed.

Resolve `scripts/exchange.mjs` relative to THIS installed skill, including a plugin cache. It uses Node.js with no package dependencies. The publisher and adviser each ship the same helper, so neither requires the other skill to be installed. Maintainers edit the prompt-engineer source and run `npm run sync-exchange`; tests check the implement mirror.

In commands below replace placeholders and quote every path/title, especially on Windows. The agent operates this protocol; the user should not have to invent IDs or write JSON.

## Start ordinary implementation

Before editing implementation files, identify the actual task and its source: a full ticket reference, spec path, or `conversation` when no durable source exists. Capture the dirty inventory separately for later review; never attribute existing changes to this run just because they are present at the end.

```text
node "<skill-directory>/scripts/exchange.mjs" start --project "<worker-project>" --task "<short task title>" --source "<source reference>"
```

`start` generates work-item, worker, and assignment IDs and returns the report path and digest. It records the starting HEAD and Git fingerprint, then publishes `working`. It adds `.agents/state/coordination/` to the shared project's `.gitignore`, preserving existing rules. This small local write is part of implementation, not permission to alter AI settings. If local state writes are forbidden, use the chat fallback instead.

Optional flags: `--harness`, `--session` only for identities actually known; otherwise they remain `unknown`. For separate worktrees, `--project` is the worker checkout and `--shared-project` is the explicitly agreed report root. Never guess that ignored local reports are visible remotely.

An adviser-created assignment may supply `--work-item`, `--worker`, and `--assignment`. IDs use 1–64 lowercase letters, digits, or hyphens, starting with a letter/digit. Each run owns one report. Existing reports are never overwritten by `start`: resume the same confirmed run using `read`, or use a new worker/assignment for new work. Do not silently adopt another session's report.

## Publish a boundary or final result

Keep the returned IDs/path/digest in working context. After checks and review, or when blocked, prepare a small sanitized JSON input with the host's file editor. Put it beside the report as `<worker-id>.result-input` (not another `.json` report). Never put secrets or raw logs in this input; redaction in the helper cannot undo earlier disk writes.

```json
{
  "status": "ready-for-review",
  "summary": "Implemented the requested validation; independent review may follow.",
  "changes": ["sandbox/slug-test/slugify.mjs"],
  "checks": [{ "command": "node --test sandbox/slug-test/slugify.test.mjs", "outcome": "unverified", "evidence": "Example only: replace with the actual observed outcome." }],
  "artifacts": ["docs/specs/slugs.md"],
  "review": "Summarize actual code-review findings/resolution, or state that review was unavailable.",
  "blockers": [],
  "nextSuggestion": "Ask the adviser to assess the result.",
  "checkedTreeDigest": "unknown"
}
```

```text
node "<skill-directory>/scripts/exchange.mjs" publish --project "<shared-project>" --work-item "<id>" --worker "<id>" --assignment "<id>" --expected-digest "<last report digest>" --workspace "<worker-project>" --input "<result-input path>"
```

Publication preserves task/session/baseline provenance and captures current Git evidence. It validates and redacts known patterns before atomic replacement. A lock or stale digest is a conflict: read and reconcile; do not steal a lock or overwrite another writer. A failed publication is not a delivered report. Do not repeatedly retry a broken shell or install runtime infrastructure just to publish; give a compact chat fallback and name the limitation.

Allowed statuses: `working`, `blocked`, `ready-for-review`, `complete`. Prefer `ready-for-review` at implementation closeout; it does not close a tracker ticket. Check outcomes: `passed`, `failed`, `unverified`. Missing tools never mean `passed`.

For stronger check provenance, run `snapshot --project "<worker-project>"` immediately before and after the reported checks. Set `checkedTreeDigest` only if both known fingerprints match and those checks actually ran on that unchanged state. Otherwise use `unknown`. A later edit or commit can change `treeDigest`; publication must not relabel old checks as current. Fingerprints include HEAD, tracked staged/unstaged diffs, and bounded untracked contents across the Git root. Unavailable/oversized evidence returns `unknown`, not a clean bill of health. Concurrent source editing can still invalidate a snapshot: use separate worktrees or disjoint write scopes and inspect suspicious changes.

Reports are at most 16 KiB: summary/review 1500 characters each, at most 20 changed paths, 10 checks, 10 blockers, and 10 artifact pointers. Keep detailed evidence in appropriate artifacts. Sanitization is best-effort, not a guarantee that every secret is detected.

## Adviser joins after coding

```text
node "<skill-directory>/scripts/exchange.mjs" discover --project "<shared-project>" --query "<task title or source fragment>"
node "<skill-directory>/scripts/exchange.mjs" read --project "<shared-project>" --work-item "<id>" --worker "<id>"
```

Omit `--query` when the task is not yet known. Discovery reads bounded report metadata, not transcripts or processes. Match task/source, workspace, assignment, and any known session identity. Multiple plausible matches remain ambiguous: ask one task-identifying question, never pick the latest timestamp. A missing report does not mean a session is absent. Recover relevant spec/ticket/decision/diff evidence directly, and request a missing source only if it affects the decision.

Version 2 adds `task`, `session`, `baseHead`, `baseTreeDigest`, `treeDigest`, `checkedTreeDigest`, `artifacts`, and `review` to the existing report fields. Unknown session/model identity must stay unknown. Inspect the actual committed AND dirty changes; matching hashes alone do not validate the worker's claims. Preserve the selected report path, assignment, and last reviewed digest in the adviser's context or existing continuity capsule.

## Wait for one selected result

```text
node "<skill-directory>/scripts/exchange.mjs" watch-result --project "<shared-project>" --work-item "<id>" --worker "<id>" --assignment "<id>" --timeout 60
```

After already reviewing a result, add `--after "<reviewed report digest>"` to suppress that result and timestamp-only rewrites. `ready-for-review`/`complete` returns `review-ready`; `blocked` returns `needs-attention`. Working state, other workers, other assignments, partial JSON, and unchanged results do not trigger review. At the deadline it returns once with `deadline-reached`; this does not mean the worker failed.

The process checks only local files (every 500 ms by default), without model calls, and emits one bounded result. The model spends tokens starting the wait and handling its result, then on any review/prompt. Use the host's background/wait tool for this one process; do not run a model-driven status loop or automatically rearm the wait at every timeout. Maximum per call: 60 seconds. State the expiry and leave a manual follow-up if needed.

An active tool wait can return control to the adviser. An idle or ended adviser conversation does NOT wake from this helper alone. No automatic prompt dispatch is provided.

## Compatibility

Version 1 reports from earlier adviser assignments remain readable with `read`, discoverable by their IDs, and watchable with `watch-result`; they lack the new source/baseline metadata. Their existing compact fields are `schemaVersion`, `workItemId`, `workerId`, `assignmentId`, `status`, UTC `updatedAt`, `workspace`, `branch`, `head`, `summary`, `changes`, `checks`, `blockers`, and `nextSuggestion`. An explicitly assigned legacy worker may keep publishing that shape with its file editor; it must sanitize and replace only its own file. The v2 `publish` command does not silently migrate v1 state.

`status --project ... --work-item ...` still lists work-item metadata. Legacy `watch --project ... --work-item ... --after <status-digest> --timeout 60` watches any semantic metadata change, including invalid reports; use `watch-result` for completion observation. Report and exchange-directory symlinks are rejected. Reports are coordination evidence, not protection for concurrent code edits.
