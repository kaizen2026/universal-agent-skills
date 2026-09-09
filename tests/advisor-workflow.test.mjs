import assert from "node:assert/strict";
import { test } from "node:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { discover, main, publish, read, snapshot, start, watchResult } from "../skills/engineering/prompt-engineer/scripts/exchange.mjs";

const helper = fileURLToPath(new URL("../skills/engineering/prompt-engineer/scripts/exchange.mjs", import.meta.url));
function fixture(t, git = false) {
  const root = mkdtempSync(join(tmpdir(), "uas-workflow-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (git) command(root, ["init", "--quiet"]);
  return root;
}
function command(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
}
function finish(root, started, input = {}) {
  const r = started.report;
  return publish(root, r.workItemId, r.workerId, r.assignmentId, started.digest, r.workspace, {
    status: "ready-for-review", summary: "Implemented; verification is recorded separately.", ...input,
  });
}
function watching(root, started, after, timeout = 0.08) {
  const r = started.report;
  return watchResult(root, r.workItemId, r.workerId, r.assignmentId, after, timeout, 5);
}

test("ordinary implementation creates a discoverable report without adviser IDs", async t => {
  const root = fixture(t, true);
  writeFileSync(join(root, ".gitignore"), "node_modules/\r\n# keep my rule");
  const first = await start(root, "Reject empty slugs", { source: "docs/specs/slugs.md", harness: "codex" });
  assert.equal(first.report.status, "working");
  assert.equal(first.report.head, "unknown");
  assert.equal(first.report.baseHead, "unknown");
  assert.equal(first.report.session.id, "unknown");
  assert.match(first.report.treeDigest, /^[a-f0-9]{64}$/);
  const second = await start(root, "Reject empty slugs", { source: "docs/specs/slugs.md" });
  assert.equal(first.report.workItemId, second.report.workItemId);
  assert.notEqual(first.report.workerId, second.report.workerId);
  assert.notEqual(first.report.assignmentId, second.report.assignmentId);
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), "node_modules/\r\n# keep my rule\r\n.agents/state/coordination/\r\n");
  assert.equal(discover(root, "slugs.md").candidates.length, 2, "ambiguity must remain visible, not newest-wins");
  assert.equal(discover(root, "unrelated").candidates.length, 0);
  assert.match(command(root, ["check-ignore", first.path]), /coordination/);
});

test("non-Git work still publishes without inventing validation", async t => {
  const root = fixture(t);
  const initial = await start(root, "A standalone task");
  const result = await finish(root, initial);
  assert.equal(result.report.treeDigest, "unknown");
  assert.equal(result.report.checkedTreeDigest, "unknown");
  assert.deepEqual(result.report.checks, []);
  assert.equal(discover(root).candidates[0].reportedStatus, "ready-for-review");
});

test("publication sanitizes before persistence and preserves assignment provenance", async t => {
  const root = fixture(t);
  const initial = await start(root, "Small task");
  const final = await finish(root, initial, {
    summary: "password=private-value sk-12345678901234567890",
    task: { title: "Hijack", source: "elsewhere" }, baseHead: "fake", workspace: "fake",
    transcript: "do not retain", artifacts: ["docs/spec.md"], review: "No blocking findings; typecheck unavailable.",
    checks: [{ command: "npm test", outcome: "unverified", evidence: "Shell unavailable" }],
  });
  const saved = readFileSync(final.path, "utf8");
  assert.equal(saved.includes("private-value"), false);
  assert.equal(saved.includes("sk-12345678901234567890"), false);
  assert.equal(saved.includes("do not retain"), false);
  assert.equal(final.report.task.title, "Small task");
  assert.equal(final.report.baseHead, initial.report.baseHead);
  assert.equal(final.report.checks[0].outcome, "unverified");
});

test("existing reports, stale writes, wrong assignments, and wrong workspaces are rejected", async t => {
  const root = fixture(t), other = fixture(t);
  const initial = await start(root, "One task", { workItem: "task", worker: "coder-a", assignment: "run-1" });
  await assert.rejects(start(root, "Another task", { workItem: "task", worker: "coder-a" }), /already exists/);
  const result = await finish(root, initial);
  await assert.rejects(finish(root, initial, { summary: "Stale overwrite" }), /changed/);
  await assert.rejects(publish(root, "task", "coder-a", "run-2", result.digest, root, {}), /different run/);
  await assert.rejects(publish(root, "task", "coder-a", "run-1", result.digest, other, {}), /workspace/);
  await assert.rejects(finish(root, result, { checks: [{ outcome: "probably" }] }));
  assert.equal(readFileSync(result.path, "utf8").includes("Stale overwrite"), false);
});

test("concurrent writers cannot both replace the same revision", async t => {
  const root = fixture(t);
  const initial = await start(root, "One task");
  const results = await Promise.allSettled([
    finish(root, initial, { summary: "First writer" }), finish(root, initial, { summary: "Second writer" }),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
});

test("Git fingerprints cover dirty content, untracked content, commits, and nested callers", t => {
  const root = fixture(t, true);
  writeFileSync(join(root, "example.txt"), "first\n");
  command(root, ["add", "example.txt"]);
  command(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "fixture"]);
  const clean = snapshot(root);
  writeFileSync(join(root, "example.txt"), "second\n");
  const dirty = snapshot(root);
  assert.equal(dirty.head, clean.head);
  assert.notEqual(dirty.treeDigest, clean.treeDigest);
  writeFileSync(join(root, "example.txt"), "third\n");
  assert.notEqual(snapshot(root).treeDigest, dirty.treeDigest);
  writeFileSync(join(root, "untracked.txt"), "new\n");
  const untracked = snapshot(root);
  writeFileSync(join(root, "untracked.txt"), "changed\n");
  assert.notEqual(snapshot(root).treeDigest, untracked.treeDigest);
  mkdirSync(join(root, "nested"));
  assert.equal(snapshot(join(root, "nested")).treeDigest, snapshot(root).treeDigest);
  command(root, ["add", "."]);
  command(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "next"]);
  assert.notEqual(snapshot(root).head, clean.head);
});

