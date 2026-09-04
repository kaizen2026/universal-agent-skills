# Continuity runtime release runbook

This runbook closes the implementation boundary for the continuity tickets. The runtime is the source of truth; the copy under `skills/engineering/setup-universal-agent-skills/scripts/runtime/` must remain byte-for-byte synchronized with it.

## In-repository acceptance

1. `setup --hosts codex,claude --context-window <tokens>` writes managed configuration with `continuity-v2` hook metadata.
2. `status` reports threshold source, confidence, compatibility contract, and duplicate managed-hook ownership.
3. Work-item capsules, lifecycle events, merge proposals, checkpoint history, telemetry sessions, and degraded diagnostics are bounded by migrated retention settings.
4. Codex and Claude `PreCompact`, `PostCompact`, and compact-caused `SessionStart` events use the same session-bound, idempotent event processor.
5. `resume --input <path>` is the only path that reads legacy workspace checkpoints; normal resume resolves an explicit work item or session binding.
6. Adapter removal restores only captured values and never removes unrelated user configuration.

## External acceptance boundary

The following evidence cannot be produced by this repository alone and must be captured in the host environments:

- Claude plugin integration (#9): install the thin external plugin/adapter, run a real Claude session, and attach the emitted hook payloads and status output.
- Native Codex and Claude triple-compaction acceptance (#11 and #12): perform three real compaction cycles in each host and retain the event ledger, duplicate-delivery result, capsule revision, and injected-context evidence.

The repository runtime must fail open when a host omits lifecycle telemetry. A degraded invocation is still recorded in `diagnostics.jsonl` when local state is writable.

## Release checklist

- Confirm both runtime directories are synchronized.
- Run the runtime test suite in CI.
- Perform the external Codex and Claude acceptance scenarios above.
- Attach `status` output showing measured or explicitly unverified capacity; never describe an unverified capacity as measured.
- Publish adapter limitations and rollback instructions with the release.
