import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

import {
  activateWorkItem,
  ensureConfig,
  ensureGitignore,
  exportHandoff,
  HOOK_CONTRACT,
  parseFrontmatter,
  processContinuityEvent,
  reconcileCheckpoint,
  recordContinuityDiagnostic,
  redactSensitive,
  saveCheckpoint,
  saveWorkItemCapsule,
  thresholdReport,
  validateConfig,
  validateCheckpoint,
} from "../.agents/universal-agent-skills/runtime/core.mjs";
import {
  adapterStatus,
  installAdapters,
  removeAdapters,
} from "../.agents/universal-agent-skills/runtime/adapters.mjs";
import { HOOK_CONTRACT as cliHookContract, main } from "../.agents/universal-agent-skills/runtime/cli.mjs";

const repository = join(dirname(fileURLToPath(import.meta.url)), "..");
const setupCli = join(repository, "skills", "engineering", "setup-universal-agent-skills", "scripts", "universal-agent-skills.mjs");

function workspace(t, prefix = "uas-test-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(path, value) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, value, "utf8");
}

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function initGit(root) {
  const commands = [
    ["init", "-b", "main"],
    ["config", "user.email", "tests@example.invalid"],
    ["config", "user.name", "Universal Agent Skills tests"],
  ];
  for (const args of commands) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  }
  write(join(root, "README.md"), "fixture\n");
  assert.equal(spawnSync("git", ["add", "README.md"], { cwd: root, windowsHide: true }).status, 0);
  assert.equal(spawnSync("git", ["commit", "-m", "fixture"], { cwd: root, windowsHide: true }).status, 0);
}

function captureIo(stdin = "") {
  const writes = [];
  const errors = [];
  let exitCode = 0;
  return {
    io: {
      write: (value) => writes.push(String(value)),
      error: (value) => errors.push(String(value)),
      readStdin: () => stdin,
      setExitCode: (value) => { exitCode = value; },
    },
    writes,
    errors,
    get exitCode() { return exitCode; },
  };
}

function runCli(path, args, { cwd, stdin = "" } = {}) {
  return spawnSync(process.execPath, [path, ...args], {
    cwd,
    input: stdin,
    encoding: "utf8",
    windowsHide: true,
  });
}

function runCliAsync(path, args, { cwd, stdin = "" } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [path, ...args], {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

function runInstalledHook(handler, cwd, payload) {
  const input = typeof payload === "string" ? payload : `${JSON.stringify(payload)}\n`;
  return process.platform === "win32"
    ? spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", handler.commandWindows], {
        cwd, input, encoding: "utf8", windowsHide: true,
      })
    : spawnSync("sh", ["-c", handler.command], { cwd, input, encoding: "utf8" });
}

function readJsonLines(path) {
  return readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function installFixtureRuntime(root, contextWindow = 200000) {
  const setup = runCli(setupCli, ["setup", "--hosts", "none", "--context-window", String(contextWindow), "--project", root], { cwd: root });
  assert.equal(setup.status, 0, setup.stderr);
  return join(root, ".agents", "universal-agent-skills", "runtime", "cli.mjs");
}

function snapshotTree(root) {
  const entries = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === ".git") continue;
      const full = join(dir, name);
      const info = statSync(full);
      if (info.isDirectory()) walk(full);
      else entries.push(`${full.slice(root.length)}:${info.mtimeMs}:${info.size}`);
    }
  };
  walk(root);
  return entries.sort();
}

test("installed CLI migrates schema-v1 configuration and resolves utilization policy", (t) => {
  const root = workspace(t, "uas-policy-");
  initGit(root);
  const configPath = join(root, ".agents", "universal-agent-skills", "config.json");
  write(configPath, `${JSON.stringify({
    schemaVersion: 1,
    thresholdTokens: 123456,
    designRoot: "product/design",
    stateRoot: "private/continuity",
    frontendDesignVariants: 3,
    phaseBoundaryCheckpointing: false,
    policy: { checkpointUtilization: 0.65 },
    userExtension: { retained: true },
  }, null, 2)}\n`);

  const setup = runCli(setupCli, ["setup", "--hosts", "none", "--context-window", "200000", "--project", root], { cwd: root });
  assert.equal(setup.status, 0, setup.stderr);
  const migrated = json(configPath);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.thresholdTokens, 123456);
  assert.equal(migrated.designRoot, "product/design");
  assert.equal(migrated.stateRoot, "private/continuity");
  assert.equal(migrated.phaseBoundaryCheckpointing, false);
  assert.deepEqual(migrated.userExtension, { retained: true });
  assert.deepEqual(migrated.policy, {
    checkpointUtilization: 0.65,
    compactUtilization: 0.78,
    minimumReserveTokens: 30000,
    capsuleBudgetTokens: 500,
  });

  const installedCli = join(root, ".agents", "universal-agent-skills", "runtime", "cli.mjs");
  const threshold = runCli(installedCli, ["threshold", "--context-window", "200000", "--project", root], { cwd: root });
  assert.equal(threshold.status, 0, threshold.stderr);
  assert.deepEqual(JSON.parse(threshold.stdout), {
    policy: migrated.policy,
    detectedContextWindow: 200000,
    contextWindowVerified: true,
    checkpointTokens: 130000,
    compactTokens: 156000,
    reserveTokens: 44000,
    capsuleBudgetTokens: 500,
    effectiveTokens: 156000,
    effectivePercent: 78,
  });
});

test("installed CLI activates, checkpoints, and resumes one session-bound work item", (t) => {
  const root = workspace(t, "uas-work-item-");
  initGit(root);
  const installedCli = installFixtureRuntime(root);

  const activate = runCli(installedCli, [
    "activate",
    "--work-item", "issue-4",
    "--harness", "codex",
    "--session", "session-one",
    "--project", root,
  ], { cwd: root });
  assert.equal(activate.status, 0, activate.stderr);
  assert.deepEqual(JSON.parse(activate.stdout), {
    ok: true,
    workItemId: "issue-4",
    created: true,
    revision: 0,
    binding: { harness: "codex", sessionId: "session-one" },
  });

  const checkpoint = runCli(installedCli, [
    "checkpoint",
    "--harness", "codex",
    "--session", "session-one",
    "--expected-revision", "0",
    "--objective", "Implement issue #4.",
    "--success-criteria", "The manual lifecycle passes through the installed CLI.",
    "--phase", "Implementation",
    "--decisions", "Use one capsule per Work Item ID.",
    "--validation", "The process-level test is red before implementation.",
    "--blockers", "None.",
    "--next", "Run the focused test green.",
    "--pointers", "https://github.com/kaizen2026/universal-agent-skills/issues/4",
    "--project", root,
  ], { cwd: root });
  assert.equal(checkpoint.status, 0, checkpoint.stderr);
  const saved = JSON.parse(checkpoint.stdout);
  assert.equal(saved.workItemId, "issue-4");
  assert.equal(saved.resolution, "session-binding");
  assert.equal(saved.revision, 1);

  const capsulePath = join(root, ".agents", "state", "continuity", "work-items", "issue-4", "semantic.md");
  const capsule = readFileSync(capsulePath, "utf8");
  assert.match(capsule, /^schemaVersion: 1$/m);
  assert.match(capsule, /^workItemId: issue-4$/m);
  assert.match(capsule, /^revision: 1$/m);
  assert.match(capsule, /## Objective\s+Implement issue #4\./);
  assert.match(capsule, /## Success criteria\s+The manual lifecycle passes through the installed CLI\./);
  assert.match(capsule, /## Next action\s+Run the focused test green\./);

  const resumed = runCli(installedCli, [
    "resume",
    "--harness", "codex",
    "--session", "session-one",
    "--project", root,
  ], { cwd: root });
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stdout, /Resolution: `session-binding`/);
  assert.match(resumed.stdout, /Work Item: `issue-4`/);
  assert.match(resumed.stdout, /Implement issue #4\./);

  const second = runCli(installedCli, [
    "activate",
    "--work-item", "issue-5",
    "--harness", "codex",
    "--session", "session-one",
    "--project", root,
  ], { cwd: root });
  assert.equal(second.status, 0, second.stderr);
  const explicit = runCli(installedCli, [
    "resume",
    "--work-item", "issue-4",
    "--harness", "codex",
    "--session", "session-one",
    "--project", root,
  ], { cwd: root });
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.match(explicit.stdout, /Resolution: `explicit`/);
  assert.match(explicit.stdout, /Work Item: `issue-4`/);

  const unbound = runCli(installedCli, [
    "resume",
    "--harness", "codex",
    "--session", "session-without-binding",
    "--project", root,
  ], { cwd: root });
  assert.equal(unbound.status, 2, unbound.stderr);
  assert.match(unbound.stdout, /No active work item/);
  assert.doesNotMatch(unbound.stdout, /issue-4/);

  write(join(root, "advance.txt"), "advanced\n");
  assert.equal(spawnSync("git", ["add", "advance.txt"], { cwd: root, windowsHide: true }).status, 0);
  assert.equal(spawnSync("git", ["commit", "-m", "advance after capsule"], { cwd: root, windowsHide: true }).status, 0);
  const stale = runCli(installedCli, [
    "resume", "--work-item", "issue-4", "--project", root,
  ], { cwd: root });
  assert.equal(stale.status, 2, stale.stderr);
  assert.match(stale.stdout, /\| Git HEAD \| Changed \|/);
});

test("checkpoint rejects a valueless CLI flag instead of writing the literal word \"true\" into a capsule field", (t) => {
  const root = workspace(t, "uas-checkpoint-valueless-flag-");
  initGit(root);
  const installedCli = installFixtureRuntime(root);
  assert.equal(runCli(installedCli, [
    "activate", "--work-item", "issue-9", "--harness", "codex", "--session", "session-one", "--project", root,
  ], { cwd: root }).status, 0);

  const rejected = runCli(installedCli, [
    "checkpoint", "--work-item", "issue-9", "--harness", "codex", "--session", "session-one",
    "--expected-revision", "0", "--objective", "Implement issue #9.",
    "--project", root,
    "--blockers",
  ], { cwd: root });
  assert.notEqual(rejected.status, 0, rejected.stdout);
  assert.match(rejected.stderr, /--blockers requires a text value/);

  const capsulePath = join(root, ".agents", "state", "continuity", "work-items", "issue-9", "semantic.md");
  const capsule = readFileSync(capsulePath, "utf8");
  assert.match(capsule, /^revision: 0$/m, "a rejected checkpoint must not advance the capsule revision");
  assert.doesNotMatch(capsule, /## Blockers\s+true/, "a rejected checkpoint must not write the literal word \"true\" into a capsule field");
});

test("installed CLI accepts an explicit work item without a session binding", (t) => {
  const root = workspace(t, "uas-explicit-work-item-");
  initGit(root);
  const installedCli = installFixtureRuntime(root);
  const activate = runCli(installedCli, [
    "activate", "--work-item", "issue-4", "--harness", "codex", "--session", "initial-session", "--project", root,
  ], { cwd: root });
  assert.equal(activate.status, 0, activate.stderr);

  const checkpoint = runCli(installedCli, [
    "checkpoint", "--work-item", "issue-4", "--expected-revision", "0", "--objective", "Explicit identity wins.", "--project", root,
  ], { cwd: root });
  assert.equal(checkpoint.status, 0, checkpoint.stderr);
  assert.equal(JSON.parse(checkpoint.stdout).resolution, "explicit");
  const capsule = readFileSync(join(root, ".agents", "state", "continuity", "work-items", "issue-4", "semantic.md"), "utf8");
  assert.match(capsule, /^updatedByHarness: other$/m);
  assert.match(capsule, /^updatedBySession: manual$/m);
});

test("installed CLI serializes concurrent first activation of one work item", async (t) => {
  const root = workspace(t, "uas-concurrent-activation-");
  initGit(root);
  const installedCli = installFixtureRuntime(root);
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => runCliAsync(installedCli, [
    "activate", "--work-item", "issue-5", "--harness", "codex", "--session", `joiner-${index + 1}`, "--project", root,
  ], { cwd: root })));

  assert.equal(results.every((result) => result.status === 0), true, results.map((result) => result.stderr).join("\n"));
  const activations = results.map((result) => JSON.parse(result.stdout));
  assert.equal(activations.filter((result) => result.created).length, 1);
  assert.equal(activations.every((result) => result.revision === 0), true);
  const capsule = readFileSync(join(root, ".agents", "state", "continuity", "work-items", "issue-5", "semantic.md"), "utf8");
  assert.match(capsule, /^revision: 0$/m);
  assert.equal(readdirSync(join(root, ".agents", "state", "continuity", "bindings", "codex")).length, 6);
});

test("installed CLI retains a stale capsule update as a redacted merge proposal", (t) => {
  const root = workspace(t, "uas-stale-proposal-");
  initGit(root);
  const installedCli = installFixtureRuntime(root);
  const activate = runCli(installedCli, [
    "activate", "--work-item", "issue-5", "--harness", "codex", "--session", "writer-one", "--project", root,
  ], { cwd: root });
  assert.equal(activate.status, 0, activate.stderr);

  const accepted = runCli(installedCli, [
    "checkpoint", "--work-item", "issue-5", "--harness", "codex", "--session", "writer-one",
    "--expected-revision", "0", "--objective", "Accepted update.", "--project", root,
  ], { cwd: root });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).revision, 1);

  const advanced = runCli(installedCli, [
    "checkpoint", "--work-item", "issue-5", "--harness", "codex", "--session", "writer-one",
    "--expected-revision", "1", "--phase", "Second accepted update.", "--project", root,
  ], { cwd: root });
  assert.equal(advanced.status, 0, advanced.stderr);
  assert.equal(JSON.parse(advanced.stdout).revision, 2);

  const staleObjective = `Preserve ghp_abcdefghijklmnopqrstuvwxyz1234567890 as a proposal. ${"x".repeat(13000)}`;
  const stale = runCli(installedCli, [
    "checkpoint", "--work-item", "issue-5", "--harness", "claude", "--session", "ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    "--expected-revision", "0", "--objective", staleObjective, "--project", root,
  ], { cwd: root });
  assert.equal(stale.status, 2, stale.stderr);
  const result = JSON.parse(stale.stdout);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "stale-revision");
  assert.equal(result.baseRevision, 0);
  assert.equal(result.currentRevision, 2);
  assert.equal(result.proposal.truncated, true);

  const capsulePath = join(root, ".agents", "state", "continuity", "work-items", "issue-5", "semantic.md");
  const capsule = readFileSync(capsulePath, "utf8");
  assert.match(capsule, /^revision: 2$/m);
  assert.match(capsule, /Accepted update\./);
  assert.match(capsule, /Second accepted update\./);
  assert.doesNotMatch(capsule, /Preserve/);

  const proposalDirectory = join(root, ".agents", "state", "continuity", "work-items", "issue-5", "proposals");
  const proposalFiles = readdirSync(proposalDirectory);
  assert.equal(proposalFiles.length, 1);
  const proposal = json(join(proposalDirectory, proposalFiles[0]));
  assert.equal(proposal.baseRevision, 0);
  assert.equal(proposal.currentRevision, 2);
  assert.deepEqual(proposal.provenance, { harness: "claude", sessionId: "[REDACTED_TOKEN]" });
  assert.equal(proposal.truncated, true);
  assert.equal(proposal.fields.objective.length, 12000);
  assert.match(proposal.fields.objective, /\[REDACTED_TOKEN\]/);
  assert.doesNotMatch(JSON.stringify(proposal), /ghp_abcdefghijklmnopqrstuvwxyz1234567890/);
});

