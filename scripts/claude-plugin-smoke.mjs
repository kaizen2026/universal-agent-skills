#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "uas-claude-plugin-"));
const project = join(scratch, "project with spaces");
mkdirSync(project);
const env = { ...process.env, CLAUDE_CONFIG_DIR: join(scratch, "config"), DISABLE_AUTOUPDATER: "1" };
const windowsNpx = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
const executable = process.platform === "win32" ? process.execPath : "npx";
const prefix = process.platform === "win32" ? [windowsNpx] : [];
// Version exercised by this smoke test. Updating it is an explicit compatibility check.
const cli = ["--yes", "@anthropic-ai/claude-code@2.1.266"];

function run(args) {
  const result = spawnSync(executable, [...prefix, ...cli, ...args], {
    cwd: project, env, encoding: "utf8", windowsHide: true, timeout: 120000,
  });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stdout}\n${result.stderr || result.error || ""}`);
  return result.stdout;
}

try {
  run(["plugin", "validate", join(repository, ".claude-plugin", "marketplace.json"), "--strict"]);
  const validation = JSON.parse(run(["plugin", "validate", join(repository, ".claude-plugin", "plugin.json"), "--json"]));
  assert.equal(validation.success, true);
  const warnings = [validation.manifest, ...validation.contents].flatMap(item => item?.warnings || []);
  // Repository-author guidance intentionally remains at the root; consumers use skills.
  for (const warning of warnings) {
    assert.equal(warning.path, "root");
    assert.equal(warning.message, "CLAUDE.md at the plugin root is not loaded as project context. To ship context with your plugin, use a skill (skills/<name>/SKILL.md) instead.");
  }
  run(["plugin", "marketplace", "add", repository, "--scope", "local"]);
  run(["plugin", "install", "universal-agent-skills@universal-agent-skills", "--scope", "local"]);
  const listing = JSON.parse(run(["plugin", "list", "--json"]));
  const installed = (Array.isArray(listing) ? listing : listing.installed || listing.plugins || []).find(item => item.id === "universal-agent-skills@universal-agent-skills");
  assert.ok(installed, "Claude must list the installed plugin");
  assert.equal(installed.enabled, true);
  assert.ok(installed.installPath, "Claude must report the plugin cache path");
  const manifest = JSON.parse(readFileSync(join(installed.installPath, ".claude-plugin", "plugin.json"), "utf8"));
  const sourceManifest = JSON.parse(readFileSync(join(repository, ".claude-plugin", "plugin.json"), "utf8"));
  assert.deepEqual(manifest.skills, sourceManifest.skills, "installed skill catalog must match the source manifest");
  for (const skill of manifest.skills) assert.ok(existsSync(join(installed.installPath, skill, "SKILL.md")), `${skill} missing in Claude's plugin cache`);
  const advisorDirectory = join(installed.installPath, "skills", "engineering", "prompt-engineer");
  assert.ok(existsSync(join(advisorDirectory, "references", "EXCHANGE.md")));
  const probe = spawnSync(process.execPath, [join(advisorDirectory, "scripts", "exchange.mjs"), "status", "--project", project, "--work-item", "smoke"], { encoding: "utf8", windowsHide: true });
  assert.equal(probe.status, 0, probe.stderr);
  assert.deepEqual(JSON.parse(probe.stdout).reports, []);
  const implementDirectory = join(installed.installPath, "skills", "engineering", "implement");
  assert.ok(readFileSync(join(implementDirectory, "references", "TASK-PROGRESS.md")).equals(readFileSync(join(repository, "skills", "engineering", "implement", "references", "TASK-PROGRESS.md"))), "native checklist instructions must be present in the plugin cache");
  const progressProbe = spawnSync(process.execPath, [join(repository, "scripts", "task-progress-smoke.mjs"), "--helper", join(implementDirectory, "scripts", "exchange.mjs")], { encoding: "utf8", windowsHide: true, timeout: 30000 });
  assert.equal(progressProbe.status, 0, progressProbe.stderr);
  assert.equal(JSON.parse(progressProbe.stdout).result, "passed");
  console.log(`Claude Code 2.1.266: marketplace and plugin validated; ${manifest.skills.length} skills installed in an isolated config. No model calls made.`);
  console.log("Installed Implement checklist instructions and v3 progress exchange passed; native model invocation/rendering is not tested.");
  if (warnings.length) console.log("Expected authoring note: root CLAUDE.md is repository guidance, not consumer context.");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
