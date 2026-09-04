---
name: resume-work
description: Resume checkpointed work after compaction, interruption, or a host change by reconciling local continuity state with Git, files, issues, design contracts, and tests. Use when continuing a prior session or importing a portable handoff.
---

# Resume Work

Treat a Work-Item Capsule as a claim to verify, not memory to trust blindly.

## Reconcile before acting

Resolve the active capsule from an explicit Work Item ID first, then the current harness session binding. If neither resolves, report that no work item is active. Never choose the newest workspace-wide checkpoint. Validate the capsule schema and timestamp, then compare it with:

- Current repository root, branch, and `HEAD`
- Current dirty-working-tree inventory
- Existence and current contents of every material file pointer
- Current issue/spec/design-contract status when the tracker is available
- Exact test results recorded in the checkpoint
- Commands that may have been interrupted or left partial output

If the runtime exists, run `node .agents/universal-agent-skills/runtime/cli.mjs resume` with `--work-item <id>` or the bound `--harness` and `--session` to produce the initial report. Independently inspect any high-risk divergence it flags. A legacy `current.md` or portable handoff may be inspected only through an explicit `--input`; label it inactive evidence rather than an active capsule. To continue such evidence as real work, activate a Work Item ID and adopt it with `import-legacy-checkpoint --work-item <id> --input <path> --expected-revision <n>`; the import records its provenance and never runs on its own.

Classify each checkpoint claim as `Confirmed`, `Changed`, `Missing`, or `Unverified`. Never erase or overwrite a dirty tree to make it resemble the checkpoint. Never call a previously passing test current unless it is still valid for the present HEAD; rerun the smallest relevant safe validation when needed.

A structurally valid checkpoint is not necessarily safe to resume. Treat changed Git or dirty-tree evidence, missing pointers, validation recorded for another commit, and a checkpoint older than the runtime's freshness window as requiring reconciliation before action. Host session-start injection is context for that reconciliation, not approval of the saved claims.

## Resume from reality

Summarize the reconciled objective, completed work, live risks, and the one next action. Follow current repository state where it conflicts with stale prose. Load source artifacts by pointer only as needed, invoke the suggested skills that still fit, and begin with the checkpoint's next action unless reconciliation invalidated it.

When local gitignored state is absent in a cloud job, say continuity could not be recovered locally and reconstruct only from tracked issues, specs, ADRs, design contracts, commits, and user-provided handoffs. Do not pretend host automation preserved state it could not persist.