test("installed CLI rejects semantic updates without an expected revision", (t) => {
  const root = workspace(t, "uas-required-revision-");
  initGit(root);
  const installedCli = installFixtureRuntime(root);
  const activate = runCli(installedCli, [
    "activate", "--work-item", "issue-5", "--harness", "codex", "--session", "writer-one", "--project", root,
  ], { cwd: root });
  assert.equal(activate.status, 0, activate.stderr);

  const rejected = runCli(installedCli, [
    "checkpoint", "--work-item", "issue-5", "--objective", "No implicit base revision.", "--project", root,
  ], { cwd: root });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /--expected-revision must be a non-negative integer/);
  const capsule = readFileSync(join(root, ".agents", "state", "continuity", "work-items", "issue-5", "semantic.md"), "utf8");
  assert.match(capsule, /^revision: 0$/m);
  assert.doesNotMatch(capsule, /No implicit base revision/);
});

test("installed CLI preserves every concurrent child-process contribution", async (t) => {
  const root = workspace(t, "uas-concurrent-proposals-");
  initGit(root);
  const installedCli = installFixtureRuntime(root);
  const activate = runCli(installedCli, [
    "activate", "--work-item", "issue-5", "--harness", "codex", "--session", "coordinator", "--project", root,
  ], { cwd: root });
  assert.equal(activate.status, 0, activate.stderr);

  const contributions = Array.from({ length: 6 }, (_, index) => `Concurrent contribution ${index + 1}.`);
  const results = await Promise.all(contributions.map((objective, index) => runCliAsync(installedCli, [
    "checkpoint", "--work-item", "issue-5", "--harness", "codex", "--session", `writer-${index + 1}`,
    "--expected-revision", "0", "--objective", objective, "--project", root,
  ], { cwd: root })));

  assert.equal(results.filter((result) => result.status === 0).length, 1, results.map((result) => result.stderr).join("\n"));
  assert.equal(results.filter((result) => result.status === 2).length, contributions.length - 1);
  const capsulePath = join(root, ".agents", "state", "continuity", "work-items", "issue-5", "semantic.md");
  const capsule = readFileSync(capsulePath, "utf8");
  assert.match(capsule, /^revision: 1$/m);

  const proposalDirectory = join(root, ".agents", "state", "continuity", "work-items", "issue-5", "proposals");
  const proposals = readdirSync(proposalDirectory).map((name) => json(join(proposalDirectory, name)));
  assert.equal(proposals.length, contributions.length - 1);
  const persisted = [capsule, ...proposals.map((proposal) => JSON.stringify(proposal))].join("\n");
  for (const contribution of contributions) assert.match(persisted, new RegExp(contribution.replace(".", "\\.")));

  const resumed = runCli(installedCli, ["resume", "--work-item", "issue-5", "--project", root], { cwd: root });
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stdout, /Capsule revision: 1/);
});

test("installed CLI times out without stealing an abandoned work-item lock", (t) => {
  const root = workspace(t, "uas-abandoned-lock-");
  initGit(root);
  const installedCli = installFixtureRuntime(root);
  const activate = runCli(installedCli, [
    "activate", "--work-item", "issue-5", "--harness", "codex", "--session", "writer-one", "--project", root,
  ], { cwd: root });
  assert.equal(activate.status, 0, activate.stderr);

  const lockDirectory = join(root, ".agents", "state", "continuity", "work-items", "issue-5", ".update.lock");
  mkdirSync(lockDirectory);
  write(join(lockDirectory, "owner.json"), `${JSON.stringify({
    schemaVersion: 1,
    token: "abandoned-owner",
    pid: 999999,
    acquiredAt: "2026-09-01T00:00:00.000Z",
  }, null, 2)}\n`);

  const blocked = runCli(installedCli, [
    "checkpoint", "--work-item", "issue-5", "--expected-revision", "0", "--objective", "Must not be written.",
    "--lock-timeout-ms", "50", "--project", root,
  ], { cwd: root });
  assert.equal(blocked.status, 2, blocked.stderr);
  const result = JSON.parse(blocked.stdout);
  assert.equal(result.reason, "lock-unavailable");
  assert.match(result.message, /retained.*manually/i);
  assert.equal(existsSync(lockDirectory), true);
  assert.equal(json(join(lockDirectory, "owner.json")).token, "abandoned-owner");
  const capsule = readFileSync(join(root, ".agents", "state", "continuity", "work-items", "issue-5", "semantic.md"), "utf8");
  assert.match(capsule, /^revision: 0$/m);
  assert.doesNotMatch(capsule, /Must not be written/);
});

test("installed CLI keeps workspace-wide checkpoints as explicit legacy evidence", (t) => {
  const root = workspace(t, "uas-legacy-evidence-");
  initGit(root);
  const { config } = ensureConfig(root);
  ensureGitignore(root, config);
  saveCheckpoint({
    project: root,
    config,
    harness: "claude",
    event: "interruption",
    fields: {
      objective: "Legacy objective must not reactivate itself.",
      next: "Import or inspect this evidence explicitly.",
    },
  });
  const installedCli = installFixtureRuntime(root);

  const automatic = runCli(installedCli, [
    "resume",
    "--harness", "codex",
    "--session", "unbound-session",
    "--project", root,
  ], { cwd: root });
  assert.equal(automatic.status, 2, automatic.stderr);
  assert.match(automatic.stdout, /No active work item/);
  assert.doesNotMatch(automatic.stdout, /Legacy objective/);

  const hook = runCli(installedCli, [
    "hook", "codex", "SessionStart", "--project", root,
  ], { cwd: root, stdin: JSON.stringify({ session_id: "unbound-session", source: "compact" }) });
  assert.equal(hook.status, 0, hook.stderr);
  const hookContext = JSON.parse(hook.stdout).systemMessage;
  assert.match(hookContext, /No active work item/);
  assert.doesNotMatch(hookContext, /Legacy objective/);

  const explicit = runCli(installedCli, [
    "resume",
    "--input", join(config.stateRoot, "current.md"),
    "--project", root,
  ], { cwd: root });
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.match(explicit.stdout, /Legacy continuity evidence \(explicit only\)/);
  assert.match(explicit.stdout, /Legacy objective must not reactivate itself\./);
});

