import assert from "node:assert/strict";
import { test } from "node:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { discover, main, publish, read, start, updateProgress, watchResult } from "../skills/engineering/prompt-engineer/scripts/exchange.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "uas-progress-test-"));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.startsWith(join(tmpdir(), "uas-progress-test-")));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
const plan = () => ({ steps: [
  { id: "build", title: "Implement scoped behavior", status: "in-progress" },
  { id: "check", title: "Verify and review", status: "pending" },
] });
function update(root, previous, input = {}) {
  const r = previous.report;
  return updateProgress(root, r.workItemId, r.workerId, r.assignmentId, previous.digest, r.workspace,
    { progress: previous.report.progress ?? plan(), ...input });
}
function finish(root, previous, input = {}) {
  const r = previous.report;
  return publish(root, r.workItemId, r.workerId, r.assignmentId, previous.digest, r.workspace,
    { status: "ready-for-review", summary: "Implementation reported ready; not independent verification.", ...input });
}
function watch(root, previous, after) {
  const r = previous.report;
  return watchResult(root, r.workItemId, r.workerId, r.assignmentId, after, 0.025, 5);
}

test("progress is a task-linked v3 snapshot, readable by a fresh adviser without native tools", async t => {
  const root = fixture(t);
  const initial = await start(root, "Friendly labels", { source: "docs/specs/labels.md", harness: "claude" });
  assert.equal(initial.report.schemaVersion, 2);
  const first = await update(root, initial, { summary: "Building labels.", nextSuggestion: "Verify the behavior." });
  assert.equal(first.report.schemaVersion, 3);
  assert.deepEqual(first.report.task, initial.report.task);
  assert.deepEqual(first.report.session, initial.report.session);
  assert.equal(first.report.baseTreeDigest, initial.report.baseTreeDigest);
  const [candidate] = discover(root, "labels.md").candidates;
  assert.equal(candidate.digest, first.digest);
  const recovered = read(root, candidate.workItemId, candidate.workerId);
  assert.deepEqual(recovered.report.progress.steps.map(step => step.status), ["in-progress", "pending"]);
  const second = await update(root, first, { progress: { steps: first.report.progress.steps.map((step, i) => ({ ...step, status: i ? "in-progress" : "completed" })) } });
  assert.notEqual(second.digest, first.digest);
  assert.deepEqual(second.report.progress.steps.map(step => step.id), ["build", "check"]);
  assert.equal(second.report.progress.steps[0].status, "completed");
});

test("working checklist changes never trigger result review, including the last checkbox", async t => {
  const root = fixture(t), initial = await start(root, "Selected task");
  const first = await update(root, initial);
  assert.equal((await watch(root, first, initial.digest)).event, "deadline-reached");
  const allDone = await update(root, first, { progress: { steps: first.report.progress.steps.map(step => ({ ...step, status: "completed" })) } });
  assert.equal(allDone.report.status, "working");
  assert.equal((await watch(root, allDone, first.digest)).event, "deadline-reached");
  const final = await finish(root, allDone, { checks: [{ command: "node --test", outcome: "unverified", evidence: "Synthetic fixture, no product test ran." }] });
  assert.deepEqual(final.report.progress, allDone.report.progress);
  assert.equal(final.report.checks[0].outcome, "unverified");
  const event = await watch(root, final, allDone.digest);
  assert.equal(event.event, "review-ready");
  assert.equal(event.digest, final.digest);
  assert.equal((await watch(root, final, final.digest)).event, "deadline-reached");
});

test("blocked progress requests attention and can resume without marking an unavailable check done", async t => {
  const root = fixture(t), initial = await start(root, "Blocked task");
  const blockedPlan = plan();
  blockedPlan.steps[0] = { ...blockedPlan.steps[0], status: "blocked", note: "Need access to the required file." };
  const blocked = await update(root, initial, { progress: blockedPlan, status: "blocked", blockers: ["Missing access."] });
  assert.equal((await watch(root, blocked, initial.digest)).event, "needs-attention");
  await assert.rejects(finish(root, blocked), /blocked report|unfinished/);
  assert.equal(read(root, blocked.report.workItemId, blocked.report.workerId).digest, blocked.digest);
  const resumed = await update(root, blocked, { progress: plan(), status: "working", blockers: [] });
  assert.equal(resumed.report.progress.steps[0].status, "in-progress");
  assert.equal((await watch(root, resumed, blocked.digest)).event, "deadline-reached");
});

