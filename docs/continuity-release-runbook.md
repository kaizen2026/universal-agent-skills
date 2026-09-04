# Continuity runtime release runbook

This runbook closes the implementation boundary for the continuity tickets. The runtime is the source of truth; the copy under `skills/engineering/setup-universal-agent-skills/scripts/runtime/` must remain byte-for-byte synchronized with it.

## In-repository acceptance

1. `setup --hosts codex,claude --context-window <tokens>` writes managed configuration with `continuity-v2` hook metadata.
2. `status` reports threshold source, confidence, compatibility contract, and duplicate managed-hook ownership.
3. Work-item capsules, lifecycle events, merge proposals, checkpoint history, telemetry sessions, and degraded diagnostics are bounded by migrated retention settings.
4. Codex and Claude `PreCompact`, `PostCompact`, and compact-caused `SessionStart` events use the same session-bound, idempotent event processor.
5. `resume --input <path>` is the only path that reads legacy workspace checkpoints; normal resume resolves an explicit work item or session binding.
6. `import-legacy-checkpoint --work-item <id>` is the only path that turns a legacy checkpoint or incoming handoff into capsule content; it requires the explicit Work Item ID, records import provenance, appends to existing binding decisions, and becomes a merge proposal on a stale revision. Nothing bulk-migrates; source files are left in place.
7. `handoff --work-item <id>` exports the capsule as a portable checkpoint document that the receiver inspects with `resume --input` and adopts with `import-legacy-checkpoint`; `--input` still exports a legacy checkpoint.
8. Adapter removal restores only captured values and never removes unrelated user configuration; `status` is read-only and reports non-managed handlers with remediation guidance instead of touching them.
9. The Claude session-durability plugin (kaizen2026/claude-agent-skills) delegates to this runtime and checks `HOOK_CONTRACT` (`continuity-v2`) before doing so; bump that constant only with a coordinated plugin release.

## External acceptance boundary

The following evidence cannot be produced by this repository alone and must be captured in the host environments:

- Claude plugin integration (#9): install the thin external plugin/adapter, run a real Claude session, and attach the emitted hook payloads and status output.
- Native Codex and Claude triple-compaction acceptance (#11 and #12): perform three real compaction cycles in each host and retain the event ledger, duplicate-delivery result, capsule revision, and injected-context evidence.

Run [`scripts/native-acceptance-wizard.sh`](../scripts/native-acceptance-wizard.sh) to set this up: it creates three disposable fixtures under a workspace outside this repo (never `C:\SkillTest`, `tdg-movingforward/company-platform`, or any other production project), installs a cost-conscious adapter config in each (a deliberately small context window so the compact threshold is reachable without heavy token spend), and binds each to a real Codex or Claude session. It hands off the actual compaction-triggering work — and the concurrent-update, stale-proposal, and fail-open-injection experiments the acceptance criteria require — as an explicit runbook printed at its final stage, since that work is real and open-ended and no script can walk through it. It does not itself close #9/#11/#12; someone still has to run the live sessions and write up the evidence.

The repository runtime must fail open when a host omits lifecycle telemetry. A degraded invocation is still recorded in `diagnostics.jsonl` when local state is writable.

## Release checklist

- Confirm both runtime directories are synchronized.
- Run the runtime test suite in CI.
- Perform the external Codex and Claude acceptance scenarios above.
- Attach `status` output showing measured or explicitly unverified capacity; never describe an unverified capacity as measured.
- Publish adapter limitations and rollback instructions with the release.