test("publishing current Git evidence does not silently bind earlier checks", async t => {
  const root = fixture(t, true);
  const initial = await start(root, "Check task");
  const checked = snapshot(root).treeDigest;
  writeFileSync(join(root, "later.txt"), "changed after checks");
  const final = await finish(root, initial, { checkedTreeDigest: checked });
  assert.equal(final.report.checkedTreeDigest, checked);
  assert.notEqual(final.report.treeDigest, checked);
  assert.equal((await finish(root, final, { summary: "No new checks" })).report.checkedTreeDigest, "unknown");
});

test("separate worktrees publish into an explicitly shared root", async t => {
  const shared = fixture(t), worker = fixture(t);
  const initial = await start(worker, "Worker task", { sharedProject: shared });
  assert.equal(initial.report.workspace, snapshot(worker).workspace);
  const final = await finish(shared, initial);
  assert.equal(discover(worker).candidates.length, 0);
  assert.equal(discover(shared).candidates[0].digest, final.digest);
});

test("discovery is read-only and rejects exchange junctions", t => {
  const root = fixture(t), outside = fixture(t);
  assert.deepEqual(discover(root).candidates, []);
  mkdirSync(join(outside, ".agents"));
  try { symlinkSync(join(outside, ".agents"), join(root, ".agents"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) return t.skip("symlink permission unavailable"); throw error; }
  assert.throws(() => discover(root), /real directories/);
});

test("watch filters malformed reports, other workers, working state, and wrong assignments", async t => {
  const root = fixture(t);
  const initial = await start(root, "Selected task");
  const other = await start(root, "Other task", { workItem: initial.report.workItemId });
  await finish(root, other);
  assert.equal((await watching(root, initial)).event, "deadline-reached");
  const r = initial.report;
  for (const value of ["{", JSON.stringify({ ...r, assignmentId: "different", status: "complete" })]) {
    writeFileSync(initial.path, value);
    assert.equal((await watching(root, initial)).event, "deadline-reached");
  }
  writeFileSync(initial.path, JSON.stringify(r));
  const final = await finish(root, initial);
  assert.equal((await watching(root, initial)).event, "review-ready");
  assert.equal((await watching(root, initial, final.digest)).event, "deadline-reached");
  writeFileSync(final.path, JSON.stringify({ ...final.report, updatedAt: "2026-09-09T12:00:00.000Z" }));
  assert.equal((await watching(root, initial, final.digest)).event, "deadline-reached");
});

test("blocked results request attention rather than claiming success", async t => {
  const root = fixture(t);
  const initial = await start(root, "Blocked task");
  await finish(root, initial, { status: "blocked", blockers: ["Need scope decision"] });
  const event = await watching(root, initial);
  assert.equal(event.event, "needs-attention");
  assert.match(event.observation, /not a review/);
  for (const timeout of [0, -1, 61, NaN]) await assert.rejects(watching(root, initial, undefined, timeout));
  await assert.rejects(watching(root, initial, "bad-digest"));
});

test("one standalone watcher process waits for a separate publisher and emits one result", async t => {
  const root = fixture(t);
  const initial = await start(root, "Separate process experiment");
  const r = initial.report;
  const child = spawn(process.execPath, [helper, "watch-result", "--project", root, "--work-item", r.workItemId, "--worker", r.workerId, "--assignment", r.assignmentId, "--timeout", "10"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = "", errors = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { errors += data; });
  const done = new Promise((resolve, reject) => { child.on("error", reject); child.on("close", code => resolve(code)); });
  // This timer represents a worker finishing, not a model poll.
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(output, "", "waiting must not stream repeated status results to a model");
  const final = await finish(root, initial);
  assert.equal(await done, 0, errors);
  const event = JSON.parse(output); // Multiple results would fail this parse.
  assert.equal(event.event, "review-ready");
  assert.equal(event.digest, final.digest);
  assert.ok(event.fileChecks >= 2);
});

test("implement's installed helper works without prompt-engineer beside it", async t => {
  const root = fixture(t);
  const installed = join(root, "installed", "scripts", "exchange.mjs");
  mkdirSync(dirname(installed), { recursive: true });
  copyFileSync(fileURLToPath(new URL("../skills/engineering/implement/scripts/exchange.mjs", import.meta.url)), installed);
  const result = JSON.parse(execFileSync(process.execPath, [installed, "start", "--project", root, "--task", "Standalone install"], { encoding: "utf8", windowsHide: true }));
  assert.equal(result.report.task.title, "Standalone install");
  await assert.rejects(main(["publish", "--project", root]), /requires/);
  await assert.rejects(main(["watch-result", "--project", root, "--expected-digest", "a".repeat(64)]), /Unknown/);
});