test("invalid, duplicate, oversized and contradictory progress is rejected without overwriting", async t => {
  const root = fixture(t), initial = await start(root, "Validation task");
  const original = readFileSync(initial.path, "utf8");
  const invalid = [null, [], {}, { steps: [] }, { steps: [null] },
    { steps: [plan().steps[0], plan().steps[0]] },
    { steps: Array.from({ length: 21 }, (_, i) => ({ id: `step-${i}`, title: "Step", status: "pending" })) },
    { steps: [{ id: "../outside", title: "Unsafe", status: "pending" }] },
    { steps: [{ id: "one", title: " ", status: "pending" }] },
    { steps: [{ id: "one", title: "x".repeat(201), status: "pending" }] },
    { steps: [{ id: "one", title: "Step", status: "probably-done" }] },
    { steps: [{ id: "one", title: "Step", status: "skipped" }] },
    { steps: [{ id: "one", title: "Step", status: "blocked", note: "Missing access" }] },
    { steps: [{ id: "one", title: "Step", status: "pending", note: "x".repeat(401) }] },
    { steps: [{ id: "one", title: "One", status: "in-progress" }, { id: "two", title: "Two", status: "in-progress" }] },
  ];
  for (const progress of invalid) await assert.rejects(update(root, initial, { progress }));
  await assert.rejects(update(root, initial, { status: "ready-for-review" }), /working\/blocked/);
  await assert.rejects(update(root, initial, { checks: [] }), /publish checks separately/);
  assert.equal(readFileSync(initial.path, "utf8"), original);
});

test("progress cannot drop step history, hide unfinished work at closeout, or downgrade v3", async t => {
  const root = fixture(t), initial = await update(root, await start(root, "History task"));
  await assert.rejects(update(root, initial, { progress: { steps: [initial.report.progress.steps[0]] } }), /Keep existing/);
  await assert.rejects(finish(root, initial), /unfinished/);
  await assert.rejects(finish(root, initial, { progress: { steps: [{ ...initial.report.progress.steps[0], status: "completed" }] } }), /Keep existing/);
  const final = await finish(root, initial, { schemaVersion: 2, progress: { steps: [
    { ...initial.report.progress.steps[0], status: "completed" },
    { ...initial.report.progress.steps[1], status: "skipped", note: "Fixture: user explicitly waived this optional step; not a passed check." },
  ] } });
  assert.equal(final.report.schemaVersion, 3);
  assert.equal(final.report.progress.steps[1].status, "skipped");
  await assert.rejects(update(root, final), /working\/blocked/);
  const closed = await finish(root, final, { status: "complete" });
  assert.equal(closed.report.schemaVersion, 3);
  assert.deepEqual(closed.report.progress, final.report.progress);
});

