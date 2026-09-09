# Advisor and worker exchange

Use `.agents/state/coordination/<work-item-id>/<worker-id>.json` in an explicitly selected shared project root. This is a compact worker report, not a replacement for issues, specs, or the continuity capsule. Keep the directory ignored by Git unless the user elects to track it. Do not set up host hooks merely to exchange files.

Both IDs use 1–64 lowercase letters, digits, or hyphens and start with a letter/digit. Each worker owns its file. Use a new `assignmentId` for the next instruction, so a result cannot be mistaken for an answer to a newer task. The advisor remembers the last reviewed assignment and report digest in its own working context or existing continuity capsule.

For separate worktrees, pass the shared report root explicitly; `workspace` below is the worker's actual checkout. For remote sessions without a shared filesystem, use the same report shape in a pasted message or an explicitly configured transport. Do not imply local ignored files reached a remote worker.

## Worker instruction to include in each prompt

Publish a compact JSON report at the specified shared report path after a meaningful boundary, when blocked, and at completion. Replace only your own report; use the host's file editor or an atomic temporary-file replacement. Update the assignment ID and UTC timestamp. Redact secrets before writing. Include summaries and artifact pointers, not raw logs or transcripts. A result marked complete remains a claim for the advisor to verify.

```json
{
  "schemaVersion": 1,
  "workItemId": "issue-42",
  "workerId": "coder-a",
  "assignmentId": "fix-validation-01",
  "status": "ready-for-review",
  "updatedAt": "2026-09-09T01:00:00.000Z",
  "workspace": "C:/project-worker",
  "branch": "fix/validation",
  "head": "actual-commit-sha-or-unknown",
  "summary": "Describe the result and its limits in at most 1500 characters.",
  "changes": ["src/validation.js"],
  "checks": [{ "command": "npm test", "outcome": "passed", "evidence": "Relevant check result or artifact path; no raw logs." }],
  "blockers": [],
  "nextSuggestion": "The worker's suggested next action, for the advisor to assess."
}
```

Allowed status values: `working`, `blocked`, `ready-for-review`, `complete`. `working` means the worker reported work in progress at the timestamp; it is not a heartbeat. Checks use `passed`, `failed`, or `unverified`. Use `unknown` when Git evidence is unavailable. Never turn lack of test tooling into `passed`.

Keep reports under 16 KiB, with at most 20 changed paths, 10 checks, and 10 blockers. The helper validates their shape, bounds displayed content, and redacts common credential patterns on output; that cannot remove a secret already written to disk or guarantee detection of every secret. Workers must sanitize before persistence.

## Read-only helper

Resolve `scripts/exchange.mjs` relative to this installed skill, including when it lives in Claude's plugin cache. It has no package dependencies and writes no state.

```text
node <skill-directory>/scripts/exchange.mjs status --project <shared-project> --work-item <id>
node <skill-directory>/scripts/exchange.mjs read --project <shared-project> --work-item <id> --worker <id>
node <skill-directory>/scripts/exchange.mjs watch --project <shared-project> --work-item <id> --after <status-digest> --timeout 60
```

`status` lists enrolled reports with their declared status and assignment. It does not list OS processes. `read` returns one bounded report, labelled as unverified worker claims. `watch` waits at most 60 seconds, using local file checks without model calls; a timestamp-only refresh does not count as a new result. Malformed or half-written reports are reported as invalid and never treated as completed work. Directory symlinks inside the exchange root are rejected.

Waiting longer requires the user's monitoring request and a suitable host background/wait mechanism. Avoid a loop that wakes the expensive advisor every few seconds. This helper neither sends prompts nor wakes a finished conversation by itself.