test("schema v2 requires valid policy and exactly three frontend design variants", (t) => {
  const root = workspace(t, "uas-config-shape-");
  const valid = ensureConfig(root).config;
  assert.doesNotThrow(() => validateConfig(valid));
  assert.throws(
    () => validateConfig({ ...valid, frontendDesignVariants: 2 }),
    /must be exactly 3/,
  );
  assert.throws(() => validateConfig({ ...valid, phaseBoundaryCheckpointing: "yes" }), /must be a boolean/);
  assert.throws(() => validateConfig({ ...valid, stateRoot: "../outside" }), /project-relative path/);
  assert.throws(
    () => validateConfig({ ...valid, policy: { ...valid.policy, checkpointUtilization: 0.8 } }),
    /compactUtilization must be greater/,
  );
  assert.throws(
    () => validateConfig({ ...valid, policy: { ...valid.policy, minimumReserveTokens: 0 } }),
    /minimumReserveTokens must be a positive integer/,
  );
  assert.throws(
    () => validateConfig({ ...valid, policy: { ...valid.policy, checkpointUtilization: "0.68" } }),
    /checkpointUtilization must be a number/,
  );
  const custom = { ...valid, stateRoot: "private/checkpoints" };
  assert.doesNotThrow(() => validateConfig(custom));
  ensureGitignore(root, custom);
  assert.match(readFileSync(join(root, ".gitignore"), "utf8"), /private\/checkpoints\//);
});

test("thresholdReport never throws for a valid context window, even where the reserve clamp would otherwise invert checkpoint and compact", (t) => {
  const root = workspace(t, "uas-threshold-small-window-");
  const { config } = ensureConfig(root);
  for (const contextWindow of [31000, 40000, 50000, 75000, 93750, 128000, 200000, 1000000]) {
    const report = thresholdReport(config, contextWindow);
    assert.equal(report.checkpointTokens < report.compactTokens, true, `checkpoint must stay below compact at ${contextWindow}`);
    assert.equal(report.checkpointTokens >= 1, true, `checkpoint must be a positive count at ${contextWindow}`);
    assert.equal(report.reserveTokens >= config.policy.minimumReserveTokens, true, `reserve must hold at ${contextWindow}`);
  }
  assert.equal(thresholdReport(config, 128000).checkpointTokens, 87040, "the common large-window case is unchanged");
  assert.equal(thresholdReport(config, 200000).checkpointTokens, 136000, "the common large-window case is unchanged");
  assert.throws(
    () => thresholdReport(config, 30001 - 1),
    /must exceed policy.minimumReserveTokens/,
  );
  assert.throws(
    () => thresholdReport(config, 30001),
    /too small to support the configured checkpoint\/compact\/reserve policy/,
    "a window with almost no headroom above the reserve must fail clearly rather than silently returning a degenerate threshold",
  );
});

test("redaction removes tokens, credentials, email, URL auth, and private keys", () => {
  const source = [
    "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
    "password=hunter2",
    "developer@example.com",
    "https://alice:supersecret@example.com/path",
    "Authorization: Bearer topsecretvalue",
    '{"password":"top secret"}',
    "client_secret='quoted secret value'",
    "AWS_SECRET_ACCESS_KEY=plainsecretvalue",
    "AccountKey=storageaccountsecret",
    "glpat-abcdefghijklmnopqrstuv",
    "eyJabcdefghijk.abcdefghijkl.abcdefghijkl",
    "-----BEGIN PRIVATE KEY-----\nsecret-body\n-----END PRIVATE KEY-----",
  ].join("\n");
  const redacted = redactSensitive(source);
  for (const secret of [
    "abcdefghijklmnopqrstuvwxyz123456",
    "hunter2",
    "developer@example.com",
    "supersecret",
    "topsecretvalue",
    "top secret",
    "quoted secret value",
    "plainsecretvalue",
    "storageaccountsecret",
    "abcdefghijklmnopqrstuv",
    "eyJabcdefghijk",
    "secret-body",
  ]) {
    assert.equal(redacted.includes(secret), false, secret);
  }
  assert.match(redacted, /REDACTED_TOKEN/);
  assert.match(redacted, /REDACTED_PRIVATE_KEY/);
});

test("cli.mjs re-exports the runtime's HOOK_CONTRACT for external delegating wrappers", () => {
  assert.equal(typeof HOOK_CONTRACT, "string");
  assert.equal(HOOK_CONTRACT.length > 0, true);
  assert.equal(cliHookContract, HOOK_CONTRACT);
});

test("retention prunes bounded event and diagnostic history without touching the current capsule or merge proposals", (t) => {
  const root = workspace(t, "uas-retention-");
  initGit(root);
  const { config: baseConfig } = ensureConfig(root);
  ensureGitignore(root, baseConfig);
  const config = {
    ...baseConfig,
    retention: { ...baseConfig.retention, maxEvents: 3, eventDays: 3650, maxDiagnostics: 3, diagnosticDays: 3650 },
  };
  activateWorkItem({ project: root, config, workItemId: "issue-8", harness: "claude", sessionId: "session-a" });

  for (let index = 0; index < 6; index += 1) {
    processContinuityEvent({
      project: root,
      config,
      harness: "claude",
      sessionId: "session-a",
      kind: "pre-compact",
      input: { turn_id: `turn-${index}`, trigger: "auto" },
      action: () => ({ transition: "checkpoint-recorded", reconciliation: "not-applicable", injectedTokenEstimate: 0 }),
    });
  }
  const eventsPath = join(root, ".agents", "state", "continuity", "work-items", "issue-8", "events.jsonl");
  const events = readJsonLines(eventsPath);
  assert.equal(events.length, 3);
  assert.equal(events.at(-1).nativeIdentity, "turn-5");

  for (let index = 0; index < 6; index += 1) {
    recordContinuityDiagnostic({ project: root, config, harness: "claude", sessionId: "session-a", event: "PreCompact", message: `Degraded ${index}.` });
  }
  const diagnosticsPath = join(root, ".agents", "state", "continuity", "diagnostics.jsonl");
  const diagnostics = readJsonLines(diagnosticsPath);
  assert.equal(diagnostics.length, 3);
  assert.equal(diagnostics.at(-1).message, "Degraded 5.");

  for (let index = 0; index < 6; index += 1) {
    saveWorkItemCapsule({
      project: root, config, workItemId: "issue-8", harness: "claude", sessionId: "session-a",
      expectedRevision: 999, fields: { objective: `Stale ${index}.` },
    });
  }
  const proposalsDir = join(root, ".agents", "state", "continuity", "work-items", "issue-8", "proposals");
  assert.equal(readdirSync(proposalsDir).length, 6, "merge proposals require an explicit human decision and are never auto-pruned");

  const capsule = readFileSync(join(root, ".agents", "state", "continuity", "work-items", "issue-8", "semantic.md"), "utf8");
  assert.match(capsule, /^revision: 0$/m, "pruning must never touch the current capsule");
});

test("status commands never mutate local continuity state", (t) => {
  const root = workspace(t, "uas-status-readonly-");
  initGit(root);
  const setup = runCli(setupCli, ["setup", "--hosts", "codex", "--context-window", "128000", "--project", root], { cwd: root });
  assert.equal(setup.status, 0, setup.stderr);
  const installedCli = join(root, ".agents", "universal-agent-skills", "runtime", "cli.mjs");
  assert.equal(runCli(installedCli, [
    "activate", "--work-item", "issue-8", "--harness", "codex", "--session", "session-a", "--project", root,
  ], { cwd: root }).status, 0);
  assert.equal(runCli(installedCli, [
    "checkpoint", "--work-item", "issue-8", "--harness", "codex", "--session", "session-a",
    "--expected-revision", "0", "--objective", "Prove status is read-only.", "--project", root,
  ], { cwd: root }).status, 0);

  const before = snapshotTree(root);
  const first = runCli(installedCli, ["status", "--project", root], { cwd: root });
  assert.equal(first.status, 0, first.stderr);
  const second = runCli(installedCli, ["status", "--context-window", "128000", "--project", root], { cwd: root });
  assert.equal(second.status, 0, second.stderr);
  const after = snapshotTree(root);
  assert.deepEqual(after, before);
  assert.doesNotThrow(() => JSON.parse(first.stdout));
});

test("identity validation rejects path traversal and malformed work-item, harness, and session identifiers", (t) => {
  const root = workspace(t, "uas-identity-");
  initGit(root);
  const installedCli = installFixtureRuntime(root);

  for (const workItemId of ["../../escape", "..", "a/../../b", "a\\..\\b", "/etc/passwd"]) {
    const attempt = runCli(installedCli, [
      "activate", "--work-item", workItemId, "--harness", "claude", "--session", "session-a", "--project", root,
    ], { cwd: root });
    assert.notEqual(attempt.status, 0, `expected rejection for work-item ${JSON.stringify(workItemId)}`);
  }
  assert.equal(existsSync(join(root, "..", "escape")), false);
  assert.equal(existsSync(join(dirname(root), "escape")), false);
  assert.equal(existsSync("/etc/passwd.agents"), false);

  const stateRoot = join(root, ".agents", "state", "continuity", "work-items");
  assert.equal(existsSync(stateRoot) && readdirSync(stateRoot).length > 0, false);

  const legitimate = runCli(installedCli, [
    "activate", "--work-item", "issue-8", "--harness", "claude", "--session", "session-a", "--project", root,
  ], { cwd: root });
  assert.equal(legitimate.status, 0, legitimate.stderr);
  assert.deepEqual(readdirSync(stateRoot), ["issue-8"]);
});

test("checkpoint refresh archives the prior version and updates supplied sections", (t) => {
  const root = workspace(t);
  initGit(root);
  const { config } = ensureConfig(root);
  ensureGitignore(root);
  write(join(root, "work.txt"), "dirty\n");

  const first = saveCheckpoint({
    project: root,
    config,
    harness: "codex",
    event: "phase-boundary",
    fields: {
      objective: "Ship the fixture without sk-proj-abcdefghijklmnopqrstuvwxyz123456",
      phase: "Design complete",
      decisions: "Use option A; reject B because it is slower.",
      completed: "`node --test`: exit 0",
      pointers: `[README](README.md)\n\nLocal cache: ${join(homedir(), "private-cache")}`,
      risks: "None known.",
      next: "Implement the adapter fixture.",
      skills: "Use /resume-work, then /tdd.",
    },
  });
  assert.equal(first.validation.valid, true);
  assert.equal(first.document.includes("abcdefghijklmnopqrstuvwxyz123456"), false);

  const second = saveCheckpoint({
    project: root,
    config,
    harness: "claude",
    event: "interruption",
    fields: {
      phase: "Implementation in progress",
      completed: "`node --test`: 8 passed",
      next: "Run the adapter removal test.",
    },
  });
  assert.match(second.document, /Implementation in progress/);
  assert.match(second.document, /8 passed/);
  assert.match(second.document, /Run the adapter removal test/);
  assert.equal(validateCheckpoint(second.document).valid, true);

  const history = readdirSync(join(root, config.stateRoot, "history"));
  assert.equal(history.length, 1);
  const reconciliation = reconcileCheckpoint(root, config);
  assert.equal(reconciliation.ok, true, reconciliation.report);
  assert.equal(reconciliation.claims.find((claim) => claim.item === "Git HEAD").status, "Confirmed");
  assert.equal(reconciliation.claims.find((claim) => claim.item === "Pointer README.md").status, "Confirmed");

  assert.equal(spawnSync("git", ["add", ".gitignore", "work.txt"], { cwd: root, windowsHide: true }).status, 0);
  assert.equal(spawnSync("git", ["commit", "-m", "advance before handoff"], { cwd: root, windowsHide: true }).status, 0);
  const staleOutput = ".agents/state/continuity/stale-portable.md";
  const staleHandoff = exportHandoff({ project: root, config, outputPath: staleOutput, destination: "Cursor" });
  assert.equal(staleHandoff.path, join(root, staleOutput));
  assert.equal(reconcileCheckpoint(root, config, staleOutput).ok, false);
  assert.equal(reconcileCheckpoint(root, config, staleOutput).claims.find((claim) => claim.item === "Git HEAD").status, "Changed");

  saveCheckpoint({
    project: root,
    config,
    harness: "claude",
    event: "phase-boundary",
    fields: {
      phase: "Implementation verified at the current HEAD",
      completed: "`node --test`: exit 0 at the current HEAD",
      next: "Export the reconciled handoff.",
    },
  });
  const output = ".agents/state/continuity/portable.md";
  const handoff = exportHandoff({ project: root, config, outputPath: output, destination: "Cursor" });
  assert.equal(handoff.path, join(root, output));
  assert.match(handoff.document, /Portable work handoff/);
  assert.match(handoff.document, /Export-time reconciliation/);
  assert.equal(handoff.document.includes("abcdefghijklmnopqrstuvwxyz123456"), false);
  assert.equal(handoff.document.includes(homedir()), false);
  assert.match(handoff.document, /\[USER_HOME\]/);
  assert.equal(validateCheckpoint(handoff.document).valid, true);
  assert.equal(reconcileCheckpoint(root, config, output).ok, true);
  assert.equal(reconcileCheckpoint(root, config, output).claims.find((claim) => claim.item === "Git HEAD").status, "Confirmed");

  write(join(root, "later.txt"), "newer\n");
  assert.equal(spawnSync("git", ["add", "later.txt"], { cwd: root, windowsHide: true }).status, 0);
  assert.equal(spawnSync("git", ["commit", "-m", "advance after handoff"], { cwd: root, windowsHide: true }).status, 0);
  const stale = reconcileCheckpoint(root, config, output);
  assert.equal(stale.ok, false);
  assert.equal(stale.claims.find((claim) => claim.item === "Git HEAD").status, "Changed");
});

test("legacy lifecycle observations preserve provenance without reactivation", async (t) => {
  const root = workspace(t);
  initGit(root);
  const { config } = ensureConfig(root);
  ensureGitignore(root, config);
  const saved = saveCheckpoint({
    project: root,
    config,
    harness: "claude",
    event: "phase-boundary",
    fields: {
      objective: "Keep the validation claim tied to its source commit.",
      completed: "`node --test`: exit 0",
      next: "Advance the repository.",
    },
  });
  const before = parseFrontmatter(saved.document);
  write(join(root, "advance.txt"), "advanced\n");
  assert.equal(spawnSync("git", ["add", ".gitignore", "advance.txt"], { cwd: root, windowsHide: true }).status, 0);
  assert.equal(spawnSync("git", ["commit", "-m", "advance"], { cwd: root, windowsHide: true }).status, 0);

  const preCompact = captureIo();
  await main(["hook", "claude", "PreCompact", "--project", root], preCompact.io);
  const afterDocument = readFileSync(join(root, config.stateRoot, "current.md"), "utf8");
  const after = parseFrontmatter(afterDocument);
  assert.equal(after.timestamp, before.timestamp);
  assert.equal(after.gitHead, before.gitHead);
  assert.equal(after.validationGitHead, before.validationGitHead);
  assert.equal(after.lastObservedEvent, "pre-compact");
  assert.equal(reconcileCheckpoint(root, config).ok, false);

  const sessionStart = captureIo();
  await main(["hook", "claude", "SessionStart", "--project", root], sessionStart.io);
  const injected = JSON.parse(sessionStart.writes.at(-1));
  assert.match(injected.hookSpecificOutput.additionalContext, /was not activated/i);
  assert.match(injected.hookSpecificOutput.additionalContext, /No active work item/i);
  assert.doesNotMatch(injected.hookSpecificOutput.additionalContext, /Keep the validation claim/);
});

test("Codex PreCompact without a session_id still preserves legacy checkpoint provenance", async (t) => {
  const root = workspace(t, "uas-codex-legacy-");
  initGit(root);
  const { config } = ensureConfig(root);
  ensureGitignore(root, config);
  const saved = saveCheckpoint({
    project: root,
    config,
    harness: "codex",
    event: "phase-boundary",
    fields: {
      objective: "Keep the validation claim tied to its source commit.",
      completed: "`node --test`: exit 0",
      next: "Advance the repository.",
    },
  });
  const before = parseFrontmatter(saved.document);
  write(join(root, "advance.txt"), "advanced\n");
  assert.equal(spawnSync("git", ["add", ".gitignore", "advance.txt"], { cwd: root, windowsHide: true }).status, 0);
  assert.equal(spawnSync("git", ["commit", "-m", "advance"], { cwd: root, windowsHide: true }).status, 0);

  const preCompact = captureIo(JSON.stringify({ turn_id: "turn-1", trigger: "auto" }));
  await main(["hook", "codex", "PreCompact", "--project", root], preCompact.io);
  const afterDocument = readFileSync(join(root, config.stateRoot, "current.md"), "utf8");
  const after = parseFrontmatter(afterDocument);
  assert.equal(after.timestamp, before.timestamp);
  assert.equal(after.gitHead, before.gitHead);
  assert.equal(after.validationGitHead, before.validationGitHead);
  assert.equal(after.lastObservedEvent, "pre-compact");
  assert.match(JSON.parse(preCompact.writes.at(-1)).systemMessage, /No active work item/i);
});

test("checkpoint schema rejects stale timestamps, unsupported enums, and heading reordering", (t) => {
  const root = workspace(t);
  const { config } = ensureConfig(root);
  const valid = saveCheckpoint({
    project: root,
    config,
    harness: "codex",
    event: "manual",
    fields: { objective: "Validate the schema." },
  }).document;
  assert.equal(validateCheckpoint(valid.replace("originatingHarness: codex", "originatingHarness: banana")).valid, false);
  assert.equal(validateCheckpoint(valid.replace(/^timestamp: .*$/m, "timestamp: Tue, 11 Aug 2026 00:00:00 GMT")).valid, false);
  assert.equal(validateCheckpoint(valid.replace("event: manual", "event: invented")).valid, false);
  assert.equal(validateCheckpoint(valid.replace("status: in-progress", "status: banana")).valid, false);
  const reordered = valid
    .replace("## Objective and success criteria", "## TEMP")
    .replace("## Current phase and completion status", "## Objective and success criteria")
    .replace("## TEMP", "## Current phase and completion status");
  assert.match(validateCheckpoint(reordered).errors.join("\n"), /heading out of order/);

  const stale = valid.replace(/^timestamp: .*$/m, "timestamp: 2000-01-01T00:00:00.000Z");
  const stalePath = join(root, "stale.md");
  write(stalePath, stale);
  const reconciliation = reconcileCheckpoint(root, config, stalePath);
  assert.equal(reconciliation.ok, false);
  assert.equal(reconciliation.claims.find((claim) => claim.item === "Checkpoint age").status, "Changed");
  const staleExport = exportHandoff({
    project: root,
    config,
    inputPath: stalePath,
    outputPath: ".agents/state/continuity/stale-export.md",
  });
  assert.equal(reconcileCheckpoint(root, config, staleExport.path).claims.find((claim) => claim.item === "Checkpoint age").status, "Changed");
});

test("resume reports missing local state instead of inventing continuity", (t) => {
  const root = workspace(t);
  const { config } = ensureConfig(root);
  const result = reconcileCheckpoint(root, config);
  assert.equal(result.ok, false);
  assert.match(result.report, /reconstruct state from tracked issues, specs, ADRs, design contracts, and commits/i);
});

test("host-neutral work items resume through an explicitly joined destination session", async (t) => {
  for (const [origin, destination] of [["claude", "codex"], ["cursor", "copilot"]]) {
    const root = workspace(t, `uas-${origin}-to-${destination}-`);
    initGit(root);
    const originSession = `${origin}-session`;
    const destinationSession = `${destination}-session`;
    const activation = captureIo();
    await main(["activate", "--work-item", "fixture-work", "--harness", origin, "--session", originSession, "--project", root], activation.io);
    const checkpointCapture = captureIo();
    await main([
      "checkpoint",
      "--harness", origin,
      "--session", originSession,
      "--expected-revision", "0",
      "--objective", `Resume ${origin} work in ${destination}.`,
      "--validation", "`node --test`: exit 1; failure preserved for follow-up.",
      "--blockers", "An interrupted fixture command still needs investigation.",
      "--next", "Rerun the failing fixture command.",
      "--project", root,
    ], checkpointCapture.io);
    const joinCapture = captureIo();
    await main(["activate", "--work-item", "fixture-work", "--harness", destination, "--session", destinationSession, "--project", root], joinCapture.io);
    const capture = captureIo();
    await main(["resume", "--harness", destination, "--session", destinationSession, "--project", root], capture.io);
    const context = capture.writes.at(-1);
    assert.match(context, new RegExp(`updatedByHarness: ${origin}`));
    assert.match(context, /exit 1; failure preserved/);
    assert.match(context, /Rerun the failing fixture command/);
  }
});

test("adapters merge, repeat without duplicates, and restore related prior values", (t) => {
  const root = workspace(t, "uas path with spaces-");
  const { config } = ensureConfig(root);
  const antigravitySettings = join(root, "user-config", "settings.json");

  write(join(root, ".codex", "config.toml"), 'model = "gpt-test"\nmodel_auto_compact_token_limit = 999\n\n[features]\nexample = true\n');
  write(join(root, ".codex", "hooks.json"), JSON.stringify({ hooks: { Stop: [{ matcher: "", hooks: [{ type: "command", command: "user-stop" }] }] } }));
  write(join(root, ".claude", "settings.local.json"), JSON.stringify({
    env: { OTHER: "kept", CLAUDE_CODE_AUTO_COMPACT_WINDOW: "777777", CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "60" },
    hooks: { Stop: [{ hooks: [{ type: "command", command: "user-stop" }] }] },
  }));
  write(join(root, ".cursor", "hooks.json"), JSON.stringify({ version: 1, theme: "kept", hooks: { stop: [{ command: "user-stop" }] } }));
  write(join(root, ".github", "hooks", "universal-agent-skills.json"), JSON.stringify({ version: 1, owner: "kept", hooks: { agentStop: [{ command: "user-stop" }] } }));
  write(antigravitySettings, JSON.stringify({ theme: "kept" }));
  const claudeSettings = join(root, "claude-user-settings.json");
  write(claudeSettings, JSON.stringify({ theme: "kept" }));

  const args = {
    project: root,
    config,
    hosts: ["codex", "claude", "cursor", "copilot", "antigravity"],
    contextWindow: 128000,
    settingsPaths: { antigravity: antigravitySettings, claude: claudeSettings },
  };
  const first = installAdapters(args);
  assert.equal(first.every((item) => item.configured), true);
  assert.equal(first.every((item) => item.status === "Configured"), true);

  const codexConfigPath = join(root, ".codex", "config.toml");
  assert.match(readFileSync(codexConfigPath, "utf8"), /model_auto_compact_token_limit = 98000 # universal-agent-skills/);
  assert.match(readFileSync(codexConfigPath, "utf8"), /example = true/);
  const codexHooks = json(join(root, ".codex", "hooks.json"));
  assert.equal(codexHooks.hooks.Stop[0].hooks[0].command, "user-stop");
  assert.match(codexHooks.hooks.PreCompact[0].hooks[0].commandWindows, /-EncodedCommand/);
  assert.match(codexHooks.hooks.PreCompact[0].hooks[0].command, /\.agents\/universal-agent-skills\/runtime\/cli\.mjs/);
  assert.equal(codexHooks.hooks.PreCompact[0].hooks[0].command.includes(root), false);

  const claude = json(join(root, ".claude", "settings.local.json"));
  assert.equal(claude.env.OTHER, "kept");
  assert.equal(claude.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, "128000");
  assert.equal(claude.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, "75");
  assert.equal(claude.hooks.PreCompact.length, 1);

  const cursor = json(join(root, ".cursor", "hooks.json"));
  assert.equal(cursor.theme, "kept");
  assert.equal(cursor.hooks.preCompact.length, 1);
  assert.equal(Object.hasOwn(cursor, "thresholdTokens"), false);

  const copilot = json(join(root, ".github", "hooks", "universal-agent-skills.json"));
  assert.equal(copilot.owner, "kept");
  assert.equal(copilot.hooks.preCompact.length, 1);
  assert.equal(copilot.hooks.preCompact[0].cwd, ".");

  const antigravity = json(antigravitySettings);
  assert.equal(antigravity.theme, "kept");
  assert.equal(antigravity.statusLine.stack_with_default, true);
  assert.match(antigravity.statusLine.command, /statusline --project/);

  const claudeUser = json(claudeSettings);
  assert.equal(claudeUser.theme, "kept");
  assert.match(claudeUser.statusLine.command, /statusline --harness claude --project "\$\{CLAUDE_PROJECT_DIR\}"/);
  assert.equal(claudeUser.statusLine.command.includes(root), false);

  const managedFiles = [
    codexConfigPath,
    join(root, ".codex", "hooks.json"),
    join(root, ".claude", "settings.local.json"),
    join(root, ".cursor", "hooks.json"),
    join(root, ".github", "hooks", "universal-agent-skills.json"),
    antigravitySettings,
    claudeSettings,
  ];
  const beforeRepeat = managedFiles.map((path) => readFileSync(path, "utf8"));
  installAdapters(args);
  assert.deepEqual(managedFiles.map((path) => readFileSync(path, "utf8")), beforeRepeat);
  assert.equal(adapterStatus(root).every((item) => item.status === "Configured"), true);

  removeAdapters({ project: root, hosts: args.hosts });
  assert.match(readFileSync(codexConfigPath, "utf8"), /model_auto_compact_token_limit = 999/);
  assert.equal(json(join(root, ".codex", "hooks.json")).hooks.Stop[0].hooks[0].command, "user-stop");
  assert.deepEqual(json(claudeSettings), { theme: "kept" });
  const restoredClaude = json(join(root, ".claude", "settings.local.json"));
  assert.deepEqual(restoredClaude.env, {
    OTHER: "kept",
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: "777777",
    CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "60",
  });
  assert.equal(Object.hasOwn(restoredClaude.hooks, "PreCompact"), false);
  assert.equal(json(join(root, ".cursor", "hooks.json")).hooks.stop[0].command, "user-stop");
  assert.equal(json(join(root, ".github", "hooks", "universal-agent-skills.json")).hooks.agentStop[0].command, "user-stop");
  assert.deepEqual(json(antigravitySettings), { theme: "kept" });
  assert.equal(existsSync(join(root, ".agents", "universal-agent-skills", "adapters", "antigravity.json")), false);
});

test("re-running Claude setup without a context window restores the prior environment instead of leaving stale managed values", (t) => {
  const root = workspace(t, "uas-claude-window-cleanup-");
  const { config } = ensureConfig(root);
  write(join(root, ".claude", "settings.local.json"), JSON.stringify({
    env: { OTHER: "kept", CLAUDE_CODE_AUTO_COMPACT_WINDOW: "777777", CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "60" },
  }));

  installAdapters({ project: root, config, hosts: ["claude"], contextWindow: 128000 });
  const managed = json(join(root, ".claude", "settings.local.json"));
  assert.equal(managed.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, "128000");
  assert.equal(managed.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, "75");

  installAdapters({ project: root, config, hosts: ["claude"], contextWindow: null });
  const cleaned = json(join(root, ".claude", "settings.local.json"));
  assert.equal(cleaned.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, "777777", "stale managed window must not survive a re-setup with no detected context window");
  assert.equal(cleaned.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, "60", "stale managed percent override must not survive a re-setup with no detected context window");
  assert.equal(cleaned.env.OTHER, "kept");

  const status = adapterStatus(root).find((item) => item.host === "claude");
  assert.equal(status.thresholdSource, "unverified");
});

test("status reports a verified threshold source for Cursor, Copilot, and Antigravity when a context window was supplied", (t) => {
  const root = workspace(t, "uas-non-claude-threshold-source-");
  const { config } = ensureConfig(root);
  const antigravitySettings = join(root, "antigravity-settings.json");
  installAdapters({
    project: root,
    config,
    hosts: ["cursor", "copilot", "antigravity"],
    contextWindow: 128000,
    settingsPaths: { antigravity: antigravitySettings },
  });
  const status = adapterStatus(root);
  for (const host of ["cursor", "copilot", "antigravity"]) {
    const entry = status.find((item) => item.host === host);
    assert.equal(entry.thresholdSource, "setup-input", `${host} threshold source must reflect the supplied context window`);
  }
});

test("a Codex adapter state saved before managedScope/managedCodexHooks existed is still reported as configured", (t) => {
  const root = workspace(t, "uas-codex-legacy-state-");
  const { config } = ensureConfig(root);
  installAdapters({ project: root, config, hosts: ["codex"], contextWindow: 128000 });
  assert.equal(adapterStatus(root).find((item) => item.host === "codex").status, "Configured");

  const statePath = join(root, ".agents", "universal-agent-skills", "adapter-state.json");
  const state = json(statePath);
  delete state.hosts.codex.managedScope;
  delete state.hosts.codex.managedCodexHooks;
  write(statePath, JSON.stringify(state));

  assert.equal(adapterStatus(root).find((item) => item.host === "codex").status, "Configured");
});

test("installed Codex adapter resolves configured capacity and reports safe total accounting", (t) => {
  const root = workspace(t, "uas codex policy path with spaces-");
  initGit(root);
  const configPath = join(root, ".codex", "config.toml");
  write(configPath, [
    'model = "gpt-test"',
    "model_context_window = 200000",
    "model_auto_compact_token_limit = 999",
    'model_auto_compact_token_limit_scope = "body_after_prefix"',
    "",
    "[features]",
    "example = true",
    "",
  ].join("\n"));
  write(join(root, ".codex", "hooks.json"), JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: "command", command: "user-stop" }] }] },
  }));

  const setup = runCli(setupCli, ["setup", "--hosts", "codex", "--project", root], { cwd: root });
  assert.equal(setup.status, 0, setup.stderr);
  const adapter = JSON.parse(setup.stdout).adapters[0];
  assert.equal(adapter.threshold.detectedContextWindow, 200000);
  assert.equal(adapter.threshold.contextCapacitySource, "codex-config:model_context_window");
  assert.equal(adapter.threshold.accountingScope, "total");
  assert.equal(adapter.threshold.scopeConfidence, "safe-default");
  assert.equal(adapter.threshold.installedTokenLimit, 156000);
  assert.equal(adapter.threshold.reserveTokens, 44000);

  const configured = readFileSync(configPath, "utf8");
  assert.match(configured, /model_auto_compact_token_limit = 156000 # universal-agent-skills/);
  assert.match(configured, /model_auto_compact_token_limit_scope = "total" # universal-agent-skills/);
  assert.match(configured, /\[features\]\s+example = true/);
  const hooks = json(join(root, ".codex", "hooks.json"));
  assert.equal(hooks.hooks.Stop[0].hooks[0].command, "user-stop");
  assert.equal(hooks.hooks.SessionStart[0].hooks[0].additionalContextLimit, 500);

  const beforeRepeat = [configured, JSON.stringify(hooks)];
  const repeat = runCli(setupCli, ["setup", "--hosts", "codex", "--project", root], { cwd: root });
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.deepEqual(
    [readFileSync(configPath, "utf8"), JSON.stringify(json(join(root, ".codex", "hooks.json")))],
    beforeRepeat,
  );

  const installedCli = join(root, ".agents", "universal-agent-skills", "runtime", "cli.mjs");
  const driftedHooks = json(join(root, ".codex", "hooks.json"));
  delete driftedHooks.hooks.SessionStart;
  write(join(root, ".codex", "hooks.json"), JSON.stringify(driftedHooks));
  const hookDriftStatus = runCli(installedCli, ["status", "--project", root], { cwd: root });
  assert.equal(hookDriftStatus.status, 0, hookDriftStatus.stderr);
  assert.equal(JSON.parse(hookDriftStatus.stdout).adapters.find((item) => item.host === "codex").configurationDrift, true);
  assert.equal(runCli(setupCli, ["setup", "--hosts", "codex", "--project", root], { cwd: root }).status, 0);
  const repairedHooks = json(join(root, ".codex", "hooks.json"));
  assert.equal(repairedHooks.hooks.SessionStart[0].hooks[0].additionalContextLimit, 500);
  assert.equal(repairedHooks.hooks.Stop[0].hooks[0].command, "user-stop");

  write(configPath, configured.replace(/^model_auto_compact_token_limit_scope.*\r?\n/m, ""));
  const driftedStatus = runCli(installedCli, ["status", "--project", root], { cwd: root });
  assert.equal(driftedStatus.status, 0, driftedStatus.stderr);
  const codexStatus = JSON.parse(driftedStatus.stdout).adapters.find((item) => item.host === "codex");
  assert.equal(codexStatus.configured, false);
  assert.equal(codexStatus.configurationDrift, true);
  assert.equal(runCli(setupCli, ["setup", "--hosts", "codex", "--project", root], { cwd: root }).status, 0);

  const removed = runCli(installedCli, ["remove", "--hosts", "codex", "--project", root], { cwd: root });
  assert.equal(removed.status, 0, removed.stderr);
  const restored = readFileSync(configPath, "utf8");
  assert.match(restored, /model_auto_compact_token_limit = 999/);
  assert.match(restored, /model_auto_compact_token_limit_scope = "body_after_prefix"/);
  assert.match(restored, /\[features\]\s+example = true/);
  assert.equal(json(join(root, ".codex", "hooks.json")).hooks.Stop[0].hooks[0].command, "user-stop");
});

