#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repository = join(dirname(fileURLToPath(import.meta.url)), "..");
const promotedRoots = ["skills/engineering", "skills/productivity"];
const specificationKeys = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);
const hostExtensionKeys = new Set(["argument-hint", "disable-model-invocation"]);
const v1Skills = new Set([
  "frontend-design",
  "frontend-build",
  "frontend-review",
  "setup-universal-agent-skills",
  "checkpoint-work",
  "resume-work",
]);
const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function read(path) {
  return readFileSync(join(repository, path), "utf8");
}

function promotedSkills() {
  const values = [];
  for (const root of promotedRoots) {
    for (const entry of readdirSync(join(repository, root), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = `${root}/${entry.name}`;
      if (existsSync(join(repository, directory, "SKILL.md"))) values.push(directory);
    }
  }
  return values;
}

function parseFrontmatter(source, path) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    fail(`${path}: missing YAML frontmatter`);
    return { values: {}, keys: [] };
  }
  const values = {};
  const keys = [];
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z][a-z0-9-]*):(?:\s*(.*))?$/);
    if (!field) continue;
    keys.push(field[1]);
    values[field[1]] = (field[2] || "").trim().replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
  }
  return { values, keys };
}

const skills = promotedSkills();
const names = new Set();
for (const directory of skills) {
  const path = `${directory}/SKILL.md`;
  const source = read(path);
  const { values, keys } = parseFrontmatter(source, path);
  const expected = directory.split("/").at(-1);

  if (values.name !== expected) fail(`${path}: name must match parent directory (${expected})`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.name || "") || values.name.length > 64) {
    fail(`${path}: name violates the Agent Skills naming constraints`);
  }
  if (!values.description || values.description.length > 1024) fail(`${path}: description must contain 1-1024 characters`);
  if ((values.description || "").includes("<") || (values.description || "").includes(">")) {
    fail(`${path}: description contains angle brackets rejected by common skill validators`);
  }
  if (names.has(values.name)) fail(`${path}: duplicate promoted skill name ${values.name}`);
  names.add(values.name);

  for (const key of keys) {
    if (specificationKeys.has(key)) continue;
    if (hostExtensionKeys.has(key)) {
      warnings.push(`${path}: ${key} is a Claude Code extension, not portable Agent Skills metadata`);
    } else {
      fail(`${path}: unsupported frontmatter key ${key}`);
    }
  }

  if (!source.slice(source.indexOf("---", 3) + 3).trim()) fail(`${path}: empty instruction body`);
  if (/\bTODO\b|\bTBD\b/.test(source)) fail(`${path}: unresolved TODO/TBD marker`);

  const agentMetadata = `${directory}/agents/openai.yaml`;
  if (!existsSync(join(repository, agentMetadata))) fail(`${directory}: missing agents/openai.yaml`);
  else if (v1Skills.has(values.name)) {
    const metadata = read(agentMetadata);
    if (!metadata.includes(`$${values.name}`)) fail(`${agentMetadata}: default_prompt must explicitly invoke $${values.name}`);
  }

  const bucket = directory.includes("/engineering/") ? "engineering" : "productivity";
  const doc = `docs/${bucket}/${values.name}.md`;
  if (!existsSync(join(repository, doc))) fail(`${directory}: missing ${doc}`);
}

