#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawn, execFileSync } from "node:child_process";

const args = process.argv.slice(2);
if (![2, 4].includes(args.length) || args[0] !== "--helper" || (args.length === 4 && args[2] !== "--publish-delay")) throw new Error("Use --helper <installed-skill>/scripts/exchange.mjs [--publish-delay SECONDS]");
const publishDelay = Number(args[3] ?? 1.6);
if (!Number.isFinite(publishDelay) || publishDelay < 1 || publishDelay > 240) throw new Error("Publish delay must be 1–240 seconds, below the five-minute deadline.");
const helper = realpathSync(resolve(args[1]));
const tempRoot = realpathSync(tmpdir());
const project = realpathSync(mkdtempSync(join(tempRoot, "uas-installed-watch-")));
const run = args => JSON.parse(execFileSync(process.execPath, [helper, ...args], { encoding: "utf8", windowsHide: true, timeout: 15000 }));
let child;
try {
  const initial = run(["start", "--project", project, "--task", "Simulated installed watcher test", "--source", "smoke fixture"]);
  const r = initial.report;
  const selected = ["--project", project, "--work-item", r.workItemId, "--worker", r.workerId, "--assignment", r.assignmentId];
  // Omit --timeout to exercise the installed CLI's actual five-minute default.
  child = spawn(process.execPath, [helper, "watch-result", ...selected], { windowsHide: true, timeout: 310000, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errors = "";
  child.stdout.on("data", value => { output += value; });
  child.stderr.on("data", value => { errors += value; });
  const done = new Promise((resolve, reject) => { child.on("error", reject); child.on("close", code => resolve(code)); });
  await new Promise(resolve => setTimeout(resolve, publishDelay * 1000));
  assert.equal(output, "", "no repeated status output while waiting");
  const input = join(dirname(initial.path), `${r.workerId}.result-input`);
  writeFileSync(input, JSON.stringify({ status: "ready-for-review", summary: "Simulated completion, not a product test or AI review.", checks: [] }));
  const published = run(["publish", ...selected, "--expected-digest", initial.digest, "--workspace", project, "--input", input]);
  assert.equal(await done, 0, errors);
  const event = JSON.parse(output);
  assert.equal(event.event, "review-ready");
  assert.equal(event.digest, published.digest);
  assert.equal(event.timeoutSeconds, 300);
  assert.equal(Date.parse(event.deadlineAt) - Date.parse(event.startedAt), 300000);
  assert.equal(event.reportUpdatedAt, published.report.updatedAt);
  assert.ok(Date.parse(event.reportUpdatedAt) >= Date.parse(event.startedAt));
  assert.ok(Date.parse(event.finishedAt) >= Date.parse(event.reportUpdatedAt));
  assert.ok(event.fileChecks >= 2);
  const duplicate = run(["watch-result", ...selected, "--after", event.digest, "--timeout", "0.1"]);
  assert.equal(duplicate.event, "deadline-reached");
  assert.equal(run(["discover", "--project", project, "--query", "smoke fixture"]).candidates.length, 1);
  console.log(JSON.stringify({ helper, result: "passed", publishDelaySeconds: publishDelay, event, duplicate: duplicate.event, scope: "One local watcher and a separate simulated publisher. No model APIs or agent sessions invoked; no idle-chat wake-up or review tested." }, null, 2));
} finally {
  if (child && child.exitCode === null) child.kill();
  if (dirname(project) !== tempRoot || !project.startsWith(join(tempRoot, "uas-installed-watch-"))) throw new Error("Refusing unexpected cleanup target");
  rmSync(project, { recursive: true, force: true });
}
