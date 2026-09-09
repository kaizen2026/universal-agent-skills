import assert from "node:assert/strict";
import { test } from "node:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { main, read, status, watch } from "../skills/engineering/prompt-engineer/scripts/exchange.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "uas-advisor-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function report(overrides = {}) {
  return {
    schemaVersion: 1, workItemId: "issue-42", workerId: "coder-a", assignmentId: "fix-01",
    status: "ready-for-review", updatedAt: "2026-09-09T01:00:00.000Z",
    workspace: "C:/worktree-a", branch: "fix/example", head: "unknown",
    summary: "Implemented the scoped fix; review is still needed.", changes: ["src/example.js"],
    checks: [{ command: "npm test", outcome: "passed", evidence: "12 tests passed in this worktree." }],
    blockers: [], nextSuggestion: "Review the changed condition.", ...overrides,
  };
}

function publish(root, data = report()) {
  const directory = join(root, ".agents", "state", "coordination", data.workItemId);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${data.workerId}.json`);
  writeFileSync(path, JSON.stringify(data));
  return path;
}

test("an empty exchange is read-only and does not imply sessions are absent", async t => {
  const root = fixture(t);
  const result = await main(["status", "--project", root, "--work-item", "issue-42"]);
  assert.deepEqual(result.reports, []);
  assert.deepEqual(result.invalid, []);
  assert.match(result.observation, /unverified/);
  assert.deepEqual(readdirSync(root), []);
});

test("status scopes reports to a work item and read returns only the selected worker", t => {
  const root = fixture(t);
  publish(root);
  publish(root, report({ workerId: "coder-b", assignmentId: "tests-01", status: "working" }));
  publish(root, report({ workItemId: "issue-99", summary: "Unrelated work" }));
  const result = status(root, "issue-42");
  assert.deepEqual(result.reports.map(item => item.workerId), ["coder-a", "coder-b"]);
  assert.equal(JSON.stringify(result).includes("Unrelated work"), false);
  const selected = read(root, "issue-42", "coder-b");
  assert.equal(selected.report.assignmentId, "tests-01");
  assert.equal(selected.report.status, "working");
  assert.match(selected.observation, /Unverified/);
});

test("timestamps alone do not trigger review, but new assignments, commits, and results do", t => {
  const root = fixture(t);
  publish(root);
  const first = status(root, "issue-42");
  publish(root, report({ updatedAt: "2026-09-09T02:00:00.000Z" }));
  assert.equal(status(root, "issue-42").digest, first.digest);
  for (const change of [{ assignmentId: "fix-02" }, { head: "new-commit" }, { summary: "A different result" }, { status: "blocked" }]) {
    publish(root, report(change));
    assert.notEqual(status(root, "issue-42").digest, first.digest);
  }
});

test("malformed, misidentified, oversized, and invalid reports cannot become completed results", t => {
  const root = fixture(t);
  const path = publish(root);
  const invalidSources = [
    "{", "null", JSON.stringify(report({ workerId: "coder-b" })),
    JSON.stringify(report({ workItemId: "elsewhere" })), JSON.stringify(report({ assignmentId: "../escape" })),
    JSON.stringify(report({ status: "approved" })), JSON.stringify(report({ updatedAt: "yesterday" })),
    JSON.stringify(report({ summary: "x".repeat(1501) })), JSON.stringify(report({ changes: Array(21).fill("src/a.js") })),
    JSON.stringify(report({ checks: [{ command: "test", outcome: "probably", evidence: "No tool" }] })),
    JSON.stringify(report({ padding: "x".repeat(16384) })),
  ];
  for (const source of invalidSources) {
    writeFileSync(path, source);
    assert.equal(status(root, "issue-42").reports.length, 0);
    assert.equal(status(root, "issue-42").invalid.length, 1);
    assert.throws(() => read(root, "issue-42", "coder-a"));
  }
});

test("output redacts common credentials and excludes unknown fields without editing the report", t => {
  const root = fixture(t);
  const secrets = ["sk-12345678901234567890", "ghp_12345678901234567890", "super-private-password", "human@example.com"];
  const data = report({ summary: `${secrets[0]} ${secrets[1]} password=${secrets[2]} ${secrets[3]}`, transcript: "Never display raw transcripts" });
  const path = publish(root, data);
  const before = readFileSync(path, "utf8");
  const output = JSON.stringify(read(root, "issue-42", "coder-a"));
  for (const secret of secrets) assert.equal(output.includes(secret), false);
  assert.equal(output.includes(data.transcript), false);
  assert.equal(readFileSync(path, "utf8"), before);
});

test("report identities reject path traversal and oversized IDs", t => {
  const root = fixture(t);
  publish(root);
  for (const id of ["../escape", "a/b", "a\\b", "A", "", "a".repeat(65)]) {
    assert.throws(() => status(root, id));
    assert.throws(() => read(root, "issue-42", id));
  }
});

test("exchange directory junctions or symlinks cannot lead outside the selected root", t => {
  const root = fixture(t);
  const outside = fixture(t);
  publish(outside);
  try { symlinkSync(join(outside, ".agents"), join(root, ".agents"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) return t.skip("symlink permission unavailable"); throw error; }
  assert.throws(() => status(root, "issue-42"), /real directories/);
  assert.throws(() => read(root, "issue-42", "coder-a"), /real directories/);
});

test("report symlinks are rejected instead of read", t => {
  const root = fixture(t);
  const path = publish(root);
  const linked = join(root, ".agents", "state", "coordination", "issue-42", "coder-b.json");
  try { symlinkSync(path, linked, "file"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) return t.skip("symlink permission unavailable"); throw error; }
  assert.equal(status(root, "issue-42").invalid.length, 1);
  assert.throws(() => read(root, "issue-42", "coder-b"), /regular file/);
});

test("bounded watch returns changed metadata or a deadline without model or network dependencies", async t => {
  const root = fixture(t);
  publish(root);
  const baseline = status(root, "issue-42").digest;
  const unchanged = await watch(root, "issue-42", baseline, 0.03, 5);
  assert.deepEqual(unchanged, { changed: false, digest: baseline, reason: "deadline-reached" });
  const timer = setTimeout(() => publish(root, report({ status: "blocked", blockers: ["Need a scope decision"] })), 15);
  t.after(() => clearTimeout(timer));
  const changed = await watch(root, "issue-42", baseline, 1, 5);
  assert.equal(changed.changed, true);
  assert.equal(changed.reports[0].reportedStatus, "blocked");
  assert.notEqual(changed.digest, baseline);
  for (const timeout of [0, 301, NaN]) await assert.rejects(watch(root, "issue-42", baseline, timeout));
  for (const timeout of [61, 300]) assert.equal((await watch(root, "issue-42", baseline, timeout)).changed, true);
  await assert.rejects(watch(root, "issue-42", "not-a-digest", 1));
});

test("the installed helper runs standalone and rejects ambiguous CLI arguments", async t => {
  const root = fixture(t);
  const script = join(root, "exchange.mjs");
  copyFileSync(fileURLToPath(new URL("../skills/engineering/prompt-engineer/scripts/exchange.mjs", import.meta.url)), script);
  const child = spawnSync(process.execPath, [script, "status", "--project", root, "--work-item", "issue-42"], { encoding: "utf8", windowsHide: true });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout).reports, []);
  assert.equal(existsSync(join(root, ".agents")), false);
  for (const args of [["send"], ["status", "--project"], ["status", "--secret", "value"], ["status", "--project", root, "--project", root]]) {
    await assert.rejects(main(args));
  }
});

test("CLI entry detection works through a Claude-style linked skill directory", t => {
  const root = fixture(t);
  const canonical = join(root, "canonical");
  const linked = join(root, "claude-link");
  mkdirSync(canonical);
  copyFileSync(fileURLToPath(new URL("../skills/engineering/prompt-engineer/scripts/exchange.mjs", import.meta.url)), join(canonical, "exchange.mjs"));
  try { symlinkSync(canonical, linked, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) return t.skip("symlink permission unavailable"); throw error; }
  const child = spawnSync(process.execPath, [join(linked, "exchange.mjs"), "status", "--project", root, "--work-item", "issue-42"], { encoding: "utf8", windowsHide: true });
  assert.equal(child.status, 0, child.stderr);
  assert.ok(child.stdout.trim(), "a symlinked CLI entry must not silently skip main");
  assert.deepEqual(JSON.parse(child.stdout).reports, []);
});