const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
const pluginPaths = new Set(plugin.skills.map((path) => path.replace(/^\.\//, "")));
const expectedPaths = new Set(skills);
for (const path of expectedPaths) if (!pluginPaths.has(path)) fail(`plugin manifest is missing ${path}`);
for (const path of pluginPaths) if (!expectedPaths.has(path)) fail(`plugin manifest promotes an unexpected skill: ${path}`);

const packageJson = JSON.parse(read("package.json"));
if (plugin.version !== packageJson.version) fail(`plugin version ${plugin.version} does not match package version ${packageJson.version}`);
if (plugin.name !== "universal-agent-skills") fail("plugin manifest is not rebranded");

const readme = read("README.md");
for (const directory of skills) {
  if (!readme.includes(`./${directory}/SKILL.md`)) fail(`README skill catalog is missing ${directory}`);
}

for (const directory of promotedRoots) {
  const source = read(`${directory}/README.md`);
  for (const skill of skills.filter((path) => path.startsWith(`${directory}/`))) {
    const name = skill.split("/").at(-1);
    if (!source.includes(`./${name}/SKILL.md`)) fail(`${directory}/README.md is missing ${name}`);
  }
}

const config = JSON.parse(read(".agents/universal-agent-skills/config.json"));
// Must match what the runtime's own migrateConfig canonically writes (key order included),
// or the first state-writing command "drifts" a freshly-checked-out repo.
const expectedConfig = {
  schemaVersion: 2,
  policy: {
    checkpointUtilization: 0.68,
    compactUtilization: 0.78,
    minimumReserveTokens: 30000,
    capsuleBudgetTokens: 500,
  },
  retention: {
    eventDays: 30,
    maxEvents: 200,
    historyDays: 30,
    maxHistory: 100,
    diagnosticDays: 30,
    maxDiagnostics: 200,
  },
  designRoot: "docs/design",
  stateRoot: ".agents/state/continuity",
  frontendDesignVariants: 3,
  phaseBoundaryCheckpointing: true,
};
if (JSON.stringify(config) !== JSON.stringify(expectedConfig)) fail("public config defaults drifted from the v1 contract");

// The skill package ships a copy of the runtime; a one-sided edit would silently ship a
// stale runtime to installers. npm test's check-runtime enforces this too, but validate
// must stay self-contained.
for (const name of ["core.mjs", "adapters.mjs", "cli.mjs"]) {
  if (read(`.agents/universal-agent-skills/runtime/${name}`) !== read(`skills/engineering/setup-universal-agent-skills/scripts/runtime/${name}`)) {
    fail(`runtime mirror is stale: skills/engineering/setup-universal-agent-skills/scripts/runtime/${name} differs from .agents/universal-agent-skills/runtime/${name}; run node scripts/sync-runtime.mjs`);
  }
}

const designTemplate = read("skills/engineering/frontend-design/references/DESIGN-CONTRACT.md");
for (const heading of [
  "Selected direction",
  "Design principles",
  "Tokens and typography",
  "Layout and responsive behavior",
  "Component anatomy",
  "States",
  "Interaction and motion",
  "Accessibility requirements",
  "Evidence",
  "Non-goals",
  "Implementation acceptance criteria",
]) {
  if (!designTemplate.includes(`## ${heading}`)) fail(`design contract is missing ${heading}`);
}

for (const path of [
  "skills/engineering",
  "skills/productivity",
  "docs/engineering",
  "docs/productivity",
  "README.md",
]) {
  const absolute = join(repository, path);
  const files = existsSync(absolute) && !absolute.endsWith(".md")
    ? walkMarkdown(absolute)
    : [absolute];
  for (const file of files) {
    if (readFileSync(file, "utf8").includes("setup-matt-pocock-skills")) {
      fail(`${relative(repository, file)} still points to the deprecated setup entry`);
    }
  }
}

for (const path of [
  ".agents/universal-agent-skills/runtime/core.mjs",
  ".agents/universal-agent-skills/runtime/adapters.mjs",
  ".agents/universal-agent-skills/runtime/cli.mjs",
]) {
  const source = read(path);
  for (const specifier of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    if (!specifier[1].startsWith("node:") && !specifier[1].startsWith("./")) {
      fail(`${path}: runtime dependency is not zero-dependency: ${specifier[1]}`);
    }
  }
}

function walkMarkdown(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdown(path));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
  }
  return files;
}

if (warnings.length > 0) {
  console.warn(`info: retained ${warnings.length} explicit Claude Code invocation fields on upstream-derived skills; portable Agent Skills fields were validated separately.`);
}
if (errors.length > 0) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}

console.log(`Validated ${skills.length} promoted skills, plugin/docs consistency, design schema, config defaults, and zero-dependency runtime imports.`);