test("progress preserves ownership and rejects stale updates and concurrent writers", async t => {
  const root = fixture(t), outside = fixture(t), initial = await start(root, "Concurrent task");
  const r = initial.report;
  await assert.rejects(updateProgress(root, r.workItemId, r.workerId, "other-run", initial.digest, root, { progress: plan() }), /different run/);
  await assert.rejects(updateProgress(root, r.workItemId, r.workerId, r.assignmentId, initial.digest, outside, { progress: plan() }), /workspace/);
  await assert.rejects(updateProgress(root, r.workItemId, r.workerId, r.assignmentId, "invalid", root, { progress: plan() }), /digest/);
  const results = await Promise.allSettled([update(root, initial), update(root, initial, { summary: "Another writer" })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  await assert.rejects(update(root, initial), /changed/);
});

test("progress sanitizes its own fields and cannot overwrite checks or provenance", async t => {
  const root = fixture(t), initial = await start(root, "Sanitization task");
  const prior = await finish(root, initial, { status: "working", checkedTreeDigest: "a".repeat(64),
    checks: [{ command: "npm test", outcome: "passed", evidence: "Earlier worker claim, not a test from this progress update." }] });
  const saved = await update(root, prior, { progress: { steps: [{ id: "one", title: "password=private-value", status: "in-progress", note: "token=another-private-value" }] } });
  assert.equal(readFileSync(saved.path, "utf8").includes("private-value"), false);
  assert.deepEqual(saved.report.checks, prior.report.checks);
  for (const field of ["head", "branch", "treeDigest", "checkedTreeDigest"]) assert.equal(saved.report[field], "unknown");
  for (const field of ["task", "session", "baseHead", "baseTreeDigest"]) assert.deepEqual(saved.report[field], prior.report[field]);
  await assert.rejects(update(root, saved, { task: { title: "Hijack" } }), /only progress/);
});

test("v1 and v2 reports retain their old read and digest behavior until an explicit v3 upgrade", async t => {
  const root = fixture(t), initial = await start(root, "Legacy task");
  const v2 = await finish(root, initial);
  assert.equal(v2.report.schemaVersion, 2);
  assert.equal(v2.report.progress, undefined);
  assert.equal(read(root, v2.report.workItemId, v2.report.workerId).digest, v2.digest);
  writeFileSync(v2.path, JSON.stringify({ ...v2.report, schemaVersion: 1 }));
  const v1 = read(root, v2.report.workItemId, v2.report.workerId);
  assert.equal(v1.report.schemaVersion, 1);
  assert.equal((await watch(root, v1)).event, "review-ready");
  await assert.rejects(update(root, v1), /v2\/v3/);
  await assert.rejects(finish(root, v1), /v2\/v3/);
  writeFileSync(v2.path, JSON.stringify({ ...v2.report, progress: plan() }));
  assert.throws(() => read(root, v2.report.workItemId, v2.report.workerId), /schema v3/);
});

test("separate workers and shared-worktree reports keep independent progress", async t => {
  const shared = fixture(t), workerRoot = fixture(t);
  const one = await start(workerRoot, "One task", { sharedProject: shared });
  const two = await start(shared, "Another task", { workItem: one.report.workItemId });
  const untouched = readFileSync(two.path, "utf8");
  const updated = await update(shared, one);
  assert.equal(updated.report.workspace, one.report.workspace);
  assert.equal(readFileSync(two.path, "utf8"), untouched);
  assert.equal(discover(workerRoot).candidates.length, 0);
  assert.equal(discover(shared).candidates.length, 2);
});

test("installed Implement CLI alone publishes recoverable progress without Git available", async t => {
  const root = fixture(t), installed = join(root, "installed", "exchange.mjs");
  mkdirSync(dirname(installed));
  copyFileSync(new URL("../skills/engineering/implement/scripts/exchange.mjs", import.meta.url), installed);
  const run = (args, options = {}) => JSON.parse(execFileSync(process.execPath, [installed, ...args], { encoding: "utf8", windowsHide: true, ...options }));
  const initial = run(["start", "--project", root, "--task", "Installed checklist", "--harness", "claude"]);
  const r = initial.report, input = join(dirname(initial.path), `${r.workerId}.progress-input`);
  writeFileSync(input, JSON.stringify({ progress: plan() }));
  const flags = ["--project", root, "--work-item", r.workItemId, "--worker", r.workerId];
  const saved = run(["progress", ...flags, "--assignment", r.assignmentId, "--expected-digest", initial.digest, "--workspace", root, "--input", input],
    { env: { ...process.env, PATH: join(root, "no-programs") } });
  assert.equal(saved.report.schemaVersion, 3);
  assert.equal(run(["read", ...flags]).digest, saved.digest);
  assert.equal(run(["discover", "--project", root]).candidates[0].task.title, "Installed checklist");
  await assert.rejects(main(["progress", "--project", root]), /requires/);
  writeFileSync(input, "null");
  await assert.rejects(main(["progress", ...flags, "--workspace", root, "--input", input]), /JSON object/);
});
