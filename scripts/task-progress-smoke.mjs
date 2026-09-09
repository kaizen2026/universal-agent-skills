#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--helper") throw new Error("Use --helper <installed-skill>/scripts/exchange.mjs");
const helper = realpathSync(resolve(args[1]));
const tempRoot = realpathSync(tmpdir());
const project = realpathSync(mkdtempSync(join(tempRoot, "uas-installed-progress-")));
const run = args => JSON.parse(execFileSync(process.execPath, [helper, ...args], { encoding: "utf8", windowsHide: true, timeout: 15000 }));
try {
  const initial = run(["start", "--project", project, "--task", "Simulated native-independent progress", "--source", "smoke fixture"]);
  const other = run(["start", "--project", project, "--task", "Unrelated worker", "--work-item", initial.report.workItemId]);
  const otherBytes = readFileSync(other.path);
  const r = initial.report;
  const selected = ["--project", project, "--work-item", r.workItemId, "--worker", r.workerId];
  const input = join(dirname(initial.path), `${r.workerId}.progress-input`);
  const steps = [
    { id: "preflight", title: "Read the selected task", status: "completed" },
    { id: "build", title: "Implement the selected behavior", status: "in-progress" },
    { id: "verify", title: "Verify and report", status: "pending" },
  ];
  function save(command, previous, value) {
    writeFileSync(input, JSON.stringify(value));
    return run([command, ...selected, "--assignment", r.assignmentId, "--expected-digest", previous.digest, "--workspace", project, "--input", input]);
  }
  const first = save("progress", initial, { summary: "Simulated step transition, not an AI implementation.", progress: { steps } });
  assert.equal(first.report.schemaVersion, 3);
  assert.deepEqual(run(["read", ...selected]).report.progress.steps.map(step => step.status), ["completed", "in-progress", "pending"]);
  const intermediate = run(["watch-result", ...selected, "--assignment", r.assignmentId, "--after", initial.digest, "--timeout", "0.05"]);
  assert.equal(intermediate.event, "deadline-reached");
  const completed = save("publish", first, { status: "ready-for-review", progress: { steps: steps.map(step => ({ ...step, status: "completed" })) },
    checks: [{ command: "simulated-check", outcome: "unverified", evidence: "Smoke fixture only; no product test or native Task tool ran." }] });
  const event = run(["watch-result", ...selected, "--assignment", r.assignmentId, "--after", first.digest, "--timeout", "0.05"]);
  assert.equal(event.event, "review-ready");
  assert.equal(event.digest, completed.digest);
  assert.equal(run(["watch-result", ...selected, "--assignment", r.assignmentId, "--after", completed.digest, "--timeout", "0.05"]).event, "deadline-reached");
  assert.ok(readFileSync(other.path).equals(otherBytes));
  assert.equal(run(["discover", "--project", project, "--query", "smoke fixture"]).candidates.length, 1);
  console.log(JSON.stringify({ helper, result: "passed", schemaVersion: completed.report.schemaVersion,
    recoveredSteps: first.report.progress.steps.map(({ title, status }) => ({ title, status })),
    intermediate: intermediate.event, final: event.event, unrelatedWorker: "unchanged",
    scope: "Installed helper processes only. No model calls, native UI rendering, session control, or product implementation tested." }, null, 2));
} finally {
  if (dirname(project) !== tempRoot || !project.startsWith(join(tempRoot, "uas-installed-progress-"))) throw new Error("Refusing unexpected cleanup target");
  rmSync(project, { recursive: true, force: true });
}
