import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  ensureConfig,
  ensureGitignore,
  exportHandoff,
  parseFrontmatter,
  reconcileCheckpoint,
  redactSensitive,
  saveCheckpoint,
  validateConfig,
  validateCheckpoint,
} from "../.agents/universal-agent-skills/runtime/core.mjs";
import {
  adapterStatus,
  installAdapters,
  removeAdapters,
} from "../.agents/universal-agent-skills/runtime/adapters.mjs";
import { main } from "../.agents/universal-agent-skills/runtime/cli.mjs";

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

function installFixtureRuntime(root, contextWindow = 200000) {
  const setup = runCli(setupCli, ["setup", "--hosts", "none", "--context-window", String(contextWindow), "--project", root], { cwd: root });
  assert.equal(setup.status, 0, setup.stderr);
  return join(root, ".agents", "universal-agent-skills", "runtime", "cli.mjs");
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

test("installed CLI accepts an explicit work item without a session binding", (t) => {
  const root = workspace(t, "uas-explicit-work-item-");
  initGit(root);
  const installedCli = installFixtureRuntime(root);
  const activate = runCli(installedCli, [
    "activate", "--work-item", "issue-4", "--harness", "codex", "--session", "initial-session", "--project", root,
  ], { cwd: root });
  assert.equal(activate.status, 0, activate.stderr);

  const checkpoint = runCli(installedCli, [
    "checkpoint", "--work-item", "issue-4", "--objective", "Explicit identity wins.", "--project", root,
  ], { cwd: root });
  assert.equal(checkpoint.status, 0, checkpoint.stderr);
  assert.equal(JSON.parse(checkpoint.stdout).resolution, "explicit");
  const capsule = readFileSync(join(root, ".agents", "state", "continuity", "work-items", "issue-4", "semantic.md"), "utf8");
  assert.match(capsule, /^updatedByHarness: other$/m);
  assert.match(capsule, /^updatedBySession: manual$/m);
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
  ], { cwd: root, stdin: JSON.stringify({ session_id: "unbound-session" }) });
  assert.equal(hook.status, 0, hook.stderr);
  const hookContext = JSON.parse(hook.stdout).hookSpecificOutput.additionalContext;
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
  await main(["hook", "codex", "PreCompact", "--project", root], preCompact.io);
  const afterDocument = readFileSync(join(root, config.stateRoot, "current.md"), "utf8");
  const after = parseFrontmatter(afterDocument);
  assert.equal(after.timestamp, before.timestamp);
  assert.equal(after.gitHead, before.gitHead);
  assert.equal(after.validationGitHead, before.validationGitHead);
  assert.equal(after.lastObservedEvent, "pre-compact");
  assert.equal(reconcileCheckpoint(root, config).ok, false);

  const sessionStart = captureIo();
  await main(["hook", "codex", "SessionStart", "--project", root], sessionStart.io);
  const injected = JSON.parse(sessionStart.writes.at(-1));
  assert.match(injected.hookSpecificOutput.additionalContext, /was not activated/i);
  assert.match(injected.hookSpecificOutput.additionalContext, /No active work item/i);
  assert.doesNotMatch(injected.hookSpecificOutput.additionalContext, /Keep the validation claim/);
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
  const invocation = process.platform === "win32"
    ? spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", handler.commandWindows], { cwd: nested, input: "{}", encoding: "utf8", windowsHide: true })
    : spawnSync("sh", ["-c", handler.command], { cwd: nested, input: "{}", encoding: "utf8" });
  assert.equal(invocation.status, 0, invocation.stderr);
  assert.match(invocation.stdout, /Continuity checkpoint saved/);
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
