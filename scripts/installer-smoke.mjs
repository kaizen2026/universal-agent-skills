#!/usr/bin/env node
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "uas-installer-smoke-"));
const windowsNpxCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
const command = process.platform === "win32" ? process.execPath : "npx";
const commandPrefix = process.platform === "win32" ? [windowsNpxCli] : [];
const required = [
  "frontend-design",
  "frontend-build",
  "frontend-review",
  "setup-universal-agent-skills",
  "checkpoint-work",
  "resume-work",
];

try {
  const discovered = run(["--yes", "skills@latest", "add", repository, "--list", "--full-depth"], repository);
  for (const name of required) {
    if (!stripAnsi(discovered).includes(name)) throw new Error(`skills CLI discovery did not include ${name}`);
  }

  run([
    "--yes",
    "skills@latest",
    "add",
    repository,
    "--skill",
    "checkpoint-work",
    "--skill",
    "frontend-design",
    "--agent",
    "codex",
    "claude-code",
    "cursor",
    "github-copilot",
    "antigravity",
    "antigravity-cli",
    "--copy",
    "--yes",
    "--full-depth",
  ], scratch);

  const installed = findSkillNames(scratch);
  for (const name of ["checkpoint-work", "frontend-design"]) {
    if (!installed.has(name)) throw new Error(`project install did not materialize ${name}`);
  }
  if (installed.has("handoff")) throw new Error("selective install unexpectedly installed handoff");
  if (!existsSync(join(scratch, "skills-lock.json"))) throw new Error("project install did not create skills-lock.json");

  const list = JSON.parse(run(["--yes", "skills@latest", "list", "--json"], scratch));
  const serialized = JSON.stringify(list);
  for (const name of ["checkpoint-work", "frontend-design"]) {
    if (!serialized.includes(name)) throw new Error(`skills list did not report ${name}`);
  }

  run(["--yes", "skills@latest", "update", "--project", "--yes"], scratch);

  if (process.env.UAS_RUN_GLOBAL_INSTALLER_SMOKE === "1") {
    run([
      "--yes",
      "skills@latest",
      "add",
      repository,
      "--global",
      "--agent",
      "codex",
      "--skill",
      "resume-work",
      "--copy",
      "--yes",
      "--full-depth",
    ], scratch);
    try {
      const globalList = run(["--yes", "skills@latest", "list", "--global", "--agent", "codex", "--json"], scratch);
      if (!globalList.includes("resume-work")) throw new Error("global install did not report resume-work");
    } finally {
      run(["--yes", "skills@latest", "remove", "--global", "--agent", "codex", "--skill", "resume-work", "--yes"], scratch);
    }
  }

  console.log(`skills CLI discovered ${required.length} v1 skills and passed selective install/update smoke tests for six target agents.`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

function run(args, cwd) {
  const result = spawnSync(command, [...commandPrefix, ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${[...commandPrefix, ...args].join(" ")}\n${result.stdout}\n${result.stderr || result.error || ""}`);
  }
  return result.stdout;
}

function findSkillNames(root) {
  const names = new Set();
  for (const path of walk(root)) {
    if (path.endsWith(`${separator()}SKILL.md`)) names.add(path.split(separator()).at(-2));
  }
  return names;
}

function walk(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function separator() {
  return process.platform === "win32" ? "\\" : "/";
}

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-?]*[ -\/]*[@-~]/g, "");
}