test("installed Codex adapter enables body-after-prefix accounting only with verified reserve", (t) => {
  const root = workspace(t, "uas-codex-prefix-");
  initGit(root);
  const configPath = join(root, ".codex", "config.toml");
  const evidencePath = join(root, ".agents", "codex-prefix-evidence.json");
  write(configPath, 'model = "gpt-test"\nmodel_context_window = 200000\n');
  write(evidencePath, JSON.stringify({
    kind: "codex-prefix-measurement",
    source: "observed active Codex session",
    model: "gpt-test",
    contextCapacity: 200000,
    prefixTokens: 20000,
    observedAt: "2026-09-03T00:00:00.000Z",
  }));
  const setup = runCli(setupCli, [
    "setup", "--hosts", "codex", "--codex-accounting-scope", "body_after_prefix",
    "--codex-prefix-tokens", "20000", "--codex-prefix-evidence", evidencePath, "--project", root,
  ], { cwd: root });
  assert.equal(setup.status, 0, setup.stderr);
  const threshold = JSON.parse(setup.stdout).adapters[0].threshold;
  assert.equal(threshold.accountingScope, "body_after_prefix");
  assert.equal(threshold.scopeConfidence, "evidence-verified-prefix");
  assert.equal(threshold.prefixTokens, 20000);
  assert.equal(threshold.prefixVerification.source, "observed active Codex session");
  assert.equal(threshold.prefixVerification.evidencePath, ".agents/codex-prefix-evidence.json");
  assert.equal(threshold.installedTokenLimit, 136000);
  assert.equal(threshold.reserveTokens, 44000);
  assert.match(readFileSync(configPath, "utf8"), /model_auto_compact_token_limit = 136000 # universal-agent-skills/);
  assert.match(readFileSync(configPath, "utf8"), /model_auto_compact_token_limit_scope = "body_after_prefix" # universal-agent-skills/);

  const unsafeRoot = workspace(t, "uas-codex-unverified-prefix-");
  initGit(unsafeRoot);
  const unsafeConfig = join(unsafeRoot, ".codex", "config.toml");
  write(unsafeConfig, 'model = "gpt-test"\nmodel_context_window = 200000\n');
  const before = readFileSync(unsafeConfig, "utf8");
  const rejected = runCli(setupCli, [
    "setup", "--hosts", "codex", "--codex-accounting-scope", "body_after_prefix",
    "--codex-prefix-tokens", "20000", "--project", unsafeRoot,
  ], { cwd: unsafeRoot });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /requires --codex-prefix-evidence/);
  assert.equal(readFileSync(unsafeConfig, "utf8"), before);

  const noModelRoot = workspace(t, "uas-codex-unknown-model-prefix-");
  initGit(noModelRoot);
  const noModelConfig = join(noModelRoot, ".codex", "config.toml");
  write(noModelConfig, "model_context_window = 200000\n");
  const noModelEvidencePath = join(noModelRoot, ".agents", "codex-prefix-evidence.json");
  write(noModelEvidencePath, JSON.stringify({
    kind: "codex-prefix-measurement",
    source: "observed active Codex session",
    model: "some-other-model",
    contextCapacity: 200000,
    prefixTokens: 20000,
    observedAt: "2026-09-03T00:00:00.000Z",
  }));
  const beforeNoModel = readFileSync(noModelConfig, "utf8");
  const rejectedUnknownModel = runCli(setupCli, [
    "setup", "--hosts", "codex", "--codex-accounting-scope", "body_after_prefix",
    "--codex-prefix-tokens", "20000", "--codex-prefix-evidence", noModelEvidencePath, "--project", noModelRoot,
  ], { cwd: noModelRoot });
  assert.equal(rejectedUnknownModel.status, 1, "prefix evidence must never be accepted when the active model cannot be verified from config.toml");
  assert.match(rejectedUnknownModel.stderr, /must match the active configuration/);
  assert.equal(readFileSync(noModelConfig, "utf8"), beforeNoModel);
});

test("installed Codex hooks continue one bound work item exactly once through compaction", (t) => {
  const root = workspace(t, "uas codex lifecycle path with spaces-");
  initGit(root);
  const setup = runCli(setupCli, [
    "setup", "--hosts", "codex", "--context-window", "200000", "--project", root,
  ], { cwd: root });
  assert.equal(setup.status, 0, setup.stderr);
  const installedCli = join(root, ".agents", "universal-agent-skills", "runtime", "cli.mjs");
  const activate = runCli(installedCli, [
    "activate", "--work-item", "issue-6", "--harness", "codex", "--session", "codex-session-a", "--project", root,
  ], { cwd: root });
  assert.equal(activate.status, 0, activate.stderr);
  const longText = "A".repeat(800);
  const checkpoint = runCli(installedCli, [
    "checkpoint", "--work-item", "issue-6", "--harness", "codex", "--session", "codex-session-a",
    "--expected-revision", "0",
    "--objective", `Keep objective ghp_abcdefghijklmnopqrstuvwxyz1234567890. ${longText}`,
    "--success-criteria", `Keep success criteria. ${longText}`,
    "--phase", `Implementation phase. ${longText}`,
    "--decisions", `Keep binding decisions. ${longText}`,
    "--validation", `npm test exits zero. ${longText}`,
    "--blockers", `No blockers. ${longText}`,
    "--next", `Implement the next slice. ${longText}`,
    "--pointers", "[README](README.md)",
    "--project", root,
  ], { cwd: root });
  assert.equal(checkpoint.status, 0, checkpoint.stderr);

  const hooks = json(join(root, ".codex", "hooks.json")).hooks;
  const handlers = Object.fromEntries(["PreCompact", "PostCompact", "SessionStart"].map((event) => [
    event, hooks[event][0].hooks[0],
  ]));
  const nested = join(root, "packages", "space app");
  mkdirSync(nested, { recursive: true });
  const common = { session_id: "codex-session-a", cwd: root, model: "gpt-5.5" };
  const pre = { ...common, hook_event_name: "PreCompact", turn_id: "turn-1", trigger: "auto" };
  const post = { ...common, hook_event_name: "PostCompact", turn_id: "turn-1", trigger: "auto" };
  const start = { ...common, hook_event_name: "SessionStart", source: "compact", permission_mode: "default" };

  for (const [event, payload] of [["PreCompact", pre], ["PreCompact", pre], ["PostCompact", post], ["PostCompact", post]]) {
    const invocation = runInstalledHook(handlers[event], nested, payload);
    assert.equal(invocation.status, 0, invocation.stderr);
    assert.doesNotThrow(() => JSON.parse(invocation.stdout));
  }
  const firstStart = runInstalledHook(handlers.SessionStart, nested, start);
  const duplicateStart = runInstalledHook(handlers.SessionStart, nested, start);
  assert.equal(firstStart.status, 0, firstStart.stderr);
  assert.equal(duplicateStart.status, 0, duplicateStart.stderr);
  const firstOutput = JSON.parse(firstStart.stdout);
  const duplicateOutput = JSON.parse(duplicateStart.stdout);
  const context = firstOutput.hookSpecificOutput.additionalContext;
  assert.equal(Buffer.byteLength(context, "utf8") <= 500, true);
  for (const label of ["Objective", "Success criteria", "Current phase", "Binding decisions", "Validation state", "Blockers", "Next action", "Authority pointers"]) {
    assert.match(context, new RegExp(`${label}:`));
  }
  assert.doesNotMatch(context, /ghp_abcdefghijklmnopqrstuvwxyz1234567890/);
  assert.match(context, /\[REDACTED_TOKEN\]/);
  assert.equal(Object.hasOwn(duplicateOutput, "hookSpecificOutput"), false);
  assert.match(duplicateOutput.systemMessage, /duplicate/i);

  const eventsPath = join(root, ".agents", "state", "continuity", "work-items", "issue-6", "events.jsonl");
  const events = readJsonLines(eventsPath);
  assert.deepEqual(events.map((event) => event.kind), ["pre-compact", "post-compact", "session-start-compact"]);
  assert.equal(new Set(events.map((event) => event.idempotencyKey)).size, 3);
  assert.equal(events[0].transition, "checkpoint-recorded");
  assert.equal(events[1].transition, "compaction-recorded");
  assert.equal(events[2].transition, "reconciled-and-injected");
  assert.equal(events[2].injectedTokenEstimate <= 500, true);
  assert.equal(events.every((event) => event.capsuleRevision === 1), true);
  assert.doesNotMatch(readFileSync(eventsPath, "utf8"), /permission_mode|Keep objective|ghp_/);

  const unbound = runInstalledHook(handlers.SessionStart, nested, {
    ...start, session_id: "unbound-session",
  });
  assert.equal(unbound.status, 0, unbound.stderr);
  const unboundOutput = JSON.parse(unbound.stdout);
  assert.equal(Object.hasOwn(unboundOutput, "hookSpecificOutput"), false);
  assert.match(unboundOutput.systemMessage, /No active work item/);
  assert.doesNotMatch(unbound.stdout, /Keep objective/);
  assert.equal(readJsonLines(eventsPath).length, 3);

  const capsule = readFileSync(join(root, ".agents", "state", "continuity", "work-items", "issue-6", "semantic.md"), "utf8");
  assert.match(capsule, /^revision: 1$/m);
});

test("installed Codex hooks fail open on malformed input, reconciliation drift, and storage errors", (t) => {
  const root = workspace(t, "uas codex degraded path with spaces-");
  initGit(root);
  const setup = runCli(setupCli, [
    "setup", "--hosts", "codex", "--context-window", "200000", "--project", root,
  ], { cwd: root });
  assert.equal(setup.status, 0, setup.stderr);
  const installedCli = join(root, ".agents", "universal-agent-skills", "runtime", "cli.mjs");
  assert.equal(runCli(installedCli, [
    "activate", "--work-item", "issue-6", "--harness", "codex", "--session", "codex-session-a", "--project", root,
  ], { cwd: root }).status, 0);
  assert.equal(runCli(installedCli, [
    "checkpoint", "--work-item", "issue-6", "--harness", "codex", "--session", "codex-session-a",
    "--expected-revision", "0", "--objective", "Continue safely.", "--project", root,
  ], { cwd: root }).status, 0);
  const hooks = json(join(root, ".codex", "hooks.json")).hooks;
  const preHandler = hooks.PreCompact[0].hooks[0];
  const postHandler = hooks.PostCompact[0].hooks[0];
  const startHandler = hooks.SessionStart[0].hooks[0];

  const malformed = runInstalledHook(preHandler, root, "{");
  assert.equal(malformed.status, 0, malformed.stderr);
  assert.match(JSON.parse(malformed.stdout).systemMessage, /degraded.*continues/i);

  const common = { session_id: "codex-session-a", cwd: root, model: "gpt-5.5", turn_id: "turn-1", trigger: "auto" };
  assert.equal(runInstalledHook(preHandler, root, { ...common, hook_event_name: "PreCompact" }).status, 0);
  assert.equal(runInstalledHook(postHandler, root, { ...common, hook_event_name: "PostCompact" }).status, 0);
  write(join(root, "advance.txt"), "advance\n");
  assert.equal(spawnSync("git", ["add", "advance.txt"], { cwd: root, windowsHide: true }).status, 0);
  assert.equal(spawnSync("git", ["commit", "-m", "advance"], { cwd: root, windowsHide: true }).status, 0);
  const drifted = runInstalledHook(startHandler, root, {
    session_id: "codex-session-a",
    cwd: root,
    model: "gpt-5.5",
    hook_event_name: "SessionStart",
    source: "compact",
  });
  assert.equal(drifted.status, 0, drifted.stderr);
  const driftedOutput = JSON.parse(drifted.stdout);
  assert.equal(Object.hasOwn(driftedOutput, "hookSpecificOutput"), true, "a git HEAD advance since the last checkpoint is normal drift, not a failure: the capsule must still be injected");
  assert.match(driftedOutput.hookSpecificOutput.additionalContext, /Continue safely\./);
  const driftedEventsPath = join(root, ".agents", "state", "continuity", "work-items", "issue-6", "events.jsonl");
  assert.equal(readJsonLines(driftedEventsPath).at(-1).reconciliation, "confirmed-with-drift");

  const storageRoot = workspace(t, "uas codex storage failure-");
  initGit(storageRoot);
  assert.equal(runCli(setupCli, [
    "setup", "--hosts", "codex", "--context-window", "200000", "--project", storageRoot,
  ], { cwd: storageRoot }).status, 0);
  const storageCli = join(storageRoot, ".agents", "universal-agent-skills", "runtime", "cli.mjs");
  assert.equal(runCli(storageCli, [
    "activate", "--work-item", "issue-6", "--harness", "codex", "--session", "storage-session", "--project", storageRoot,
  ], { cwd: storageRoot }).status, 0);
  const storageHooks = json(join(storageRoot, ".codex", "hooks.json")).hooks;
  const eventsPath = join(storageRoot, ".agents", "state", "continuity", "work-items", "issue-6", "events.jsonl");
  mkdirSync(eventsPath);
  const storageFailure = runInstalledHook(storageHooks.PreCompact[0].hooks[0], storageRoot, {
    session_id: "storage-session",
    cwd: storageRoot,
    model: "gpt-5.5",
    hook_event_name: "PreCompact",
    turn_id: "turn-storage",
    trigger: "auto",
  });
  assert.equal(storageFailure.status, 0, storageFailure.stderr);
  assert.match(JSON.parse(storageFailure.stdout).systemMessage, /degraded.*continues/i);
});

test("installed Claude hooks continue one bound work item exactly once through compaction", (t) => {
  const root = workspace(t, "uas claude lifecycle-");
  initGit(root);
  const installedCli = installFixtureRuntime(root);
  const activate = runCli(installedCli, [
    "activate", "--work-item", "issue-7", "--harness", "claude", "--session", "claude-session-a", "--project", root,
  ], { cwd: root });
  assert.equal(activate.status, 0, activate.stderr);
  const longText = "A".repeat(800);
  const checkpoint = runCli(installedCli, [
    "checkpoint", "--work-item", "issue-7", "--harness", "claude", "--session", "claude-session-a",
    "--expected-revision", "0",
    "--objective", `Keep objective ghp_abcdefghijklmnopqrstuvwxyz1234567890. ${longText}`,
    "--success-criteria", `Keep success criteria. ${longText}`,
    "--phase", `Implementation phase. ${longText}`,
    "--decisions", `Keep binding decisions. ${longText}`,
    "--validation", `npm test exits zero. ${longText}`,
    "--blockers", `No blockers. ${longText}`,
    "--next", `Implement the next slice. ${longText}`,
    "--pointers", "[README](README.md)",
    "--project", root,
  ], { cwd: root });
  assert.equal(checkpoint.status, 0, checkpoint.stderr);

  const common = { session_id: "claude-session-a", model: "claude-5", permission_mode: "default" };
  const pre = { ...common, hook_event_name: "PreCompact", turn_id: "turn-1", trigger: "auto" };
  const post = { ...common, hook_event_name: "PostCompact", turn_id: "turn-1", trigger: "auto" };
  const start = { ...common, hook_event_name: "SessionStart", source: "compact" };

  for (const [event, payload] of [["PreCompact", pre], ["PreCompact", pre], ["PostCompact", post], ["PostCompact", post]]) {
    const invocation = runCli(installedCli, ["hook", "claude", event, "--project", root], { cwd: root, stdin: JSON.stringify(payload) });
    assert.equal(invocation.status, 0, invocation.stderr);
    assert.doesNotThrow(() => JSON.parse(invocation.stdout));
  }
  const firstStart = runCli(installedCli, ["hook", "claude", "SessionStart", "--project", root], { cwd: root, stdin: JSON.stringify(start) });
  const duplicateStart = runCli(installedCli, ["hook", "claude", "SessionStart", "--project", root], { cwd: root, stdin: JSON.stringify(start) });
  assert.equal(firstStart.status, 0, firstStart.stderr);
  assert.equal(duplicateStart.status, 0, duplicateStart.stderr);
  const firstOutput = JSON.parse(firstStart.stdout);
  const duplicateOutput = JSON.parse(duplicateStart.stdout);
  const context = firstOutput.hookSpecificOutput.additionalContext;
  assert.equal(Buffer.byteLength(context, "utf8") <= 500, true);
  for (const label of ["Objective", "Success criteria", "Current phase", "Binding decisions", "Validation state", "Blockers", "Next action", "Authority pointers"]) {
    assert.match(context, new RegExp(`${label}:`));
  }
  assert.doesNotMatch(context, /ghp_abcdefghijklmnopqrstuvwxyz1234567890/);
  assert.match(context, /\[REDACTED_TOKEN\]/);
  assert.equal(Object.hasOwn(duplicateOutput, "hookSpecificOutput"), false);
  assert.match(duplicateOutput.systemMessage, /duplicate/i);

  const eventsPath = join(root, ".agents", "state", "continuity", "work-items", "issue-7", "events.jsonl");
  const events = readJsonLines(eventsPath);
  assert.deepEqual(events.map((event) => event.kind), ["pre-compact", "post-compact", "session-start-compact"]);
  assert.equal(new Set(events.map((event) => event.idempotencyKey)).size, 3);
  assert.equal(events[0].transition, "checkpoint-recorded");
  assert.equal(events[1].transition, "compaction-recorded");
  assert.equal(events[2].transition, "reconciled-and-injected");
  assert.equal(events[2].injectedTokenEstimate <= 500, true);
  assert.equal(events.every((event) => event.capsuleRevision === 1), true);
  assert.doesNotMatch(readFileSync(eventsPath, "utf8"), /Keep objective|ghp_|permission_mode/);

  const unbound = runCli(installedCli, ["hook", "claude", "SessionStart", "--project", root], {
    cwd: root, stdin: JSON.stringify({ ...start, session_id: "unbound-session" }),
  });
  assert.equal(unbound.status, 0, unbound.stderr);
  const unboundOutput = JSON.parse(unbound.stdout);
  assert.equal(Object.hasOwn(unboundOutput, "hookSpecificOutput"), false);
  assert.match(unboundOutput.systemMessage, /No active work item/);
  assert.doesNotMatch(unbound.stdout, /Keep objective/);
  assert.equal(readJsonLines(eventsPath).length, 3);

  const capsule = readFileSync(join(root, ".agents", "state", "continuity", "work-items", "issue-7", "semantic.md"), "utf8");
  assert.match(capsule, /^revision: 1$/m);
});

test("installed Claude hooks fail open on malformed input and storage errors, and inject despite reconciliation drift", (t) => {
  const root = workspace(t, "uas claude degraded-");
  initGit(root);
  const installedCli = installFixtureRuntime(root);
  assert.equal(runCli(installedCli, [
    "activate", "--work-item", "issue-7", "--harness", "claude", "--session", "claude-session-a", "--project", root,
  ], { cwd: root }).status, 0);
  assert.equal(runCli(installedCli, [
    "checkpoint", "--work-item", "issue-7", "--harness", "claude", "--session", "claude-session-a",
    "--expected-revision", "0", "--objective", "Continue safely.", "--project", root,
  ], { cwd: root }).status, 0);

  const malformed = runCli(installedCli, ["hook", "claude", "PreCompact", "--project", root], { cwd: root, stdin: "{" });
  assert.equal(malformed.status, 0, malformed.stderr);
  assert.match(JSON.parse(malformed.stdout).systemMessage, /degraded.*continues/i);

  const common = { session_id: "claude-session-a", model: "claude-5", turn_id: "turn-1", trigger: "auto" };
  assert.equal(runCli(installedCli, ["hook", "claude", "PreCompact", "--project", root], { cwd: root, stdin: JSON.stringify({ ...common, hook_event_name: "PreCompact" }) }).status, 0);
  assert.equal(runCli(installedCli, ["hook", "claude", "PostCompact", "--project", root], { cwd: root, stdin: JSON.stringify({ ...common, hook_event_name: "PostCompact" }) }).status, 0);
  write(join(root, "advance.txt"), "advance\n");
  assert.equal(spawnSync("git", ["add", "advance.txt"], { cwd: root, windowsHide: true }).status, 0);
  assert.equal(spawnSync("git", ["commit", "-m", "advance"], { cwd: root, windowsHide: true }).status, 0);
  const drifted = runCli(installedCli, ["hook", "claude", "SessionStart", "--project", root], {
    cwd: root,
    stdin: JSON.stringify({ session_id: "claude-session-a", model: "claude-5", hook_event_name: "SessionStart", source: "compact" }),
  });
  assert.equal(drifted.status, 0, drifted.stderr);
  const driftedOutput = JSON.parse(drifted.stdout);
  assert.equal(Object.hasOwn(driftedOutput, "hookSpecificOutput"), true, "a git HEAD advance since the last checkpoint is normal drift, not a failure: the capsule must still be injected");
  assert.match(driftedOutput.hookSpecificOutput.additionalContext, /Continue safely\./);
  const driftedEventsPath = join(root, ".agents", "state", "continuity", "work-items", "issue-7", "events.jsonl");
  assert.equal(readJsonLines(driftedEventsPath).at(-1).reconciliation, "confirmed-with-drift");

  const storageRoot = workspace(t, "uas claude storage failure-");
  initGit(storageRoot);
  const storageCli = installFixtureRuntime(storageRoot);
  assert.equal(runCli(storageCli, [
    "activate", "--work-item", "issue-7", "--harness", "claude", "--session", "storage-session", "--project", storageRoot,
  ], { cwd: storageRoot }).status, 0);
  const eventsPath = join(storageRoot, ".agents", "state", "continuity", "work-items", "issue-7", "events.jsonl");
  mkdirSync(eventsPath);
  const storageFailure = runCli(storageCli, ["hook", "claude", "PreCompact", "--project", storageRoot], {
    cwd: storageRoot,
    stdin: JSON.stringify({ session_id: "storage-session", model: "claude-5", hook_event_name: "PreCompact", turn_id: "turn-storage", trigger: "auto" }),
  });
  assert.equal(storageFailure.status, 0, storageFailure.stderr);
  assert.match(JSON.parse(storageFailure.stdout).systemMessage, /degraded.*continues/i);
});

test("Claude preserves an existing custom status line and reports it in the limitation", (t) => {
  const root = workspace(t);
  const { config } = ensureConfig(root);
  const settings = join(root, "claude-user-settings.json");
  write(settings, JSON.stringify({ statusLine: { type: "command", command: "my-status" }, theme: "kept" }));
  const [result] = installAdapters({
    project: root,
    config,
    hosts: ["claude"],
    contextWindow: 1000000,
    settingsPaths: { claude: settings },
  });
  // Window + hooks still install, so the adapter is configured; only the status line is skipped.
  assert.equal(result.configured, true);
  assert.equal(result.files.includes(settings), false);
  assert.match(result.limitation, /existing custom statusLine was preserved/);
  assert.equal(json(settings).statusLine.command, "my-status");
  removeAdapters({ project: root, hosts: ["claude"] });
  assert.deepEqual(json(settings), { statusLine: { type: "command", command: "my-status" }, theme: "kept" });
});

test("Claude status line labels telemetry per harness and keeps the Antigravity default", async (t) => {
  const root = workspace(t);
  ensureConfig(root);
  const payload = JSON.stringify({
    session_id: "s1",
    context_window: { context_window_size: 1000000, used_percentage: 8.7, current_usage: { input_tokens: 87000 } },
  });
  const claude = captureIo(payload);
  await main(["statusline", "--harness", "claude", "--project", root], claude.io);
  assert.equal(claude.writes.join("").trim(), "Claude 87000/780000");
  const antigravity = captureIo(payload);
  await main(["statusline", "--project", root], antigravity.io);
  assert.equal(antigravity.writes.join("").trim(), "UAS 87000/780000");
});

test("Antigravity preserves an existing custom status line and reports partial setup", (t) => {
  const root = workspace(t);
  const { config } = ensureConfig(root);
  const settings = join(root, "antigravity-settings.json");
  write(settings, JSON.stringify({ statusLine: { type: "command", command: "my-status" }, theme: "kept" }));
  const [result] = installAdapters({
    project: root,
    config,
    hosts: ["antigravity"],
    contextWindow: 1000000,
    settingsPaths: { antigravity: settings },
  });
  assert.equal(result.configured, false);
  assert.equal(result.status, "Detected with limitations");
  assert.equal(json(settings).statusLine.command, "my-status");
  const status = adapterStatus(root).find((item) => item.host === "antigravity");
  assert.equal(status.configured, false);
  assert.equal(status.status, "Detected with limitations");
  const helper = json(join(root, ".agents", "universal-agent-skills", "adapters", "antigravity.json"));
  assert.equal(helper.mode, "manual-compose-required");
  removeAdapters({ project: root, hosts: ["antigravity"] });
  assert.equal(json(settings).statusLine.command, "my-status");
});

test("CLI requires an explicit adapter choice but supports portable-only setup", async (t) => {
  const root = workspace(t);
  const omitted = captureIo();
  await main(["setup", "--project", root], omitted.io);
  assert.equal(omitted.exitCode, 2);
  assert.equal(existsSync(join(root, ".agents", "universal-agent-skills", "config.json")), false);

  const portable = captureIo();
  const result = await main(["setup", "--hosts", "none", "--project", root, "--context-window", "128000"], portable.io);
  assert.equal(result.ok, true);
  assert.equal(result.adapters.length, 0);
  assert.equal(result.threshold.effectiveTokens, 98000);
  assert.equal(existsSync(join(root, ".agents", "universal-agent-skills", "runtime", "cli.mjs")), true);
  assert.match(readFileSync(join(root, ".gitignore"), "utf8"), /\.agents\/state\/continuity\//);

  const configured = captureIo();
  await main(["setup", "--hosts", "cursor", "--project", root, "--context-window", "128000"], configured.io);
  const statusCapture = captureIo();
  const statusResult = await main(["status", "--project", root], statusCapture.io);
  assert.equal(statusResult.threshold.effectiveTokens, 98000);
  assert.equal(statusResult.threshold.currentSessionVerified, false);
  assert.match(statusResult.threshold.source, /stored setup input/);
  assert.equal(statusResult.adapters.find((item) => item.host === "cursor").installedThreshold.effectiveTokens, 98000);
});

test("adapter status detects drift and missing reversal state fails safely", async (t) => {
  const root = workspace(t, "uas $value tick's path-");
  initGit(root);
  const { config } = ensureConfig(root);
  const cursorArgs = { project: root, config, hosts: ["cursor"], contextWindow: 128000 };
  installAdapters(cursorArgs);
  const cursorPath = join(root, ".cursor", "hooks.json");
  assert.equal(adapterStatus(root).find((item) => item.host === "cursor").status, "Configured");
  unlinkSync(cursorPath);
  const drift = adapterStatus(root).find((item) => item.host === "cursor");
  assert.equal(drift.configured, false);
  assert.equal(drift.configurationDrift, true);
  assert.equal(drift.status, "Detected with limitations");

  write(join(root, ".codex", "config.toml"), "model_auto_compact_token_limit = 999\n");
  const original = readFileSync(join(root, ".codex", "config.toml"), "utf8");
  assert.throws(
    () => installAdapters({ project: root, config, hosts: ["codex", "bogus"], contextWindow: 128000 }),
    /Unknown host/,
  );
  assert.equal(readFileSync(join(root, ".codex", "config.toml"), "utf8"), original);

  const setupCapture = captureIo();
  const setupResult = await main(["setup", "--hosts", "codex", "--project", root, "--context-window", "128000"], setupCapture.io);
  assert.equal(setupResult.ok, true);
  const hooks = json(join(root, ".codex", "hooks.json"));
  const handler = hooks.hooks.PreCompact[0].hooks[0];
  assert.match(handler.command, /git rev-parse --show-toplevel/);
  assert.equal(handler.command.includes(root), false);
  assert.match(handler.commandWindows, /-EncodedCommand/);
  assert.equal(handler.commandWindows.includes(root), false);
  const nested = join(root, "packages", "nested");
  mkdirSync(nested, { recursive: true });
  const hookInput = JSON.stringify({ session_id: "unbound", turn_id: "turn-1", trigger: "auto" });
  const invocation = process.platform === "win32"
    ? spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", handler.commandWindows], { cwd: nested, input: hookInput, encoding: "utf8", windowsHide: true })
    : spawnSync("sh", ["-c", handler.command], { cwd: nested, input: hookInput, encoding: "utf8" });
  assert.equal(invocation.status, 0, invocation.stderr);
  assert.match(JSON.parse(invocation.stdout).systemMessage, /No active work item/);
  unlinkSync(join(root, ".agents", "universal-agent-skills", "adapter-state.json"));
  assert.throws(
    () => installAdapters({ project: root, config, hosts: ["codex"], contextWindow: 128000 }),
    /reversal state is missing/,
  );
  const removal = removeAdapters({ project: root, hosts: ["codex"] });
  assert.equal(removal[0].removed, false);
  assert.match(readFileSync(join(root, ".codex", "config.toml"), "utf8"), /98000 # universal-agent-skills/);
});

test("Cursor hook consumes native telemetry and keeps state at the configured project root", async (t) => {
  const root = workspace(t);
  ensureConfig(root);
  const nested = join(root, "packages", "app");
  mkdirSync(nested, { recursive: true });
  const capture = captureIo(JSON.stringify({ cwd: nested, context_tokens: 100000, context_window_size: 128000 }));
  await main(["hook", "cursor", "preCompact", "--project", root], capture.io);
  const output = JSON.parse(capture.writes.at(-1));
  assert.match(output.user_message, /100000\/128000/);
  assert.match(output.user_message, /policy threshold 98000/);
  assert.equal(existsSync(join(root, ".agents", "state", "continuity", "current.md")), true);
  assert.equal(existsSync(join(nested, ".agents")), false);
});

test("Antigravity status-line telemetry checkpoints and exports once per threshold crossing", async (t) => {
  const root = workspace(t);
  ensureConfig(root);
  const highPayload = JSON.stringify({
    conversation_id: "fixture-session",
    context_window: { context_window_size: 128000, used_percentage: 80 },
  });
  const first = captureIo(highPayload);
  const firstResult = await main(["statusline", "--project", root], first.io);
  assert.equal(firstResult.newlyCrossed, true);
  assert.match(first.writes.at(-1), /checkpoint \+ handoff saved/);
  assert.equal(existsSync(join(root, ".agents", "state", "continuity", "handoff-current.md")), true);

  const historyPath = join(root, ".agents", "state", "continuity", "history");
  const historyAfterFirst = readdirSync(historyPath).length;
  const second = captureIo(highPayload);
  const secondResult = await main(["statusline", "--project", root], second.io);
  assert.equal(secondResult.newlyCrossed, false);
  assert.equal(readdirSync(historyPath).length, historyAfterFirst);

  const low = captureIo(JSON.stringify({
    conversation_id: "fixture-session",
    context_window: { context_window_size: 128000, used_percentage: 50 },
  }));
  await main(["statusline", "--project", root], low.io);
  const third = captureIo(highPayload);
  const thirdResult = await main(["statusline", "--project", root], third.io);
  assert.equal(thirdResult.newlyCrossed, true);
  assert.equal(readdirSync(historyPath).length, historyAfterFirst + 1);
});
